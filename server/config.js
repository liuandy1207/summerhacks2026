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
  LOST_MIN_AGE_HOURS: 48,
  MIN_CONTRIBUTION_WORDS: 5,   // NEW — per-contribution sentence, not the letter itself
  MAX_CONTRIBUTION_WORDS: 30,  // NEW
  MAX_CONTRIBUTIONS: 10        // NEW — how many people can add a line to one letter
};
