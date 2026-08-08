// App wiring only: no business logic here. Add a new feature by creating a
// file in server/ that exports an express.Router() and mounting it below.
const express = require('express');
const cors = require('cors');
const path = require('path');

const PARAMS = require('./config');
const { lettersRouter, pocketRouter } = require('./letters');
const mapRouter = require('./map');
const dashboardRouter = require('./dashboard');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// GET /api/config — exposes tunable PARAMS so the frontend never hardcodes limits.
app.get('/api/config', (req, res) => res.json(PARAMS));

app.use('/api/letters', lettersRouter);
app.use('/api/map', mapRouter);
app.use('/api/pocket', pocketRouter);
app.use('/api/dashboard', dashboardRouter);

// catches errors thrown/rejected in async route handlers (see `wrap` in
// letters.js/map.js/dashboard.js)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`LOOP server running on http://localhost:${PORT}`));
