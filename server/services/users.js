const db = require('../db');
const { now } = require('../utils/ids');

function getOrCreateUser(userId, lat, lng) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (id, created_at, last_lat, last_lng) VALUES (?,?,?,?)')
      .run(userId, now(), lat ?? null, lng ?? null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  } else if (lat != null && lng != null) {
    db.prepare('UPDATE users SET last_lat = ?, last_lng = ? WHERE id = ?').run(lat, lng, userId);
  }
  return user;
}

module.exports = { getOrCreateUser };
