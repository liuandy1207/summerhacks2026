// Everything about interacting with letters you're holding or reading:
// the "Pocket" tab, the letter-reading modal (pickup / react / re-drop),
// and the journey timeline modal.
//
// letterModal.js / pocket.js used to expose window.openLetter, window.react,
// window.promptRedrop, window.viewJourney because they're invoked from
// inline onclick="" strings in generated HTML (map popups, pocket cards,
// the letter modal itself) — that's preserved here.
import { userId, state, escapeHtml, fetchPocket, pickupLetter, reactToLetter, redropLetterApi, fetchJourney } from './core.js';
import { refreshMap } from './map.js';

// ---- pocket tab -------------------------------------------------------------

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

// ---- letter-reading modal -----------------------------------------------------

export function initLetterModal() {
  document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('letter-modal').classList.add('hidden');
  });
}

window.openLetter = async function(letterId) {
  const { ok, data } = await pickupLetter(letterId, { user_id: userId, lat: state.lat, lng: state.lng });
  if (!ok) {
    alert({
      pocket_full: `Your pocket is full (max ${data.limit}).`,
      too_far: `Too far away (${data.distance_m}m).`,
      cannot_pickup_own_last_drop: `You just dropped this one.`
    }[data.error] || 'Could not pick up.');
    return;
  }

  document.getElementById('modal-envelope').textContent = `✉️ tone: ${data.tone_tag}`;
  document.getElementById('modal-body').innerHTML = `
    <p>${escapeHtml(data.text)}</p>
    <div class="reactions">
      <button onclick="react('${letterId}','seen')">Felt seen</button>
      <button onclick="react('${letterId}','less_alone')">Felt less alone</button>
      <button onclick="react('${letterId}','moved')">Moved</button>
      <button onclick="react('${letterId}','unsettled')">Unsettled</button>
    </div>
    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="primary" style="margin-top:0" onclick="viewJourney('${letterId}')">View journey</button>
      <button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${letterId}')">Re-drop here</button>
    </div>
  `;
  document.getElementById('letter-modal').classList.remove('hidden');
  refreshMap();
};

window.react = async function(letterId, reaction) {
  await reactToLetter(letterId, { user_id: userId, reaction });
};

window.promptRedrop = async function(letterId) {
  const { ok, data } = await redropLetterApi(letterId, { user_id: userId, lat: state.lat, lng: state.lng });
  if (ok) {
    alert(`Re-dropped here. Traveled ${data.distance_km.toFixed(2)}km this hop.`);
    document.getElementById('letter-modal').classList.add('hidden');
    refreshMap();
  }
};

// ---- journey timeline modal -----------------------------------------------------

export function initJourneyModal() {
  document.getElementById('close-journey-modal').addEventListener('click', () => {
    document.getElementById('journey-modal').classList.add('hidden');
  });
}

window.viewJourney = async function(letterId) {
  const { ok, data } = await fetchJourney(letterId, userId);
  if (!ok) { alert('You need to have picked this letter up to see its journey.'); return; }

  const eventLabel = { written: 'Written', redropped: 'Picked up & re-dropped', auto_redropped: 'Auto-dropped (24h passed)', picked_up: 'Picked up' };
  document.getElementById('journey-body').innerHTML = `
    <div class="journey-stats">
      <div><b>${data.hands_count}</b> hands</div>
      <div><b>${data.total_distance_km}</b> km traveled</div>
      <div><b>${data.traveling_duration_hours}</b> hrs traveling</div>
    </div>
    <ul class="timeline">
      ${data.events.map(e => `<li><span class="event-type">${eventLabel[e.type] || e.type}</span><br><span class="event-time">${new Date(e.at).toLocaleString()}</span></li>`).join('')}
    </ul>
  `;
  document.getElementById('journey-modal').classList.remove('hidden');
};
