// SQLite connection + schema. This is the only file that should contain
// CREATE TABLE statements — keep schema changes centralized here.
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', 'loop.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_lat REAL,
  last_lng REAL
);

CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  tone_tag TEXT,
  preview_line TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | lost
  created_at TEXT NOT NULL,
  hands_count INTEGER NOT NULL DEFAULT 0,
  total_distance_km REAL NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  origin_user_id TEXT NOT NULL
);

-- Every time a letter lands somewhere (initial write, manual redrop, or auto-redrop)
CREATE TABLE IF NOT EXISTS drop_events (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  dropped_at TEXT NOT NULL,
  is_auto_redrop INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);

-- Every time a letter is picked up. redropped_at IS NULL means user is currently holding it.
CREATE TABLE IF NOT EXISTS pickup_events (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  picked_up_at TEXT NOT NULL,
  reaction TEXT,
  redropped_at TEXT,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  letter_id TEXT NOT NULL,
  reason TEXT,
  reported_by TEXT,
  created_at TEXT NOT NULL
);
`);

module.exports = db;
