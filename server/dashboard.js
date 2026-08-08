// GET /api/dashboard?user_id=... — stats scoped to letters this user authored.
const express = require('express');
const db = require('./db');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing_fields' });

  const { data: letters, error: letErr } = await db
    .from('letters')
    .select('id, title, preview_line, status, word_count, total_distance_km, hands_count, created_at')
    .eq('origin_user_id', user_id)
    .order('created_at', { ascending: false });
  if (letErr) throw letErr;

  const total_distance_km = letters.reduce((s, l) => s + (l.total_distance_km || 0), 0);
  const total_hands = letters.reduce((s, l) => s + (l.hands_count || 0), 0);
  const total_letters = letters.length;
  const avg_hands_per_letter = total_letters ? total_hands / total_letters : 0;

  const letterIds = letters.map(l => l.id);
  let reaction_counts = [];
  if (letterIds.length) {
    const { data: reactions, error: reactErr } = await db
      .from('pickup_events')
      .select('reaction')
      .in('letter_id', letterIds)
      .not('reaction', 'is', null);
    if (reactErr) throw reactErr;

    const counts = {};
    for (const r of reactions) counts[r.reaction] = (counts[r.reaction] || 0) + 1;
    reaction_counts = Object.entries(counts).map(([reaction, c]) => ({ reaction, c }));
  }

  res.json({
    total_distance_km: Math.round(total_distance_km * 10) / 10,
    total_hands,
    total_letters,
    avg_hands_per_letter: Math.round(avg_hands_per_letter * 10) / 10,
    reaction_counts,
    authored_letters: letters.map(l => ({
      id: l.id,
      title: l.title,
      preview_line: l.preview_line,
      status: l.status,
      word_count: l.word_count,
      total_distance_km: Math.round((l.total_distance_km || 0) * 100) / 100,
      hands_count: l.hands_count,
      created_at: l.created_at
    }))
  });
}));

module.exports = router;