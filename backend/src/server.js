require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { requireAuth } = require('./middleware/auth');
const clubsRoutes = require('./routes/clubs.routes');
const eventsRoutes = require('./routes/events.routes');
const matchesRoutes = require('./routes/matches.routes');
const transactionsRoutes = require('./routes/transactions.routes');
const hostRoutes = require('./routes/host.routes');
const { staffGrantsRoutes, staffRoutes } = require('./routes/staff.routes');
const tournamentsRoutes = require('./routes/tournaments.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const { publicRoutes, playerRoutes } = require('./routes/player.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const liveRoutes = require('./routes/live.routes');
const { schemaStatus } = require('./services/schemaCheck');
const { startSurveySweeper } = require('./services/survey');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
// Which migrations (supabase/migrations/*.sql) still need to be run on this database.
app.get('/health/schema', async (req, res) => {
  try {
    res.json(await schemaStatus());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// /api/events contains its own public (unauthenticated) routes for shareable
// event links, declared before its internal `router.use(requireAuth)` — see
// events.routes.js. Do not add requireAuth here or those links will break.
app.use('/api/clubs', requireAuth, clubsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/matches', requireAuth, matchesRoutes);
app.use('/api/transactions', requireAuth, transactionsRoutes);
app.use('/api/host', requireAuth, hostRoutes);
app.use('/api/staff-grants', requireAuth, staffGrantsRoutes);
app.use('/api/staff', requireAuth, staffRoutes);
app.use('/api/tournaments', requireAuth, tournamentsRoutes);
app.use('/api/leaderboard', requireAuth, leaderboardRoutes);
app.use('/api/player', requireAuth, playerRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/live', requireAuth, liveRoutes);
app.get('/api/public/live/:token', liveRoutes.publicBoard); // no login: live scoreboard
app.use('/api/public', publicRoutes); // no login: club join pages

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Pickleball API listening on :${port}`));
// Thank-you + survey link to guests once their session is over.
if (process.env.SURVEY_SWEEP_DISABLED !== 'true') startSurveySweeper();
