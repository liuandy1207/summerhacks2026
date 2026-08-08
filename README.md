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

## Project structure (modularized)

This is split into small, single-purpose files so multiple people can work on
different pieces at once without stepping on each other. Nobody should need to
touch `server/index.js` or `public/js/main.js` for day-to-day feature work —
those are just wiring.

```
server/
  index.js            # app wiring only — mounts routers, starts the server
  config.js            # all tunable PARAMS (pickup radius, pocket cap, etc.)
  moderation.js         # STUB word-filter + tone tagging (see below)
  seed.js               # demo data generator
  db/
    index.js             # SQLite connection + schema (only file with CREATE TABLE)
  utils/
    ids.js                # now(), uid()
    geo.js                 # haversineKm()
  services/
    users.js               # getOrCreateUser
    letters.js               # heldLettersCount, latestDropOf, processAutoRedrops, redropLetter
  routes/
    letters.js                # POST /api/letters, pickup/react/redrop/vote/report, journey
    map.js                     # GET /api/map (fog-of-war)
    pocket.js                   # GET /api/pocket
    dashboard.js                 # GET /api/dashboard

public/
  index.html            # markup + tab/view containers + modals
  style.css              # all styling
  js/
    main.js               # entry point — imports + initializes every view module
    state.js                # userId + current simulated lat/lng
    api.js                   # every fetch() call lives here
    utils.js                  # escapeHtml, hashToAngle
    map.js                     # Leaflet map + refreshMap
    write.js                    # "Write a letter" tab
    letterModal.js                # pickup / read / react / re-drop modal
    journey.js                     # journey timeline modal
    pocket.js                       # "Pocket" tab
    dashboard.js                     # "Data" tab
    tabs.js                           # top-nav tab switching
```

**To work on one piece without reading the rest:**
- Backend route logic → edit the matching file in `server/routes/`; shared
  logic (pocket limits, auto-redrop, distance calc) lives in `server/services/`
  and `server/utils/` so routes stay thin.
- Frontend view logic → edit the matching file in `public/js/`. Every network
  call goes through `public/js/api.js`, so a change to an endpoint only needs
  updating in one place.
- Tunable numbers (pickup radius, pocket cap, auto-redrop window, word limit,
  "lost letter" thresholds) → `server/config.js`.
- DB schema → `server/db/index.js` only.

Frontend files are loaded as native ES modules (`<script type="module">` in
`index.html`), so no bundler is required — just `import`/`export`.

Note: `letterModal.js`, `journey.js`, `map.js`, and `pocket.js` attach a few
functions to `window` (`openLetter`, `react`, `promptRedrop`, `viewJourney`)
because they're invoked from `onclick="..."` attributes inside dynamically
generated HTML (map popups, pocket cards, the letter modal). That's the only
place globals are used intentionally.

## What's stubbed / next steps

1. **Reve integration**: envelope art is currently a placeholder emoji in the
   modal (`modal-envelope` div, set in `public/js/letterModal.js`). Swap this
   for a call to Reve's Create/Edit API using the letter's `tone_tag` to pick
   a wax-seal color/motif, keeping the rest of the illustration style fixed
   across every letter so the whole app reads as one visual world.
2. **Real moderation/tone LLM call**: replace `server/moderation.js`'s
   heuristic with an actual LLM call (system prompt is in the file's
   comments). Keep the "flagged" self-harm case routed to a support message,
   not a silent block.
3. **Real GPS** (`navigator.geolocation`) instead of map-click, once you're
   ready to test on mobile. This only touches `public/js/map.js` and
   `public/js/state.js`.

## Tunable parameters

All in `server/config.js` — pickup radius, fog-of-war radius, max held
letters, auto-redrop window, max word count, and the "lost letter"
downvote/age thresholds.
