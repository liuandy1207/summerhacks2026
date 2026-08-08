// Leaflet map: rendering + click-to-set-location + marker refresh.
import { userId, state } from './state.js';
import { fetchMap } from './api.js';
import { escapeHtml, hashToAngle } from './utils.js';

export let map;
let youMarker;
let letterMarkers = [];

export function initMap() {
  map = L.map('map').setView([state.lat, state.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
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

export async function refreshMap() {
  const data = await fetchMap(userId, state.lat, state.lng);

  letterMarkers.forEach(m => map.removeLayer(m));
  letterMarkers = [];

  data.letters.forEach(letter => {
    // We don't have exact lat/lng for far letters (fog of war) — approximate
    // a point at the right distance in a random-ish but stable direction.
    const angle = hashToAngle(letter.id);
    const latOffset = (letter.distance_m / 111320) * Math.cos(angle);
    const lngOffset = (letter.distance_m / (111320 * Math.cos(state.lat * Math.PI / 180))) * Math.sin(angle);
    const pos = [state.lat + latOffset, state.lng + lngOffset];

    const icon = L.divIcon({
      className: '',
      html: letter.can_pick_up
        ? '<div style="font-size:22px;">✉️</div>'
        : '<div style="font-size:16px;opacity:0.55;">•</div>',
      iconSize: [24, 24]
    });

    const marker = L.marker(pos, { icon }).addTo(map);
    const label = letter.can_pick_up
      ? `<b>${escapeHtml(letter.preview_line || '')}</b><br>${letter.hands_count} hands · traveling ${letter.traveling_days}d<br><button onclick="openLetter('${letter.id}')">Pick up</button>`
      : `Letter, ${letter.distance_m}m away<br>traveling ${letter.traveling_days} days`;
    marker.bindPopup(label);
    letterMarkers.push(marker);
  });
}

export function invalidateMapSize() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}
