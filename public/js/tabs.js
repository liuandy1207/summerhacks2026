// Top-nav tab switching; lazily loads each view's data on activation.
import { loadPocket } from './pocket.js';
import { loadDashboard } from './dashboard.js';
import { invalidateMapSize } from './map.js';

export function initTabs() {
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
