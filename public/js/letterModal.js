// Letter-reading modal: pickup, reactions, re-drop.
// Exposes window.openLetter / window.react / window.promptRedrop because
// they're invoked from inline onclick="" strings in generated HTML
// (from here and from map.js / pocket.js popups).
import { userId, state } from './state.js';
import { pickupLetter, reactToLetter, redropLetterApi } from './api.js';
import { escapeHtml } from './utils.js';
import { refreshMap } from './map.js';

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
