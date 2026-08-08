# LOOP — letters to strangers

Write an anonymous letter, drop it at your real (or simulated) location.
Someone else finds it, reads it, reacts, and re-drops it somewhere new.
Every letter tracks its own journey: hands held, distance traveled, time in motion.

## Run it

    npm install
    npm run seed      # populate demo letters around Toronto (optional but recommended for demo)
    npm start          # starts on http://localhost:3001

Open http://localhost:3001 — click anywhere on the map to simulate your GPS location.
Open the same URL in a different browser (or incognito window) to simulate a second user
picking up letters the first user dropped.

## Project structure (one file per feature)

Organized around features rather than layers, so working on one piece of
the app means opening one file. Nobody should need to touch `server/index.js`
or `public/js/main.js` for day-to-day feature work — those are just wiring.

```
server/
  index.js            # app wiring only — mounts routers, starts the server
  config.js            # all tunable PARAMS (pickup radius, pocket cap, etc.)
  db.js                 # SQLite connection + schema (only file with CREATE TABLE)
  shared.js              # ids, geo math, moderation stub, getOrCreateUser
  letters.js               # letters + pocket feature: routes AND their logic
                             # (write, pickup, react, redrop, vote, report,
                             #  journey, pocket list) — all in one file
  map.js                     # GET /api/map (fog-of-war)
  dashboard.js                 # GET /api/dashboard
  seed.js                       # demo data generator

public/
  index.html            # markup + tab/view containers + modals
  style.css              # all styling
  js/
    main.js               # entry point — identity, tab switching, boots every view
    core.js                 # state, every fetch() call, small utils, config loader
    map.js                    # Leaflet map + refreshMap ("Map" tab)
    write.js                    # "Write a letter" tab
    letters.js                    # "Pocket" tab + letter-reading modal + journey modal
    dashboard.js                   # "Data" tab
```

**To work on one piece without reading the rest:**
- A backend feature (letters/pocket, map, dashboard) → its one file in
  `server/`. Cross-feature helpers (ids, geo, moderation, user lookup) live
  in `server/shared.js` so feature files stay focused.
- A frontend feature (map, write, pocket/letters, dashboard) → its one file
  in `public/js/`. Every network call goes through `public/js/core.js`'s
  `fetch*`/`postLetter` helpers, so a change to an endpoint only needs
  updating in one place.
- Tunable numbers (pickup radius, pocket cap, auto-redrop window, word limit,
  "lost letter" thresholds) → `server/config.js`.
- DB schema → `server/db.js` only.

Frontend files are loaded as native ES modules (`<script type="module">` in
`index.html`), so no bundler is required — just `import`/`export`.

Note: `public/js/letters.js` attaches a few functions to `window`
(`openLetter`, `react`, `promptRedrop`, `viewJourney`) because they're
invoked from `onclick="..."` attributes inside dynamically generated HTML
(map popups, pocket cards, the letter modal). That's the only place globals
are used intentionally.

## Bug fix: letters/pickup/map requests failing

`server/db.js` was missing the `users` table even though `getOrCreateUser()`
(called by nearly every route) reads and writes it — every request past
input validation was throwing `no such table: users`. Fixed by adding the
`users` table to the schema in `server/db.js`.

## What's stubbed / next steps

1. **Reve integration**: envelope art is currently a placeholder emoji in the
   modal (`modal-envelope` div, set in `public/js/letters.js`). Swap this
   for a call to Reve's Create/Edit API using the letter's `tone_tag` to pick
   a wax-seal color/motif, keeping the rest of the illustration style fixed
   across every letter so the whole app reads as one visual world.
2. **Real moderation/tone LLM call**: replace the `moderateAndTag()`
   heuristic in `server/shared.js` with an actual LLM call (system prompt is
   in the file's comments). Keep the "flagged" self-harm case routed to a
   support message, not a silent block.
3. **Real GPS** (`navigator.geolocation`) instead of map-click, once you're
   ready to test on mobile. This only touches `public/js/map.js` and the
   `state` object in `public/js/core.js`.

## Tunable parameters

All in `server/config.js` — pickup radius, fog-of-war radius, max held
letters, auto-redrop window, max word count, and the "lost letter"
downvote/age thresholds.
