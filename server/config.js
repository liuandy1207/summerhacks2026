// All tunable parameters live here so anyone can adjust behavior
// without touching route/service logic.
module.exports = {
  PICKUP_RADIUS_M: 50,
  FOG_RADIUS_KM: 2,
  FUZZ_RADIUS_M: 150,
  MAX_HELD_LETTERS: 3,
  AUTO_REDROP_HOURS: 24,
  MIN_WORDS: 1,        // NEW
  MAX_WORDS: 1000,
  MAX_TITLE_LENGTH: 25,  // NEW
  LOST_DOWNVOTE_THRESHOLD: 5,
  LOST_MIN_AGE_HOURS: 48
};