// One-time "how this works" splash. Shown on first visit; the "don't show
// this again" checkbox persists via localStorage (same loop_ prefix
// convention as the user id in core.js), so it won't reappear on repeat
// visits unless the user clears site data.
const DONT_SHOW_KEY = 'loop_hide_intro';

export function initIntro() {
  const modal = document.getElementById('intro-modal');
  const closeBtn = document.getElementById('intro-close');
  const dontShowCheckbox = document.getElementById('intro-dont-show');

  if (localStorage.getItem(DONT_SHOW_KEY) === '1') return;

  modal.classList.remove('hidden');

  closeBtn.addEventListener('click', () => {
    if (dontShowCheckbox.checked) {
      localStorage.setItem(DONT_SHOW_KEY, '1');
    }
    modal.classList.add('hidden');
  });
}