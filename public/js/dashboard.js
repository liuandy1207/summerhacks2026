// "Data" tab: aggregate stats for the whole loop.
import { fetchDashboard } from './core.js';

export async function loadDashboard() {
  const data = await fetchDashboard();
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

  const maxTone = Math.max(1, ...data.tone_counts.map(t => t.c));
  document.getElementById('tone-breakdown').innerHTML = data.tone_counts.map(t => `
    <div class="bar-row"><span style="width:100px">${t.tone_tag}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(t.c/maxTone)*100}%"></div></div>
      <span>${t.c}</span></div>
  `).join('') || '<p style="color:#5B6472">No letters yet.</p>';
}
