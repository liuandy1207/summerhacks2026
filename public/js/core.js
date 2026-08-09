// Shared foundation imported by every feature module: identity + simulated
// GPS state, every fetch() call the frontend makes, small DOM/math utils,
// and the tunable-params loader. Nothing here is view-specific.

// ---- identity / state ------------------------------------------------------
function getUserId() {
  let id = localStorage.getItem('loop_user_id');
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('loop_user_id', id);
  }
  return id;
}

export const userId = getUserId();

// Toronto-ish default center
export const state = {
  lat: 43.6532,
  lng: -79.3832
};

// ---- config -----------------------------------------------------------------
// Fetches server's PARAMS once at startup and caches it. Every feature
// module that needs a limit (min/max words, title length, pocket size,
// etc.) imports `getConfig()` from here instead of hardcoding the number —
// change it once on the server, everything follows.
let cachedConfig = null;

export async function loadConfig() {
  if (!cachedConfig) {
    cachedConfig = await fetch('/api/config').then(r => r.json());
  }
  return cachedConfig;
}

export function getConfig() {
  if (!cachedConfig) throw new Error('Config not loaded — call loadConfig() before any view initializes');
  return cachedConfig;
}

// ---- api ----------------------------------------------------------------------
// Every network call the frontend makes lives here. Feature modules should
// never call fetch() directly — call these instead.
const API = '';

export async function fetchMap(userId, lat, lng) {
  const res = await fetch(`${API}/api/map?user_id=${userId}&lat=${lat}&lng=${lng}`);
  return res.json();
}

export async function postLetter(payload) {
  const res = await fetch(`${API}/api/letters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function pickupLetter(id, payload) {
  const res = await fetch(`${API}/api/letters/${id}/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function contributeToLetter(id, payload) {
  const res = await fetch(`${API}/api/letters/${id}/contribute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function reactToLetter(id, payload) {
  const res = await fetch(`${API}/api/letters/${id}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function redropLetterApi(id, payload) {
  const res = await fetch(`${API}/api/letters/${id}/redrop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function fetchJourney(id, userId) {
  const res = await fetch(`${API}/api/letters/${id}/journey?user_id=${userId}`);
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function fetchPocket(userId) {
  const res = await fetch(`${API}/api/pocket?user_id=${userId}`);
  return res.json();
}

export async function fetchDashboard(userId) {
  const res = await fetch(`${API}/api/dashboard?user_id=${userId}`);
  return res.json();
}

export async function deleteLetter(id, userId) {
  const res = await fetch(`${API}/api/letters/${id}?user_id=${userId}`, { method: 'DELETE' });
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function fetchLetterRead(id, userId) {
  const res = await fetch(`${API}/api/letters/${id}/read?user_id=${userId}`);
  const data = await res.json();
  return { ok: res.ok, data };
}

// ---- utils --------------------------------------------------------------------
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function hashToAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return (h * Math.PI) / 180;
}