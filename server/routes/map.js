const express = require('express');
const db = require('../db');
const PARAMS = require('../config');
const { haversineKm } = require('../utils/geo');
const { getOrCreateUser } = require('../services/users');
const { processAutoRedrops, latestDropOf } = require('../services/letters');

const router = express.Router();

// Deterministic angle from a letter's real position — stable across requests,
// independent of who's asking or where they're standing.
function hashToAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return (h * Math.PI) / 180;
}

// Fuzzed position for fog-of-war letters: a small fixed offset from the
// real drop point, seeded by the letter's own id so it never moves again
// once computed — regardless of the viewer's location.
function fuzzedPosition(letter, drop) {
  const angle = hashToAngle(letter.id);
  const FUZZ_RADIUS_M = 150; // how far the fake pin can sit from the real spot
  const latOffset = (FUZZ_RADIUS_M / 111320) * Math.cos(angle);
  const lngOffset = (FUZZ_RADIUS_M / (111320 * Math.cos(drop.lat * Math.PI / 180))) * Math.sin(angle);
  return { lat: drop.lat + latOffset, lng: drop.lng + lngOffset };
}

router.get('/', (req, res) => {
  const { user_id, lat, lng } = req.query;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });
  const ulat = parseFloat(lat), ulng = parseFloat(lng);

  getOrCreateUser(user_id, ulat, ulng);
  processAutoRedrops(user_id);

  const activeLetters = db.prepare(`SELECT * FROM letters WHERE status = 'active'`).all();

  const results = activeLetters.map(letter => {
    const drop = latestDropOf(letter.id);
    if (!drop) return null;
    const distKm = haversineKm(ulat, ulng, drop.lat, drop.lng);
    if (distKm > PARAMS.FOG_RADIUS_KM) return null;

    const travelingDays = (Date.now() - new Date(drop.dropped_at).getTime()) / 86400000;
    const withinPickupRange = distKm * 1000 <= PARAMS.PICKUP_RADIUS_M;
    const isOwnDrop = drop.user_id === user_id;
    const revealExact = withinPickupRange || isOwnDrop;

    const pos = revealExact ? { lat: drop.lat, lng: drop.lng } : fuzzedPosition(letter, drop);

    const base = {
      id: letter.id,
      distance_m: Math.round(distKm * 1000),
      hands_count: letter.hands_count,
      traveling_days: Math.max(0, Math.round(travelingDays * 10) / 10),
      can_pick_up: withinPickupRange,
      is_own_drop: isOwnDrop,
      lat: pos.lat,
      lng: pos.lng
    };
    if (revealExact) {
      base.preview_line = letter.preview_line;
      base.tone_tag = letter.tone_tag;
    }
    return base;
  }).filter(Boolean);

  res.json({ letters: results, params: PARAMS });
});

module.exports = router;