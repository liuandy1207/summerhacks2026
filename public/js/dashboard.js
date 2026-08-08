// "Data" tab: stats scoped to letters the current user has authored.
import { userId, fetchDashboard } from './core.js';

export async function loadDashboard() {
  const data = await fetchDashboard(userId);
  document.getElementById('hero-distance').textContent = data.total_distance_km;
  document.getElementById('stat-letters').textContent = data.total_letters;
  document.getElementById('stat-hands').textContent = data.total_hands;
  document.getElementById('stat-avg-hands').textContent = data.avg_hands_per_letter;

  const maxReaction = Math.max(1, ...data.reaction_counts.map(r => r.c));
  document.getElementById('reaction-breakdown').innerHTML = data.reaction_counts.map(r => `
    <div class="bar-row"><span style="width:100px">${r.reaction}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.c/maxReaction)*100}%"></div></div>
      <span>${r.c}</span></div>
  `).join('') || '<p style="color:#5B6472">No reactions yet.</p>';

  document.getElementById('authored-list').innerHTML = data.authored_letters.map(l => `
    <div class="slot slot-filled">
      <div class="slot-seal">✉️</div>
      <div class="pocket-preview">"${l.title || l.preview_line || ''}"</div>
      <div class="pocket-meta">${l.status} · ${l.hands_count} hands · ${l.total_distance_km} km · ${l.word_count} words</div>
      <div class="pocket-meta">written ${new Date(l.created_at).toLocaleString()}</div>
    </div>
  `).join('') || '<p style="color:#5B6472">You haven\'t written any letters yet.</p>';
}