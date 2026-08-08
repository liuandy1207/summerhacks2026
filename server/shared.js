// Small helpers shared by every feature file (letters.js, map.js). Kept in
// one place so a feature file only needs `require('./shared')` instead of
// reaching into several tiny utility modules.
const crypto = require('crypto');
const db = require('./db');

// ---- ids / time --------------------------------------------------------
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

// ---- geo ----------------------------------------------------------------
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- users ----------------------------------------------------------------
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

// ---- moderation (STUB: replace with a real LLM call later) ---------------
// The system prompt to use when you do:
//
// "You classify anonymous letters for a public letter-exchange app. Given the
// letter text, return JSON only:
// { tone_tag: one of [hopeful, reflective, nostalgic, calm, heavy],
//   flagged: boolean, flag_reason: string|null, preview_line: string }
// flagged=true if the letter contains personal identifying info (names,
// addresses, phone numbers), harassment, or content indicating the author
// may be in crisis or at risk of self-harm. preview_line is a 6-10 word
// anonymized teaser with no identifying details, safe to show on a public
// map pin before pickup."
//
// IMPORTANT: if you ever wire up real self-harm flagging, do NOT just silently
// block the letter — route it to a human-reviewed support flow instead.
const BAD_WORDS = [
  // minimal placeholder list — swap for a real profanity/hate-speech list
  'slur1', 'slur2', 'hateword1'
];

const TONES = ['hopeful', 'reflective', 'nostalgic', 'calm', 'heavy'];

function moderateAndTag(text) {
  const lower = text.toLowerCase();
  const hitBadWord = BAD_WORDS.some(w => lower.includes(w));

  // extremely naive placeholder heuristic — replace with LLM classification
  let tone_tag = 'reflective';
  if (/hope|excited|can't wait|grateful|thank/i.test(text)) tone_tag = 'hopeful';
  else if (/miss|remember|used to|back then/i.test(text)) tone_tag = 'nostalgic';
  else if (/calm|peace|quiet|breathe/i.test(text)) tone_tag = 'calm';
  else if (/hard|heavy|hurt|lost|tired|alone/i.test(text)) tone_tag = 'heavy';

  const words = text.trim().split(/\s+/);
  const preview_line = words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '');

  return {
    flagged: hitBadWord,
    flag_reason: hitBadWord ? 'blocked_word' : null,
    tone_tag,
    preview_line
  };
}

module.exports = { now, uid, haversineKm, getOrCreateUser, moderateAndTag, TONES };
