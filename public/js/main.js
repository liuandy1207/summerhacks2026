// Entry point: wires up identity display + initializes every view module.
// Loaded as a <script type="module"> from index.html.
import { userId } from './state.js';
import { initMap } from './map.js';
import { initTabs } from './tabs.js';
import { initWriteView } from './write.js';
import { initLetterModal } from './letterModal.js';
import { initJourneyModal } from './journey.js';

document.getElementById('user-id-short').textContent = userId;

initTabs();
initMap();
initWriteView();
initLetterModal();
initJourneyModal();
