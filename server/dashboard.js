// GET /api/dashboard — hero stats for the Data Intelligence track.
const express = require('express');
const db = require('./db');

const router = express.Router();

router.get('/', (req, res) => {
  const totals = db.prepare(`SELECT
      COALESCE(SUM(total_distance_km),0) as total_distance_km,
      COALESCE(SUM(hands_count),0) as total_hands,
      COUNT(*) as total_letters,
      COALESCE(AVG(hands_count),0) as avg_hands_per_letter
    FROM letters`).get();

  const reactionCounts = db.prepare(`
    SELECT reaction, COUNT(*) c FROM pickup_events
    WHERE reaction IS NOT NULL GROUP BY reaction`).all();

  const toneCounts = db.prepare(`
    SELECT tone_tag, COUNT(*) c FROM letters GROUP BY tone_tag`).all();

  res.json({
    total_distance_km: Math.round(totals.total_distance_km * 10) / 10,
    total_hands: totals.total_hands,
    total_letters: totals.total_letters,
    avg_hands_per_letter: Math.round(totals.avg_hands_per_letter * 10) / 10,
    reaction_counts: reactionCounts,
    tone_counts: toneCounts
  });
});

module.exports = router;
