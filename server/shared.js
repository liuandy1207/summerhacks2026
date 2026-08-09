// Small helpers shared by every feature file (letters.js, map.js). Kept in
// one place so a feature file only needs `require('./shared')` instead of
// reaching into several tiny utility modules.
const crypto = require('crypto');
const db = require('./db');
const PARAMS = require('./config');

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

// Rough lat/lng box containing everything within radiusKm of (lat, lng).
// Cheap SQL-side pre-filter — overshoots slightly at the corners, so
// callers should still haversine-check results before treating them as
// "within radius".
function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180) || 1);
  return {
    minLat: lat - latDelta, maxLat: lat + latDelta,
    minLng: lng - lngDelta, maxLng: lng + lngDelta
  };
}

// ---- users ----------------------------------------------------------------
// NOTE: now async — every call site must `await` this.
async function getOrCreateUser(userId, lat, lng) {
  const { data: existing, error: selErr } = await db
    .from('users').select('*').eq('id', userId).maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { data: created, error: insErr } = await db
      .from('users')
      .insert({ id: userId, created_at: now(), last_lat: lat ?? null, last_lng: lng ?? null })
      .select().single();
    if (insErr) throw insErr;
    return created;
  }

  if (lat != null && lng != null) {
    const { data: updated, error: updErr } = await db
      .from('users').update({ last_lat: lat, last_lng: lng }).eq('id', userId).select().single();
    if (updErr) throw updErr;
    return updated;
  }

  return existing;
}

// ---- moderation ------------------------------------------------------------
// 3-tier result: 'block' (rejected, nothing saved), 'flag' (saved but held
// for review, kept off the public map), 'clean' (saved as-is).
//
// IMPORTANT: self-harm content should never be silently blocked — it's
// classified as 'flag' (a human reviews it) rather than 'block', so a
// letter from someone in crisis doesn't just vanish with a generic error.
const BAD_WORDS = [
  // fallback-only placeholder list, used when OPENAI_API_KEY isn't set —
  // swap for a real profanity/hate-speech list if you rely on this path
  'slur1', 'slur2', 'hateword1'
];

function previewLine(text) {
  const words = text.trim().split(/\s+/);
  return words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '');
}

function keywordModerate(text) {
  const lower = text.toLowerCase();
  const hit = BAD_WORDS.find(w => lower.includes(w));
  return {
    tier: hit ? 'block' : 'clean',
    reason: hit ? 'blocked_word' : null,
    preview_line: previewLine(text)
  };
}

async function openAiModerate(text) {
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text })
  });
  if (!res.ok) throw new Error(`moderation_api_${res.status}`);

  const data = await res.json();
  const result = data.results[0];
  const scores = result.category_scores || {};
  const [topCategory, topScore] = Object.entries(scores)
    .reduce((best, entry) => entry[1] > best[1] ? entry : best, ['none', 0]);

  let tier = 'clean';
  if (topScore >= PARAMS.MODERATION_BLOCK_THRESHOLD) tier = 'block';
  else if (topScore >= PARAMS.MODERATION_FLAG_THRESHOLD) tier = 'flag';

  return {
    tier,
    reason: tier === 'clean' ? null : topCategory,
    preview_line: previewLine(text)
  };
}

// Returns { tier: 'block'|'flag'|'clean', reason: string|null, preview_line }
async function moderateText(text) {
  if (!process.env.OPENAI_API_KEY) return keywordModerate(text);

  try {
    return await openAiModerate(text);
  } catch (err) {
    // Fail closed to 'flag', not 'block' — a moderation outage shouldn't
    // silently publish unfiltered content, but it also shouldn't hard-reject
    // every letter your users write while the API is down.
    //
    // Logged as plain strings (not the raw Error object) — some log
    // dashboards mangle nested fetch errors (Node wraps network failures
    // in a `cause` chain) when they try to pretty-print them directly.
    console.error('moderateText: OpenAI moderation call failed, flagging for review');
    console.error('  name:', err && err.name);
    console.error('  message:', err && err.message);
    console.error('  cause:', err && err.cause ? String(err.cause) : 'none');
    return { tier: 'flag', reason: 'moderation_api_error', preview_line: previewLine(text) };
  }
}

module.exports = { now, uid, haversineKm, boundingBox, getOrCreateUser, moderateText };