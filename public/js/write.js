// "Write a letter" tab: word count + submit flow.
import { userId, state } from './state.js';
import { postLetter } from './api.js';

export function initWriteView() {
  const textarea = document.getElementById('letter-text');
  const wordCountEl = document.getElementById('word-count');
  const statusEl = document.getElementById('write-status');

  textarea.addEventListener('input', () => {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean);
    wordCountEl.textContent = words.length;
  });

  document.getElementById('submit-letter').addEventListener('click', async () => {
    const text = textarea.value.trim();
    statusEl.textContent = '';
    statusEl.className = 'status';
    if (!text) { statusEl.textContent = 'Write something first.'; statusEl.className = 'status error'; return; }

    const { ok, data } = await postLetter({ user_id: userId, lat: state.lat, lng: state.lng, text });

    if (!ok) {
      const messages = {
        pocket_full: `Your pocket is full (max ${data.limit}). Drop a held letter first.`,
        too_long: `Keep it under ${data.max_words} words.`,
        flagged: `This letter can't be posted as written.`
      };
      statusEl.textContent = messages[data.error] || 'Something went wrong.';
      statusEl.className = 'status error';
      return;
    }

    statusEl.textContent = `Saved to your pocket. Tone read as "${data.tone_tag}" — head to Pocket to drop it somewhere.`;
    statusEl.className = 'status ok';
    textarea.value = '';
    wordCountEl.textContent = '0';
    // no refreshMap() — nothing has actually been dropped anywhere yet
  });
}