// GET /api/pocket — letters currently held by a given user.
const express = require('express');
const db = require('../db');
const PARAMS = require('../config');
const { processAutoRedrops } = require('../services/letters');

const router = express.Router();

router.get('/', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing_fields' });

  processAutoRedrops(user_id);

  const held = db.prepare(`
    SELECT pe.id as pickup_id, pe.picked_up_at, l.id as letter_id, l.preview_line, l.tone_tag, l.hands_count,
      (SELECT COUNT(*) FROM drop_events de WHERE de.letter_id = l.id) as drop_count
    FROM pickup_events pe
    JOIN letters l ON l.id = pe.letter_id
    WHERE pe.user_id = ? AND pe.redropped_at IS NULL
    ORDER BY pe.picked_up_at ASC
  `).all(user_id);

  const withDeadlines = held.map(h => ({
    ...h,
    has_been_dropped: h.drop_count > 0,
    auto_redrop_at: new Date(new Date(h.picked_up_at).getTime() + PARAMS.AUTO_REDROP_HOURS * 3600000).toISOString()
  }));

  res.json({ letters: withDeadlines, slots_used: held.length, slots_max: PARAMS.MAX_HELD_LETTERS });
});

module.exports = router;
