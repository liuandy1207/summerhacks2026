// "Pocket" tab: letters the current user is currently holding.
import { userId } from './state.js';
import { fetchPocket } from './api.js';
import { escapeHtml } from './utils.js';

export async function loadPocket() {
  const data = await fetchPocket(userId);

  const slots = [];
  for (let i = 0; i < data.slots_max; i++) {
    slots.push(data.letters[i] ? renderFilledSlot(data.letters[i]) : renderEmptySlot());
  }

  document.getElementById('pocket-list').innerHTML = `
    <p style="color:#5B6472; margin-bottom:16px;">${data.slots_used} / ${data.slots_max} slots used</p>
    <div class="pocket-slots">${slots.join('')}</div>
  `;
}

function renderFilledSlot(l) {
  const dropLabel = l.has_been_dropped ? 'Re-drop here' : 'Drop here';
  const statusLine = l.has_been_dropped
    ? `${l.hands_count} hands so far`
    : `written by you — not dropped yet`;

  return `
    <div class="slot slot-filled">
      <div class="slot-seal">✉️</div>
      <div class="pocket-preview">"${escapeHtml(l.preview_line || '')}"</div>
      <div class="pocket-meta">tone: ${l.tone_tag} · ${statusLine}</div>
      <div class="pocket-meta">auto-redrops ${new Date(l.auto_redrop_at).toLocaleString()} if you don't act</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        ${l.has_been_dropped ? `<button class="primary" style="margin-top:0" onclick="viewJourney('${l.letter_id}')">View journey</button>` : ''}
        <button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${l.letter_id}')">${dropLabel}</button>
      </div>
    </div>
  `;
}

function renderEmptySlot() {
  return `
    <div class="slot slot-empty">
      <div class="slot-empty-icon">✎</div>
      <div class="slot-empty-label">Empty slot</div>
    </div>
  `;
}