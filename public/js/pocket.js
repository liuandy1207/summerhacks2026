// "Pocket" tab: letters the current user is currently holding.
import { userId } from './state.js';
import { fetchPocket } from './api.js';
import { escapeHtml } from './utils.js';

export async function loadPocket() {
  const data = await fetchPocket(userId);

  document.getElementById('pocket-list').innerHTML = `
    <p style="color:#5B6472; margin-bottom:16px;">${data.slots_used} / ${data.slots_max} slots used</p>
    ${data.letters.map(l => `
      <div class="pocket-card">
        <div class="pocket-preview">"${escapeHtml(l.preview_line || '')}"</div>
        <div class="pocket-meta">tone: ${l.tone_tag} · ${l.hands_count} hands so far</div>
        <div class="pocket-meta">auto-redrops ${new Date(l.auto_redrop_at).toLocaleString()} if you don't act</div>
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button class="primary" style="margin-top:0" onclick="viewJourney('${l.letter_id}')">View journey</button>
          <button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${l.letter_id}')">Re-drop here</button>
        </div>
      </div>
    `).join('') || '<p style="color:#5B6472">Nothing in your pocket. Pick up a letter from the map.</p>'}
  `;
}
