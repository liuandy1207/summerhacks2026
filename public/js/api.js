// Single place for every fetch() call the frontend makes.
// Route/UI modules should never call fetch() directly — call these instead.
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

export async function reactToLetter(id, payload) {
  await fetch(`${API}/api/letters/${id}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
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

export async function fetchDashboard() {
  const res = await fetch(`${API}/api/dashboard`);
  return res.json();
}
