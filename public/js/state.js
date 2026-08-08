// Shared client-side state: identity + current simulated GPS position.
// Import { userId, state } wherever needed instead of using globals.
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
