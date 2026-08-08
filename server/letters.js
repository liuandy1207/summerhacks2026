// Everything for the "letters" feature: writing, picking up, reacting,
// redropping, voting, reporting, journey history, and the pocket list of
// letters a user currently holds. Exports one router mounted twice by
// server/index.js (at /api/letters and /api/pocket).
const express = require('express');
const db = require('./db');
const PARAMS = require('./config');
const { now, uid, haversineKm, getOrCreateUser, moderateAndTag } = require('./shared');

// ---- shared letter logic (used by multiple routes below) -----------------

// letters this user currently holds (picked up, not yet redropped)
async function heldLettersCount(userId) {
  const { count, error } = await db
    .from('pickup_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('redropped_at', null);
  if (error) throw error;
  return count;
}

async function latestDropOf(letterId) {
  const { data, error } = await db
    .from('drop_events')
    .select('*')
    .eq('letter_id', letterId)
    .order('dropped_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// process any letters this user is holding past the auto-redrop window
async function processAutoRedrops(userId) {
  const cutoff = new Date(Date.now() - PARAMS.AUTO_REDROP_HOURS * 3600000).toISOString();
  const { data: overdue, error } = await db
    .from('pickup_events')
    .select('*')
    .eq('user_id', userId)
    .is('redropped_at', null)
    .lte('picked_up_at', cutoff);
  if (error) throw error;

  const { data: user, error: userErr } = await db
    .from('users').select('*').eq('id', userId).maybeSingle();
  if (userErr) throw userErr;
  if (!user || user.last_lat == null) return;

  for (const pe of overdue) {
    await redropLetter(pe.letter_id, userId, user.last_lat, user.last_lng, true);
  }
}

async function redropLetter(letterId, userId, lat, lng, isAuto) {
  const { data: openPickup, error: opErr } = await db
    .from('pickup_events')
    .select('*')
    .eq('letter_id', letterId)
    .eq('user_id', userId)
    .is('redropped_at', null)
    .maybeSingle();
  if (opErr) throw opErr;
  if (!openPickup) return { error: 'not_holding_letter' };

  const prevDrop = await latestDropOf(letterId);
  const dist = prevDrop ? haversineKm(prevDrop.lat, prevDrop.lng, lat, lng) : 0;

  const { error: insErr } = await db.from('drop_events').insert({
    id: uid(), letter_id: letterId, user_id: userId, lat, lng,
    dropped_at: now(), is_auto_redrop: !!isAuto
  });
  if (insErr) throw insErr;

  const { error: updErr } = await db
    .from('pickup_events').update({ redropped_at: now() }).eq('id', openPickup.id);
  if (updErr) throw updErr;

  const { data: letter, error: letErr } = await db
    .from('letters').select('total_distance_km').eq('id', letterId).single();
  if (letErr) throw letErr;
  const { error: distErr } = await db
    .from('letters')
    .update({ total_distance_km: (letter.total_distance_km || 0) + dist })
    .eq('id', letterId);
  if (distErr) throw distErr;

  return { ok: true, distance_km: dist, auto: !!isAuto };
}

// ---- routes ----------------------------------------------------------------

const router = express.Router();

// wraps an async route handler so thrown/rejected errors reach express
// instead of crashing the process
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// POST /api/letters — write a new letter into your pocket (not dropped yet)
// body: { user_id, lat, lng, text, title }
router.post('/', wrap(async (req, res) => {
  const { user_id, lat, lng, text, title } = req.body;
  if (!user_id || lat == null || lng == null || !text || !text.trim()) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const trimmedTitle = (title || '').trim();
  if (trimmedTitle.length > PARAMS.MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: 'title_too_long', max_title_length: PARAMS.MAX_TITLE_LENGTH });
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < PARAMS.MIN_WORDS) {
    return res.status(400).json({ error: 'too_short', min_words: PARAMS.MIN_WORDS });
  }
  if (wordCount > PARAMS.MAX_WORDS) {
    return res.status(400).json({ error: 'too_long', max_words: PARAMS.MAX_WORDS });
  }

  await getOrCreateUser(user_id, lat, lng);
  await processAutoRedrops(user_id);

  if (await heldLettersCount(user_id) >= PARAMS.MAX_HELD_LETTERS) {
    return res.status(409).json({ error: 'pocket_full', limit: PARAMS.MAX_HELD_LETTERS });
  }

  const mod = moderateAndTag(text);
  if (mod.flagged) {
    return res.status(422).json({ error: 'flagged', reason: mod.flag_reason });
  }

  const letterId = uid();
  const { error: insLetterErr } = await db.from('letters').insert({
    id: letterId, title: trimmedTitle || null, text: text.trim(), word_count: wordCount,
    preview_line: mod.preview_line, status: 'active', created_at: now(),
    hands_count: 0, total_distance_km: 0, upvotes: 0, downvotes: 0, origin_user_id: user_id
  });
  if (insLetterErr) throw insLetterErr;

  const { error: insPickupErr } = await db.from('pickup_events').insert({
    id: uid(), letter_id: letterId, user_id, picked_up_at: now()
  });
  if (insPickupErr) throw insPickupErr;

  res.json({ id: letterId, title: trimmedTitle || null });
}));

// GET /api/letters/:id/journey — only if user has ever picked it up
router.get('/:id/journey', wrap(async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;

  const { data: everHeld, error: heldErr } = await db
    .from('pickup_events').select('id').eq('letter_id', id).eq('user_id', user_id).limit(1).maybeSingle();
  if (heldErr) throw heldErr;
  if (!everHeld) return res.status(403).json({ error: 'must_have_picked_up_to_view_journey' });

  const { data: letter, error: letErr } = await db.from('letters').select('*').eq('id', id).single();
  if (letErr) throw letErr;
  const { data: drops, error: dropErr } = await db
    .from('drop_events').select('*').eq('letter_id', id).order('dropped_at', { ascending: true });
  if (dropErr) throw dropErr;
  const { data: pickups, error: pickErr } = await db
    .from('pickup_events').select('*').eq('letter_id', id).order('picked_up_at', { ascending: true });
  if (pickErr) throw pickErr;

  const events = [
    { type: "written", at: letter.created_at },
    ...drops.map((d, i) => ({
      type: d.is_auto_redrop
        ? "auto_redropped"
        : i === 0
          ? "dropped"
          : "redropped",
      at: d.dropped_at,
    })),
    ...pickups.map((p) => ({
      type: "picked_up",
      at: p.picked_up_at,
      reaction: p.reaction,
    })),
  ]
    .filter((e, i, arr) => !(e.type === "written" && i > 0))
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const totalMs = Date.now() - new Date(letter.created_at).getTime();

  res.json({
    letter_id: id,
    hands_count: letter.hands_count,
    total_distance_km: Math.round(letter.total_distance_km * 100) / 100,
    traveling_since: letter.created_at,
    traveling_duration_hours: Math.round(totalMs / 3600000 * 10) / 10,
    events
  });
}));

// POST /api/letters/:id/pickup   body: { user_id, lat, lng }
router.post('/:id/pickup', wrap(async (req, res) => {
  const { id } = req.params;
  const { user_id, lat, lng } = req.body;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });

  const { data: letter, error: letErr } = await db.from('letters').select('*').eq('id', id).maybeSingle();
  if (letErr) throw letErr;
  if (!letter || letter.status !== 'active') return res.status(404).json({ error: 'not_found' });

  await getOrCreateUser(user_id, lat, lng);
  await processAutoRedrops(user_id);

  if (await heldLettersCount(user_id) >= PARAMS.MAX_HELD_LETTERS) {
    return res.status(409).json({ error: 'pocket_full', limit: PARAMS.MAX_HELD_LETTERS });
  }

  const drop = await latestDropOf(id);
  const distM = haversineKm(lat, lng, drop.lat, drop.lng) * 1000;
  if (distM > PARAMS.PICKUP_RADIUS_M) {
    return res.status(409).json({ error: 'too_far', distance_m: Math.round(distM) });
  }

  // same-person-pickup block (kept as an explicit, easy-to-flip check for later)
  const SAME_PERSON_PICKUP_ALLOWED = false;
  if (!SAME_PERSON_PICKUP_ALLOWED && drop.user_id === user_id) {
    return res.status(409).json({ error: 'cannot_pickup_own_last_drop' });
  }

  const { error: insErr } = await db.from('pickup_events').insert({
    id: uid(), letter_id: id, user_id, picked_up_at: now()
  });
  if (insErr) throw insErr;

  const { error: updErr } = await db
    .from('letters').update({ hands_count: letter.hands_count + 1 }).eq('id', id);
  if (updErr) throw updErr;

  res.json({
    id: letter.id,
    text: letter.text,
    hands_count: letter.hands_count + 1
  });
}));

// POST /api/letters/:id/react   body: { user_id, reaction }
router.post('/:id/react', wrap(async (req, res) => {
  const { id } = req.params;
  const { user_id, reaction } = req.body;
  const { data: pe, error: peErr } = await db
    .from('pickup_events')
    .select('*')
    .eq('letter_id', id).eq('user_id', user_id)
    .order('picked_up_at', { ascending: false })
    .limit(1).maybeSingle();
  if (peErr) throw peErr;
  if (!pe) return res.status(404).json({ error: 'no_pickup_found' });

  const { error: updErr } = await db.from('pickup_events').update({ reaction }).eq('id', pe.id);
  if (updErr) throw updErr;
  res.json({ ok: true });
}));

// POST /api/letters/:id/redrop   body: { user_id, lat, lng }
router.post('/:id/redrop', wrap(async (req, res) => {
  const { id } = req.params;
  const { user_id, lat, lng } = req.body;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });

  await getOrCreateUser(user_id, lat, lng);
  const result = await redropLetter(id, user_id, lat, lng, false);
  if (result.error) return res.status(409).json(result);
  res.json(result);
}));

// POST /api/letters/:id/vote   body: { direction: 'up' | 'down' }
router.post('/:id/vote', wrap(async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;
  const col = direction === 'up' ? 'upvotes' : 'downvotes';

  const { data: current, error: curErr } = await db.from('letters').select('*').eq('id', id).single();
  if (curErr) throw curErr;

  const { error: updErr } = await db
    .from('letters').update({ [col]: (current[col] || 0) + 1 }).eq('id', id);
  if (updErr) throw updErr;

  const { data: letter, error: letErr } = await db.from('letters').select('*').eq('id', id).single();
  if (letErr) throw letErr;
  const ageHours = (Date.now() - new Date(letter.created_at).getTime()) / 3600000;
  if (letter.downvotes >= PARAMS.LOST_DOWNVOTE_THRESHOLD && ageHours >= PARAMS.LOST_MIN_AGE_HOURS) {
    const { error: lostErr } = await db.from('letters').update({ status: 'lost' }).eq('id', id);
    if (lostErr) throw lostErr;
  }
  res.json({ ok: true });
}));

// POST /api/letters/:id/report   body: { reason, reported_by }
router.post('/:id/report', wrap(async (req, res) => {
  const { id } = req.params;
  const { reason, reported_by } = req.body;
  const { error } = await db.from('reports').insert({
    id: uid(), letter_id: id, reason: reason || null, reported_by: reported_by || null, created_at: now()
  });
  if (error) throw error;
  res.json({ ok: true });
}));

// GET /api/pocket — letters currently held by a given user. Mounted
// separately (see server/index.js) so this stays under /api/pocket.
const pocketRouter = express.Router();

pocketRouter.get('/', wrap(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing_fields' });

  await processAutoRedrops(user_id);

  const { data: held, error } = await db
    .from('pickup_events')
    .select('id, picked_up_at, letters!inner(id, preview_line, hands_count)')
    .eq('user_id', user_id)
    .is('redropped_at', null)
    .order('picked_up_at', { ascending: true });
  if (error) throw error;

  // drop_count per letter needs a separate query — Supabase can't easily do
  // a correlated subquery count through the JS client
  const withDeadlines = await Promise.all(held.map(async h => {
    const { count, error: cErr } = await db
      .from('drop_events')
      .select('*', { count: 'exact', head: true })
      .eq('letter_id', h.letters.id);
    if (cErr) throw cErr;
    return {
      pickup_id: h.id,
      picked_up_at: h.picked_up_at,
      letter_id: h.letters.id,
      preview_line: h.letters.preview_line,
      hands_count: h.letters.hands_count,
      has_been_dropped: count > 0,
      auto_redrop_at: new Date(new Date(h.picked_up_at).getTime() + PARAMS.AUTO_REDROP_HOURS * 3600000).toISOString()
    };
  }));

  res.json({ letters: withDeadlines, slots_used: held.length, slots_max: PARAMS.MAX_HELD_LETTERS });
}));

module.exports = {
  lettersRouter: router,
  pocketRouter,
  // exposed for map.js, which also needs to run auto-redrop processing
  // and look up a letter's current position
  processAutoRedrops,
  latestDropOf
};
