require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { requireAuth } = require('./middleware/auth');
const clubsRoutes = require('./routes/clubs.routes');
const eventsRoutes = require('./routes/events.routes');
const matchesRoutes = require('./routes/matches.routes');
const transactionsRoutes = require('./routes/transactions.routes');
const hostRoutes = require('./routes/host.routes');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// /api/events contains its own public (unauthenticated) routes for shareable
// event links, declared before its internal `router.use(requireAuth)` — see
// events.routes.js. Do not add requireAuth here or those links will break.
app.use('/api/clubs', requireAuth, clubsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/matches', requireAuth, matchesRoutes);
app.use('/api/transactions', requireAuth, transactionsRoutes);
app.use('/api/host', requireAuth, hostRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Pickleball API listening on :${port}`));
