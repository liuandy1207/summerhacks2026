// "Write a letter" tab: title + word count + save-to-pocket flow.
import { userId, state, postLetter, getConfig } from './core.js';

export function initWriteView() {
  const { MIN_WORDS, MAX_WORDS, MAX_TITLE_LENGTH } = getConfig();

  const titleInput = document.getElementById('letter-title');
  const titleCountEl = document.getElementById('title-count');
  const titleMaxEl = document.getElementById('title-max');
  const textarea = document.getElementById('letter-text');
  const wordCountEl = document.getElementById('word-count');
  const wordMinHintEl = document.getElementById('word-min-hint');
  const wordMaxEl = document.getElementById('word-max');
  const statusEl = document.getElementById('write-status');

  // Sync the DOM to config instead of relying on static HTML attributes.
  titleInput.maxLength = MAX_TITLE_LENGTH;
  titleMaxEl.textContent = MAX_TITLE_LENGTH;
  wordMinHintEl.textContent = `(min ${MIN_WORDS})`;
  wordMaxEl.textContent = MAX_WORDS;

  titleInput.addEventListener('input', () => {
    titleCountEl.textContent = titleInput.value.length;
  });

  textarea.addEventListener('input', () => {
    const words = textarea.value.trim().split(/\s+/).filter(Boolean);
    wordCountEl.textContent = words.length;
  });

  document.getElementById('submit-letter').addEventListener('click', async () => {
    const text = textarea.value.trim();
    const title = titleInput.value.trim();
    statusEl.textContent = '';
    statusEl.className = 'status';

    if (!text) {
      statusEl.textContent = 'Write something first.';
      statusEl.className = 'status error';
      return;
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORDS) {
      statusEl.textContent = `Write at least ${MIN_WORDS} words (currently ${wordCount}).`;
      statusEl.className = 'status error';
      return;
    }
    if (wordCount > MAX_WORDS) {
      statusEl.textContent = `Keep it under ${MAX_WORDS} words.`;
      statusEl.className = 'status error';
      return;
    }
    if (!title) {
      statusEl.textContent = 'Give your letter a title.';
      statusEl.className = 'status error';
      return;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      statusEl.textContent = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;
      statusEl.className = 'status error';
      return;
    }

    const { ok, data } = await postLetter({ user_id: userId, lat: state.lat, lng: state.lng, text, title });

    if (!ok) {
      // Messages still driven by the server's response numbers (data.limit,
      // data.min_words, etc.) — never a hardcoded number in the string itself.
      const messages = {
        pocket_full: `Your pocket is full (max ${data.limit}). Drop a held letter first.`,
        too_short: `Write at least ${data.min_words} words.`,
        too_long: `Keep it under ${data.max_words} words.`,
        title_required: `Give your letter a title.`,
        title_too_long: `Keep the title under ${data.max_title_length} characters.`,
        flagged: `This letter can't be posted as written.`
      };
      statusEl.textContent = messages[data.error] || 'Something went wrong.';
      statusEl.className = 'status error';
      return;
    }

    statusEl.textContent = data.pending_review
      ? `Saved to your pocket. It's under review before it can be dropped publicly.`
      : `Saved to your pocket. Head to Pocket to drop it somewhere.`;
    statusEl.className = 'status ok';
    titleInput.value = '';
    titleCountEl.textContent = '0';
    textarea.value = '';
    wordCountEl.textContent = '0';
  });
}