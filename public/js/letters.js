// Everything about interacting with letters you're holding or reading:
// the "Pocket" tab, the letter-reading modal (pickup / contribute / react /
// re-drop), and the journey timeline modal.
//
// letterModal.js / pocket.js used to expose window.openLetter, window.react,
// window.promptRedrop, window.viewJourney because they're invoked from
// inline onclick="" strings in generated HTML (map popups, pocket cards,
// the letter modal itself) — that's preserved here, including the new
// window.submitContribution / window.skipContribution handlers.
import { userId, state, getConfig, escapeHtml, fetchPocket, fetchLetterRead, deleteLetter, pickupLetter, contributeToLetter, reactToLetter, redropLetterApi, fetchJourney } from './core.js';
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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatLocation(lat, lng) {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

// Renders the letter body + date + reactions + (optionally) the contribute
// box + contributions list + action buttons into the modal. Shared by
// openLetter (fresh pickup — may offer to contribute) and readLetter
// (re-reading something already in your pocket or authored by you — no
// contribute offer, that choice was already made at pickup time).
function renderLetterModal(letterId, data, { canRedrop, canContribute }) {
  const atLimit = data.contributions.length >= data.max_contributions;
  const showComposeBox = canContribute && !atLimit;
  // canContribute is only ever false here because the read route determined
  // this hold already has a contribution attached — not because contributing
  // doesn't apply at all (readLetter only passes it through when currently held).
  const showAlreadyContributedNote = !canContribute && !atLimit && canRedrop;

  document.getElementById('modal-envelope').textContent = `✉️`;
  document.getElementById('modal-title').textContent = data.title || 'Untitled';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-date">${formatDate(data.created_at)}</div>
    <p>${escapeHtml(data.text)}</p>
    <div class="reactions">
      <button onclick="react('${letterId}','seen')">Felt seen</button>
      <button onclick="react('${letterId}','less_alone')">Felt less alone</button>
      <button onclick="react('${letterId}','moved')">Moved</button>
      <button onclick="react('${letterId}','unsettled')">Unsettled</button>
    </div>
    ${showComposeBox ? renderComposeBox(letterId) : ''}
    ${showAlreadyContributedNote ? `<p class="contribute-note">You've already added a line to this letter this round.</p>` : ''}
    <div class="contributions">
      <h4 class="contributions-heading">Contributions (<span id="contributions-count">${data.contributions.length}</span>/${data.max_contributions})</h4>
      <div id="contributions-list">${renderContributions(data.contributions)}</div>
    </div>
    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="primary" style="margin-top:0" onclick="viewJourney('${letterId}')">View journey</button>
      ${canRedrop ? `<button class="primary" style="margin-top:0; background:#5B6472" onclick="promptRedrop('${letterId}')">Re-drop here</button>` : ''}
    </div>
  `;
  document.getElementById('letter-modal').classList.remove('hidden');
}

function renderContributions(contributions) {
  if (!contributions.length) {
    return `<p class="contributions-empty">No contributions yet — be the first to add a line.</p>`;
  }
  return contributions.map((c, i) => `
    <div class="contribution">
      <p class="contribution-text">${escapeHtml(c.text)}</p>
      <div class="contribution-meta">Contributor ${i + 1} · ${formatDate(c.created_at)} · ${c.dropped_at ? formatLocation(c.lat, c.lng) : 'in transit'}</div>
    </div>
  `).join('');
}

function renderComposeBox(letterId) {
  const { MIN_CONTRIBUTION_WORDS, MAX_CONTRIBUTION_WORDS } = getConfig();
  return `
    <div class="contribute-box" id="contribute-box">
      <label for="contribute-text">Add a line before you drop it (${MIN_CONTRIBUTION_WORDS}–${MAX_CONTRIBUTION_WORDS} words)</label>
      <textarea id="contribute-text" rows="3"></textarea>
      <div class="word-count" id="contribute-word-count">0 words</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="primary" style="margin-top:0" onclick="submitContribution('${letterId}')">Contribute</button>
        <button class="primary" style="margin-top:0; background:#5B6472" onclick="skipContribution()">Skip</button>
      </div>
    </div>
  `;
}

// Wires the live word counter on the compose box's textarea. Called after
// the compose box is inserted into the DOM (innerHTML doesn't run scripts
// or re-attach listeners, so this has to happen post-render).
function wireComposeBox() {
  const textarea = document.getElementById('contribute-text');
  const countEl = document.getElementById('contribute-word-count');
  if (!textarea || !countEl) return;
  textarea.addEventListener('input', () => {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    countEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
  });
}

window.openLetter = async function(letterId) {
  const { ok, data } = await pickupLetter(letterId, { user_id: userId, lat: state.lat, lng: state.lng });
  if (!ok) {
    alert({
      pocket_full: `Your pocket is full (max ${data.limit}).`,
      too_far: `Too far away (${data.distance_m}m).`,
      cannot_pickup_own_last_drop: `You just dropped this one.`,
      already_holding_letter: `You're already holding this letter.`
    }[data.error] || 'Could not pick up.');
    return;
  }

  renderLetterModal(letterId, data, { canRedrop: true, canContribute: true });
  wireComposeBox();
  refreshMap();
};

// Opens the reading modal for a letter you already hold or authored —
// used by Pocket and Data tab cards. Unlike openLetter(), this doesn't
// call the pickup endpoint (no proximity check, no new pickup_event).
// Whether contributing is offered now depends on data.can_contribute from
// the server: true only if you're currently holding it (open pickup_event)
// and haven't already added a line during this hold.
// canRedrop should only be true when the letter is currently in your
// pocket (Pocket tab cards); Data tab letters may already be dropped
// elsewhere, so they only get Read + View journey.
window.readLetter = async function(letterId, canRedrop) {
  const { ok, data } = await fetchLetterRead(letterId, userId);
  if (!ok) {
    alert({ not_yours_to_read: "You don't currently hold this letter." }[data.error] || 'Could not open letter.');
    return;
  }

  renderLetterModal(letterId, data, { canRedrop, canContribute: data.can_contribute });
  wireComposeBox();
};

window.submitContribution = async function(letterId) {
  const textarea = document.getElementById('contribute-text');
  const text = textarea.value.trim();
  const { MIN_CONTRIBUTION_WORDS, MAX_CONTRIBUTION_WORDS } = getConfig();
  const words = text.split(/\s+/).filter(Boolean).length;

  if (words < MIN_CONTRIBUTION_WORDS || words > MAX_CONTRIBUTION_WORDS) {
    alert(`Contributions need to be ${MIN_CONTRIBUTION_WORDS}–${MAX_CONTRIBUTION_WORDS} words (yours is ${words}).`);
    return;
  }

  const { ok, data } = await contributeToLetter(letterId, { user_id: userId, text });
  if (!ok) {
    alert({
      already_contributed: 'You already added a line to this letter.',
      max_contributions_reached: 'This letter is full — no more room for contributions.',
      too_short: `Needs at least ${data.min_words} words.`,
      too_long: `Keep it under ${data.max_words} words.`,
      not_holding_letter: "You're not currently holding this letter."
    }[data.error] || 'Could not add your contribution.');
    return;
  }

  document.getElementById('contribute-box')?.remove();
  document.getElementById('contributions-list').innerHTML = renderContributions(data.contributions);
  document.getElementById('contributions-count').textContent = data.contributions.length;
};

window.skipContribution = function() {
  document.getElementById('contribute-box')?.remove();
};

window.react = async function(letterId, reaction) {
  await reactToLetter(letterId, { user_id: userId, reaction });
};

window.promptRedrop = async function(letterId) {
  const { ok, data } = await redropLetterApi(letterId, { user_id: userId, lat: state.lat, lng: state.lng });
  if (ok) {
    alert(`Re-dropped here. Traveled ${data.distance_km.toFixed(2)}km this hop.`);
    document.getElementById('letter-modal').classList.add('hidden');
    // The pocket state (drop already succeeded server-side) must update
    // regardless of whether the map refresh succeeds — previously these
    // ran back-to-back with no error handling, so a throw in refreshMap()
    // (e.g. a transient fetch failure) silently skipped loadPocket(),
    // leaving the Pocket tab stale until the user switched tabs away and
    // back (which calls loadPocket() independently from main.js).
    try {
      await refreshMap();
    } catch (err) {
      console.error('refreshMap failed after redrop:', err);
    }
    loadPocket();
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