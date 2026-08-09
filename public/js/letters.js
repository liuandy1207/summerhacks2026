// Everything about interacting with letters you're holding or reading:
// the "Pocket" tab, the letter-reading modal (pickup / react / re-drop),
// and the journey timeline modal.
//
// letterModal.js / pocket.js used to expose window.openLetter, window.react,
// window.promptRedrop, window.viewJourney because they're invoked from
// inline onclick="" strings in generated HTML (map popups, pocket cards,
// the letter modal itself) — that's preserved here.
import { userId, state, escapeHtml, fetchPocket, fetchLetterRead, deleteLetter, pickupLetter, reactToLetter, redropLetterApi, fetchJourney } from './core.js';
import { refreshMap } from './map.js';

// ---- pocket tab -------------------------------------------------------------

export async function loadPocket() {
  const data = await fetchPocket(userId);

  if (data.error) {
    document.getElementById('pocket-list').innerHTML =
      `<p style="color:#9C3B34">Couldn't load your pocket (${data.error}). Try refreshing.</p>`;
    return;
  }

  const slots = [];
  for (let i = 0; i < data.slots_max; i++) {
    slots.push(data.letters[i] ? renderFilledSlot(data.letters[i]) : renderEmptySlot());
  }

  document.getElementById('pocket-list').innerHTML = `
    <p style="color:#5B6472; margin-bottom:16px;">${data.slots_used} / ${data.slots_max} slots used</p>
    <div class="pocket-slots">${slots.join('')}</div>
  `;
  tickCountdowns();
}

// Ticks every .countdown element in the DOM once a second (only pocket
// cards have them). Runs continuously from page load rather than being
// started/stopped per tab switch — cheap even when the pocket tab isn't
// visible, and avoids re-wiring an interval on every loadPocket() call.
function tickCountdowns() {
  document.querySelectorAll('.countdown').forEach(el => {
    const deadline = new Date(el.dataset.deadline).getTime();
    const msLeft = deadline - Date.now();
    el.textContent = msLeft <= 0
      ? 'auto-redropping…'
      : `auto-redrops in ${formatCountdown(msLeft)}`;
  });
}
setInterval(tickCountdowns, 1000);

function formatCountdown(ms) {
  let totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const pad = n => String(n).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

function renderFilledSlot(l) {
  const dropLabel = l.has_been_dropped ? 'Re-drop here' : 'Drop here';
  const statusLine = l.has_been_dropped
    ? `${l.hands_count} hands so far`
    : `written by you — not dropped yet`;

  return `
    <div class="slot slot-filled" style="cursor:pointer" onclick="readLetter('${l.letter_id}', true)">
      <div class="slot-seal">✉️</div>
      <div class="pocket-preview">${escapeHtml(l.title || 'Untitled')}</div>
      <div class="pocket-meta">${statusLine}</div>
      <div class="pocket-meta countdown" data-deadline="${l.auto_redrop_at}">calculating…</div>
      <div style="margin-top:10px; display:flex; gap:8px;" onclick="event.stopPropagation()">
        ${l.has_been_dropped ? `<button class="primary" style="margin-top:0" onclick="viewJourney('${l.letter_id}')">View journey</button>` : ''}
        <button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${l.letter_id}')">${dropLabel}</button>
        ${!l.has_been_dropped ? `<button class="primary" style="margin-top:0; background:#9C3B34" onclick="promptDelete('${l.letter_id}')">Delete</button>` : ''}
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
  document.getElementById('letter-modal').addEventListener('click', (e) => {
    if (e.target.id === 'letter-modal') {
      document.getElementById('letter-modal').classList.add('hidden');
    }
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

  document.getElementById('modal-envelope').textContent = `✉️`;
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

// Opens the reading modal for a letter you already hold or authored —
// used by Pocket and Data tab cards. Unlike openLetter(), this doesn't
// call the pickup endpoint (no proximity check, no new pickup_event).
// canRedrop should only be true when the letter is currently in your
// pocket (Pocket tab cards); Data tab letters may already be dropped
// elsewhere, so they only get Read + View journey.
window.readLetter = async function(letterId, canRedrop) {
  const { ok, data } = await fetchLetterRead(letterId, userId);
  if (!ok) {
    alert({ not_yours_to_read: "You don't currently hold this letter." }[data.error] || 'Could not open letter.');
    return;
  }

  document.getElementById('modal-envelope').textContent = `✉️`;
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
      ${canRedrop ? `<button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${letterId}')">Re-drop here</button>` : ''}
    </div>
  `;
  document.getElementById('letter-modal').classList.remove('hidden');
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

window.promptDelete = async function(letterId) {
  if (!confirm('Delete this letter? This can\'t be undone.')) return;
  const { ok, data } = await deleteLetter(letterId, userId);
  if (ok) {
    document.getElementById('letter-modal').classList.add('hidden');
    loadPocket();
  } else {
    alert({ already_dropped: "This letter's already out in the world — it can't be deleted anymore." }[data.error] || 'Could not delete letter.');
  }
};

// ---- journey timeline modal -----------------------------------------------------

let journeyMap;
let journeyLayer;

export function initJourneyModal() {
  document.getElementById('close-journey-modal').addEventListener('click', () => {
    document.getElementById('journey-modal').classList.add('hidden');
  });
  document.getElementById('journey-modal').addEventListener('click', (e) => {
    if (e.target.id === 'journey-modal') {
      document.getElementById('journey-modal').classList.add('hidden');
    }
  });
}

window.viewJourney = async function(letterId) {
  const { ok, data } = await fetchJourney(letterId, userId);
  if (!ok) { alert('You need to have picked this letter up to see its journey.'); return; }

  const eventLabel = { written: 'Written', dropped: 'Dropped', redropped: 'Picked up & re-dropped', auto_redropped: 'Auto-dropped (24h passed)', picked_up: 'Picked up' };
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

  renderJourneyMap(data.events.filter(e => e.lat != null && e.lng != null), eventLabel);
};

function renderJourneyMap(stops, eventLabel) {
  const mapEl = document.getElementById('journey-map');
  if (!stops.length) { mapEl.style.display = 'none'; return; }
  mapEl.style.display = 'block';

  if (!journeyMap) {
    journeyMap = L.map('journey-map');
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(journeyMap);
  }
  if (journeyLayer) {
    journeyMap.removeLayer(journeyLayer);
  }

  journeyLayer = L.layerGroup().addTo(journeyMap);
  const latlngs = stops.map(s => [s.lat, s.lng]);

  L.polyline(latlngs, { color: '#9C3B34', weight: 3, dashArray: '4,6' }).addTo(journeyLayer);

  stops.forEach((s, i) => {
    const isFirst = i === 0;
    const isLast = i === stops.length - 1;
    const color = isLast ? '#9C3B34' : isFirst ? '#35594F' : '#5B6472';
    L.circleMarker([s.lat, s.lng], { radius: 7, color, fillColor: color, fillOpacity: 1 })
      .addTo(journeyLayer)
      .bindPopup(`<b>${eventLabel[s.type] || s.type}</b><br>${new Date(s.at).toLocaleString()}`);
  });

  journeyMap.fitBounds(latlngs, { padding: [24, 24], maxZoom: 15 });
  setTimeout(() => journeyMap.invalidateSize(), 50);
}