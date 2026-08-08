// GET /api/map — fog-of-war letter positions around a user's location.
const express = require('express');
const db = require('./db');
const PARAMS = require('./config');
const { haversineKm, getOrCreateUser } = require('./shared');
const { processAutoRedrops, latestDropOf } = require('./letters');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const { user_id, lat, lng } = req.query;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });
  const ulat = parseFloat(lat), ulng = parseFloat(lng);

  await getOrCreateUser(user_id, ulat, ulng);
  await processAutoRedrops(user_id);

  const { data: activeLetters, error } = await db.from('letters').select('*').eq('status', 'active');
  if (error) throw error;

  const results = (await Promise.all(activeLetters.map(async letter => {
    const drop = await latestDropOf(letter.id);
    if (!drop) return null;
    const distKm = haversineKm(ulat, ulng, drop.lat, drop.lng);
    if (distKm > PARAMS.FOG_RADIUS_KM) return null;

    const travelingDays = (Date.now() - new Date(drop.dropped_at).getTime()) / 86400000;
    const withinPickupRange = distKm * 1000 <= PARAMS.PICKUP_RADIUS_M;
    const isOwnDrop = drop.user_id === user_id;

    const base = {
      id: letter.id,
      distance_m: Math.round(distKm * 1000),
      hands_count: letter.hands_count,
      traveling_days: Math.max(0, Math.round(travelingDays * 10) / 10),
      can_pick_up: withinPickupRange,
      is_own_drop: isOwnDrop,
      lat: drop.lat,
      lng: drop.lng,
      preview_line: letter.preview_line
    };
    return base;
  }))).filter(Boolean);

  res.json({ letters: results, params: PARAMS });
}));

module.exports = router;