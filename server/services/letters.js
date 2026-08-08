// Shared letter/pocket business logic used by multiple routes
// (map, letters, pocket). Keep route handlers thin and put
// anything reusable or stateful here.
const db = require('../db');
const PARAMS = require('../config');
const { now, uid } = require('../utils/ids');
const { haversineKm } = require('../utils/geo');

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

module.exports = { heldLettersCount, latestDropOf, processAutoRedrops, redropLetter };
