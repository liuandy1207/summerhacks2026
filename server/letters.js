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
function heldLettersCount(userId) {
  return db.prepare(
    `SELECT COUNT(*) c FROM pickup_events WHERE user_id = ? AND redropped_at IS NULL`
  ).get(userId).c;
}

function latestDropOf(letterId) {
  return db.prepare(
    `SELECT * FROM drop_events WHERE letter_id = ? ORDER BY dropped_at DESC LIMIT 1`
  ).get(letterId);
}

// process any letters this user is holding past the auto-redrop window
function processAutoRedrops(userId) {
  const overdue = db.prepare(`
    SELECT pe.* FROM pickup_events pe
    WHERE pe.user_id = ? AND pe.redropped_at IS NULL
      AND datetime(pe.picked_up_at, '+${PARAMS.AUTO_REDROP_HOURS} hours') <= datetime('now')
  `).all(userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.last_lat == null) return;

  for (const pe of overdue) {
    redropLetter(pe.letter_id, userId, user.last_lat, user.last_lng, true);
  }
}

function redropLetter(letterId, userId, lat, lng, isAuto) {
  const openPickup = db.prepare(
    `SELECT * FROM pickup_events WHERE letter_id = ? AND user_id = ? AND redropped_at IS NULL`
  ).get(letterId, userId);
  if (!openPickup) return { error: 'not_holding_letter' };

  const prevDrop = latestDropOf(letterId);
  const dist = prevDrop ? haversineKm(prevDrop.lat, prevDrop.lng, lat, lng) : 0;

  db.prepare(`INSERT INTO drop_events (id, letter_id, user_id, lat, lng, dropped_at, is_auto_redrop)
              VALUES (?,?,?,?,?,?,?)`)
    .run(uid(), letterId, userId, lat, lng, now(), isAuto ? 1 : 0);

  db.prepare(`UPDATE pickup_events SET redropped_at = ? WHERE id = ?`).run(now(), openPickup.id);

  db.prepare(`UPDATE letters SET total_distance_km = total_distance_km + ? WHERE id = ?`)
    .run(dist, letterId);

  return { ok: true, distance_km: dist, auto: !!isAuto };
}

// ---- routes ----------------------------------------------------------------

const router = express.Router();

// POST /api/letters — write a new letter into your pocket (not dropped yet)
// body: { user_id, lat, lng, text, title }
router.post('/', (req, res) => {
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

  getOrCreateUser(user_id, lat, lng);
  processAutoRedrops(user_id);

  if (heldLettersCount(user_id) >= PARAMS.MAX_HELD_LETTERS) {
    return res.status(409).json({ error: 'pocket_full', limit: PARAMS.MAX_HELD_LETTERS });
  }

  const mod = moderateAndTag(text);
  if (mod.flagged) {
    return res.status(422).json({ error: 'flagged', reason: mod.flag_reason });
  }

  const letterId = uid();
  db.prepare(`INSERT INTO letters
    (id, title, text, word_count, preview_line, status, created_at, hands_count, total_distance_km, upvotes, downvotes, origin_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(letterId, trimmedTitle || null, text.trim(), wordCount, mod.preview_line, 'active', now(), 0, 0, 0, 0, user_id);

  db.prepare(`INSERT INTO pickup_events (id, letter_id, user_id, picked_up_at) VALUES (?,?,?,?)`)
    .run(uid(), letterId, user_id, now());

  res.json({ id: letterId, title: trimmedTitle || null });
});

// GET /api/letters/:id/journey — only if user has ever picked it up
router.get('/:id/journey', (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;

  const everHeld = db.prepare(
    `SELECT 1 FROM pickup_events WHERE letter_id = ? AND user_id = ? LIMIT 1`
  ).get(id, user_id);
  if (!everHeld) return res.status(403).json({ error: 'must_have_picked_up_to_view_journey' });

  const letter = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  const drops = db.prepare('SELECT * FROM drop_events WHERE letter_id = ? ORDER BY dropped_at ASC').all(id);
  const pickups = db.prepare('SELECT * FROM pickup_events WHERE letter_id = ? ORDER BY picked_up_at ASC').all(id);

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
});

// POST /api/letters/:id/pickup   body: { user_id, lat, lng }
router.post('/:id/pickup', (req, res) => {
  const { id } = req.params;
  const { user_id, lat, lng } = req.body;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });

  const letter = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  if (!letter || letter.status !== 'active') return res.status(404).json({ error: 'not_found' });

  getOrCreateUser(user_id, lat, lng);
  processAutoRedrops(user_id);

  if (heldLettersCount(user_id) >= PARAMS.MAX_HELD_LETTERS) {
    return res.status(409).json({ error: 'pocket_full', limit: PARAMS.MAX_HELD_LETTERS });
  }

  const drop = latestDropOf(id);
  const distM = haversineKm(lat, lng, drop.lat, drop.lng) * 1000;
  if (distM > PARAMS.PICKUP_RADIUS_M) {
    return res.status(409).json({ error: 'too_far', distance_m: Math.round(distM) });
  }

  // same-person-pickup block (kept as an explicit, easy-to-flip check for later)
  const SAME_PERSON_PICKUP_ALLOWED = false;
  if (!SAME_PERSON_PICKUP_ALLOWED && drop.user_id === user_id) {
    return res.status(409).json({ error: 'cannot_pickup_own_last_drop' });
  }

  db.prepare(`INSERT INTO pickup_events (id, letter_id, user_id, picked_up_at) VALUES (?,?,?,?)`)
    .run(uid(), id, user_id, now());
  db.prepare(`UPDATE letters SET hands_count = hands_count + 1 WHERE id = ?`).run(id);

  res.json({
    id: letter.id,
    text: letter.text,
    hands_count: letter.hands_count + 1
  });
});

// POST /api/letters/:id/react   body: { user_id, reaction }
router.post('/:id/react', (req, res) => {
  const { id } = req.params;
  const { user_id, reaction } = req.body;
  const pe = db.prepare(
    `SELECT * FROM pickup_events WHERE letter_id = ? AND user_id = ? ORDER BY picked_up_at DESC LIMIT 1`
  ).get(id, user_id);
  if (!pe) return res.status(404).json({ error: 'no_pickup_found' });

  db.prepare(`UPDATE pickup_events SET reaction = ? WHERE id = ?`).run(reaction, pe.id);
  res.json({ ok: true });
});

// POST /api/letters/:id/redrop   body: { user_id, lat, lng }
router.post('/:id/redrop', (req, res) => {
  const { id } = req.params;
  const { user_id, lat, lng } = req.body;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });

  getOrCreateUser(user_id, lat, lng);
  const result = redropLetter(id, user_id, lat, lng, false);
  if (result.error) return res.status(409).json(result);
  res.json(result);
});

// POST /api/letters/:id/vote   body: { direction: 'up' | 'down' }
router.post('/:id/vote', (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;
  const col = direction === 'up' ? 'upvotes' : 'downvotes';
  db.prepare(`UPDATE letters SET ${col} = ${col} + 1 WHERE id = ?`).run(id);

  const letter = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  const ageHours = (Date.now() - new Date(letter.created_at).getTime()) / 3600000;
  if (letter.downvotes >= PARAMS.LOST_DOWNVOTE_THRESHOLD && ageHours >= PARAMS.LOST_MIN_AGE_HOURS) {
    db.prepare(`UPDATE letters SET status = 'lost' WHERE id = ?`).run(id);
  }
  res.json({ ok: true });
});

// POST /api/letters/:id/report   body: { reason, reported_by }
router.post('/:id/report', (req, res) => {
  const { id } = req.params;
  const { reason, reported_by } = req.body;
  db.prepare(`INSERT INTO reports (id, letter_id, reason, reported_by, created_at) VALUES (?,?,?,?,?)`)
    .run(uid(), id, reason || null, reported_by || null, now());
  res.json({ ok: true });
});

// GET /api/pocket — letters currently held by a given user. Mounted
// separately (see server/index.js) so this stays under /api/pocket.
const pocketRouter = express.Router();

pocketRouter.get('/', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing_fields' });

  processAutoRedrops(user_id);

  const held = db.prepare(`
    SELECT pe.id as pickup_id, pe.picked_up_at, l.id as letter_id, l.preview_line, l.hands_count,
      (SELECT COUNT(*) FROM drop_events de WHERE de.letter_id = l.id) as drop_count
    FROM pickup_events pe
    JOIN letters l ON l.id = pe.letter_id
    WHERE pe.user_id = ? AND pe.redropped_at IS NULL
    ORDER BY pe.picked_up_at ASC
  `).all(user_id);

  const withDeadlines = held.map(h => ({
    ...h,
    has_been_dropped: h.drop_count > 0,
    auto_redrop_at: new Date(new Date(h.picked_up_at).getTime() + PARAMS.AUTO_REDROP_HOURS * 3600000).toISOString()
  }));

  res.json({ letters: withDeadlines, slots_used: held.length, slots_max: PARAMS.MAX_HELD_LETTERS });
});

module.exports = {
  lettersRouter: router,
  pocketRouter,
  // exposed for map.js, which also needs to run auto-redrop processing
  // and look up a letter's current position
  processAutoRedrops,
  latestDropOf
};