// All /api/letters/* routes: write, pickup, react, redrop, vote, report, journey.
const express = require('express');
const db = require('../db');
const PARAMS = require('../config');
const { now, uid } = require('../utils/ids');
const { haversineKm } = require('../utils/geo');
const { moderateAndTag } = require('../moderation');
const { getOrCreateUser } = require('../services/users');
const { heldLettersCount, latestDropOf, processAutoRedrops, redropLetter } = require('../services/letters');

const router = express.Router();

// POST /api/letters — write + drop a new letter
// body: { user_id, lat, lng, text }
router.post('/', (req, res) => {
  const { user_id, lat, lng, text } = req.body;
  if (!user_id || lat == null || lng == null || !text || !text.trim()) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const wordCount = text.trim().split(/\s+/).length;
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
    (id, text, word_count, tone_tag, preview_line, status, created_at, hands_count, total_distance_km, upvotes, downvotes, origin_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(letterId, text.trim(), wordCount, mod.tone_tag, mod.preview_line, 'active', now(), 0, 0, 0, 0, user_id);

  db.prepare(`INSERT INTO drop_events (id, letter_id, user_id, lat, lng, dropped_at, is_auto_redrop)
              VALUES (?,?,?,?,?,?,0)`)
    .run(uid(), letterId, user_id, lat, lng, now());

  // Note: writing a letter drops it immediately — it never occupies the
  // writer's pocket. Only picked-up-and-not-yet-redropped letters count
  // toward MAX_HELD_LETTERS.

  res.json({ id: letterId, tone_tag: mod.tone_tag });
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
    { type: 'written', at: letter.created_at },
    ...drops.map(d => ({ type: d.is_auto_redrop ? 'auto_redropped' : (d.dropped_at === letter.created_at ? 'written' : 'redropped'), at: d.dropped_at })),
    ...pickups.map(p => ({ type: 'picked_up', at: p.picked_up_at, reaction: p.reaction }))
  ].filter((e, i, arr) => !(e.type === 'written' && i > 0))
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
    tone_tag: letter.tone_tag,
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

module.exports = router;
