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
const { publicRoutes, playerRoutes } = require('./routes/player.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const { schemaStatus } = require('./services/schemaCheck');
const { securityHeaders, requestId, corsOptions, limits } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
// Render / Vercel sit behind one proxy: trust it so req.ip is the real client (rate limits).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(requestId);
app.use(securityHeaders);
app.use(cors(corsOptions()));
// Payment screenshots / QR images are sent as small data URLs (≤ 400 KB); nothing needs more.
app.use(express.json({ limit: '1mb' }));

// ---- Rate limits ------------------------------------------------------------------
app.use('/api', limits.api);
app.use(['/api/events/public', '/api/public'], limits.publicRead);
app.post(
  [
    '/api/events/public/:token/register',
    '/api/events/public/:token/payment-proof',
    '/api/events/public/:token/claim-member',
    '/api/player/join/:token',
    '/api/player/participations/:id/transfer',
    '/api/events/:eventId/checkin-code',
    '/api/staff/events/:eventId/checkin-code',
    '/api/player/checkin-code/rotate',
    '/api/player/telegram/link',
  ],
  limits.sensitive
);
app.post(['/api/host/feedback', '/api/host/notifications/test'], limits.slow);

app.get('/health', (req, res) => res.json({ ok: true }));
// Which migrations (supabase/migrations/*.sql) still need to be run on this database.
app.get('/health/schema', async (req, res) => {
  try {
    res.json(await schemaStatus());
  } catch (err) {
    console.error('schema status failed', err);
    res.status(500).json({ ok: false, error: 'Schema check failed.' });
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
app.use('/api/player', requireAuth, playerRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/public', publicRoutes); // no login: club join pages

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  // Malformed / oversized JSON bodies are the client's fault, not a crash.
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(`[${req.id}]`, err);
  res.status(500).json({ error: 'Internal server error.', request_id: req.id });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Pickleball API listening on :${port}`));
