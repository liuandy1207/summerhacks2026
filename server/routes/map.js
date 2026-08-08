// GET /api/map — fog-of-war nearby letters for the map view.
const express = require('express');
const db = require('../db');
const PARAMS = require('../config');
const { haversineKm } = require('../utils/geo');
const { getOrCreateUser } = require('../services/users');
const { processAutoRedrops, latestDropOf } = require('../services/letters');

const router = express.Router();

// GET /api/map?user_id=&lat=&lng=
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

    const base = {
      id: letter.id,
      distance_m: Math.round(distKm * 1000),
      hands_count: letter.hands_count,
      traveling_days: Math.max(0, Math.round(travelingDays * 10) / 10),
      can_pick_up: withinPickupRange
    };
    if (withinPickupRange) {
      base.preview_line = letter.preview_line;
      base.tone_tag = letter.tone_tag;
    }
    return base;
  }).filter(Boolean);

  res.json({ letters: results, params: PARAMS });
});

module.exports = router;
