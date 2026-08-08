// Run with: node server/seed.js
// Populates a handful of fake letters with multi-hop journeys around Toronto
// so the map and dashboard don't look empty for a demo.
const crypto = require('crypto');
const db = require('./db');
const { moderateAndTag } = require('./shared');

const uid = () => crypto.randomUUID();
const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();

const TORONTO = { lat: 43.6532, lng: -79.3832 };
function jitter(base, km) {
  const deg = km / 111;
  return base + (Math.random() - 0.5) * 2 * deg;
}

const SEED_TEXTS = [
  "I don't know who you are, but I hope today treats you gently. I've been carrying something heavy and writing it down here made it lighter, even just a little.",
  "I used to walk this street every day with someone I don't talk to anymore. I still take the long way sometimes, just to remember what it felt like.",
  "Today I finally sent the email I'd been avoiding for three weeks. It felt like exhaling for the first time in a while. Whatever you're avoiding — you can do it too.",
  "I'm grateful for small things this week: a stranger who let me merge in traffic, a song that made me cry in a good way, coffee that was actually warm.",
  "It's been a hard year. I'm still here though, and so are you, reading this. That has to count for something.",
  "I hope whoever reads this is having a calmer day than I am. Breathe. It passes."
];

function insertLetter(text, ageHours, hops) {
  const mod = moderateAndTag(text);
  const letterId = uid();
  const createdAt = hoursAgo(ageHours);
  const wordCount = text.trim().split(/\s+/).length;

  db.prepare(`INSERT INTO letters
    (id, text, word_count, preview_line, status, created_at, hands_count, total_distance_km, upvotes, downvotes, origin_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(letterId, text, wordCount, mod.preview_line, 'active', createdAt, 0, 0, 0, 0, 'seed_user_0');

  let lat = jitter(TORONTO.lat, 3);
  let lng = jitter(TORONTO.lng, 3);
  db.prepare(`INSERT INTO drop_events (id, letter_id, user_id, lat, lng, dropped_at, is_auto_redrop)
              VALUES (?,?,?,?,?,?,0)`).run(uid(), letterId, 'seed_user_0', lat, lng, createdAt);

  let totalDist = 0;
  let hands = 0;
  let t = ageHours;
  for (let i = 0; i < hops; i++) {
    t = Math.max(0.5, t - ageHours / (hops + 1));
    const pickupAt = hoursAgo(t + 0.1);
    const redropAt = hoursAgo(t);
    const holder = `seed_user_${i + 1}`;

    db.prepare(`INSERT INTO pickup_events (id, letter_id, user_id, picked_up_at, reaction, redropped_at)
                VALUES (?,?,?,?,?,?)`)
      .run(uid(), letterId, holder, pickupAt, ['seen','less_alone','moved'][i % 3], redropAt);

    const newLat = jitter(lat, 4);
    const newLng = jitter(lng, 4);
    const distKm = haversine(lat, lng, newLat, newLng);
    totalDist += distKm;

    db.prepare(`INSERT INTO drop_events (id, letter_id, user_id, lat, lng, dropped_at, is_auto_redrop)
                VALUES (?,?,?,?,?,?,0)`).run(uid(), letterId, holder, newLat, newLng, redropAt);

    lat = newLat; lng = newLng; hands++;
  }

  db.prepare(`UPDATE letters SET hands_count = ?, total_distance_km = ? WHERE id = ?`)
    .run(hands, totalDist, letterId);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

SEED_TEXTS.forEach((text, i) => {
  insertLetter(text, 12 + i * 20, i % 4); // varied ages and hop counts
});

console.log('Seeded', SEED_TEXTS.length, 'letters around Toronto.');