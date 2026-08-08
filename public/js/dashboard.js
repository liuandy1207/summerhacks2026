// "Data" tab: stats scoped to letters the current user has authored.
import { userId, escapeHtml, fetchDashboard } from './core.js';

export async function loadDashboard() {
  const data = await fetchDashboard(userId);
  document.getElementById('hero-distance').textContent = data.total_distance_km;
  document.getElementById('stat-letters').textContent = data.total_letters;
  document.getElementById('stat-hands').textContent = data.total_hands;
  document.getElementById('stat-avg-hands').textContent = data.avg_hands_per_letter;

  document.getElementById('authored-list').innerHTML = `
    <div class="pocket-slots">${data.authored_letters.map(renderAuthoredCard).join('')}</div>
  ` || '<p style="color:#5B6472">You haven\'t written any letters yet.</p>';
}

function renderAuthoredCard(l) {
  return `
    <div class="slot slot-filled">
      <div class="slot-seal">✉️</div>
      <div class="pocket-preview">"${escapeHtml(l.title || l.preview_line || '')}"</div>
      <div class="pocket-meta">${l.status} · ${l.hands_count} hands · ${l.total_distance_km} km · ${l.word_count} words</div>
      <div class="pocket-meta">written ${new Date(l.created_at).toLocaleString()}</div>
      <div style="margin-top:10px;">
        <button class="primary" style="margin-top:0" onclick="viewJourney('${l.id}')">View journey</button>
      </div>
    </div>
  `;
}