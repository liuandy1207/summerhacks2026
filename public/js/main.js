// Entry point: wires up identity display, top-nav tab switching, and
// initializes every view module. Loaded as a <script type="module"> from
// index.html.
import { userId, loadConfig } from './core.js';
import { initMap, invalidateMapSize } from './map.js';
import { initWriteView } from './write.js';
import { loadPocket, initLetterModal, initJourneyModal } from './letters.js';
import { loadDashboard } from './dashboard.js';
import { initIntro } from './intro.js';

document.getElementById('user-id-short').textContent = userId;

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
      if (tab.dataset.view === 'pocket') loadPocket();
      if (tab.dataset.view === 'dashboard') loadDashboard();
      if (tab.dataset.view === 'map') invalidateMapSize();
    });
  });
}

async function boot() {
  initIntro(); // shown immediately, doesn't need to wait on config/map
  await loadConfig(); // must resolve before any view reads limits (e.g. MIN_WORDS)
  initTabs();
  await initMap(); // may prompt for geolocation before it can center the map
  initWriteView();
  initLetterModal();
  initJourneyModal();
}

boot();