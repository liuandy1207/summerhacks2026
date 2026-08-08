// Leaflet map: rendering + click-to-set-location + marker refresh.
import { userId, state } from './state.js';
import { fetchMap } from './api.js';
import { escapeHtml, hashToAngle } from './utils.js';

export let map;
let youMarker;
let letterMarkers = [];

export function initMap() {
  map = L.map('map').setView([state.lat, state.lng], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

  youMarker = L.circleMarker([state.lat, state.lng], {
    radius: 8, color: '#9C3B34', fillColor: '#9C3B34', fillOpacity: 1
  }).addTo(map).bindPopup('You are here');

  map.on('click', (e) => {
    state.lat = e.latlng.lat;
    state.lng = e.latlng.lng;
    youMarker.setLatLng(e.latlng);
    refreshMap();
  });

  refreshMap();
}

// Small envelope glyph — color signals whose letter it is / whether it's pickable.
function envelopeIcon(color, size = 26) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
         style="filter: drop-shadow(0 1px 1px rgba(35,48,60,0.35));">
      <rect x="1.5" y="4.5" width="21" height="15" rx="1.5" fill="${color}" stroke="#23303C" stroke-width="1"/>
      <path d="M2.5 5.5 L12 14 L21.5 5.5" fill="none" stroke="#23303C" stroke-width="1.1"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

export async function refreshMap() {
  const data = await fetchMap(userId, state.lat, state.lng);

  letterMarkers.forEach(m => map.removeLayer(m));
  letterMarkers = [];

  data.letters.forEach(letter => {
    const pos = [letter.lat, letter.lng]; // fixed by the server, never recomputed client-side

    let iconHtml, popupHtml, size;

    if (letter.is_own_drop) {
      size = 24;
      iconHtml = envelopeIcon('#35594F', size);
      popupHtml = `<b>Your letter</b><br>${letter.hands_count} hands · traveling ${letter.traveling_days}d`;
    } else if (letter.can_pick_up) {
      size = 26;
      iconHtml = envelopeIcon('#9C3B34', size);
      popupHtml = `<b>${escapeHtml(letter.preview_line || '')}</b><br>${letter.hands_count} hands · traveling ${letter.traveling_days}d<br><button onclick="openLetter('${letter.id}')">Pick up</button>`;
    } else {
      size = 14;
      iconHtml = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#5B6472;opacity:0.5;"></div>`;
      popupHtml = `Letter, ${letter.distance_m}m away<br>traveling ${letter.traveling_days} days`;
    }

    const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [size, size] });
    const marker = L.marker(pos, { icon }).addTo(map);
    marker.bindPopup(popupHtml);
    letterMarkers.push(marker);
  });
}

export function invalidateMapSize() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}