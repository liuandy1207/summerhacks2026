// GET /api/dashboard — hero stats for the Data Intelligence track.
const express = require('express');
const db = require('./db');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const { data: letters, error: letErr } = await db
    .from('letters').select('total_distance_km, hands_count');
  if (letErr) throw letErr;

  const total_distance_km = letters.reduce((s, l) => s + (l.total_distance_km || 0), 0);
  const total_hands = letters.reduce((s, l) => s + (l.hands_count || 0), 0);
  const total_letters = letters.length;
  const avg_hands_per_letter = total_letters ? total_hands / total_letters : 0;

  const { data: reactions, error: reactErr } = await db
    .from('pickup_events').select('reaction').not('reaction', 'is', null);
  if (reactErr) throw reactErr;

  const counts = {};
  for (const r of reactions) counts[r.reaction] = (counts[r.reaction] || 0) + 1;
  const reaction_counts = Object.entries(counts).map(([reaction, c]) => ({ reaction, c }));

  res.json({
    total_distance_km: Math.round(total_distance_km * 10) / 10,
    total_hands,
    total_letters,
    avg_hands_per_letter: Math.round(avg_hands_per_letter * 10) / 10,
    reaction_counts
  });
}));

module.exports = router;
