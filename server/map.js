// GET /api/map — fog-of-war letter positions around a user's location.
const express = require('express');
const db = require('./db');
const PARAMS = require('./config');
const { haversineKm, boundingBox, getOrCreateUser } = require('./shared');
const { processAutoRedrops } = require('./letters');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const { user_id, lat, lng } = req.query;
  if (!user_id || lat == null || lng == null) return res.status(400).json({ error: 'missing_fields' });
  const ulat = parseFloat(lat), ulng = parseFloat(lng);

  await getOrCreateUser(user_id, ulat, ulng);
  await processAutoRedrops(user_id);

  // Pre-filter in SQL: only the latest drop per letter, only ones inside a
  // bounding box around the user, only for letters still active. This
  // replaces pulling every active letter + a per-letter drop_events query.
  const box = boundingBox(ulat, ulng, PARAMS.FOG_RADIUS_KM);
  const { data: nearbyDrops, error } = await db
    .from('latest_drops')
    .select('letter_id, lat, lng, dropped_at, user_id, letters!inner(id, status, hands_count, preview_line, origin_user_id)')
    .eq('letters.status', 'active')
    .gte('lat', box.minLat).lte('lat', box.maxLat)
    .gte('lng', box.minLng).lte('lng', box.maxLng);
  if (error) throw error;

  // Bounding box overshoots at the corners, so still confirm with real
  // distance — but now against a handful of rows, not every active letter.
  const results = nearbyDrops.map(drop => {
    const distKm = haversineKm(ulat, ulng, drop.lat, drop.lng);
    if (distKm > PARAMS.FOG_RADIUS_KM) return null;

    const travelingDays = (Date.now() - new Date(drop.dropped_at).getTime()) / 86400000;
    const withinPickupRange = distKm * 1000 <= PARAMS.PICKUP_RADIUS_M;
    const isOwnDrop = drop.user_id === user_id;
    const isAuthoredByYou = drop.letters.origin_user_id === user_id;

    return {
      id: drop.letters.id,
      distance_m: Math.round(distKm * 1000),
      hands_count: drop.letters.hands_count,
      traveling_days: Math.max(0, Math.round(travelingDays * 10) / 10),
      can_pick_up: withinPickupRange,
      is_own_drop: isOwnDrop,
      is_authored_by_you: isAuthoredByYou,
      lat: drop.lat,
      lng: drop.lng,
      preview_line: drop.letters.preview_line
    };
  }).filter(Boolean);

  res.json({ letters: results, params: PARAMS });
}));

module.exports = router;