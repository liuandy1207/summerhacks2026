// App wiring only: no business logic here. Add new route groups by
// creating a file in server/routes/ and mounting it below.
const express = require('express');
const cors = require('cors');
const path = require('path');

const lettersRouter = require('./routes/letters');
const mapRouter = require('./routes/map');
const pocketRouter = require('./routes/pocket');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/letters', lettersRouter);
app.use('/api/map', mapRouter);
app.use('/api/pocket', pocketRouter);
app.use('/api/dashboard', dashboardRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`LOOP server running on http://localhost:${PORT}`));
