// Journey timeline modal. Exposes window.viewJourney for inline onclick=""
// handlers used by letterModal.js and pocket.js.
import { userId } from './state.js';
import { fetchJourney } from './api.js';

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
