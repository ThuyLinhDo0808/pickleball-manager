require('dotenv').config();
const express = require('express');
// Express 4 does not catch errors of async handlers: pass a rejected promise on to the
// error handler (e.g. 402 plan_expired thrown by a plan check) instead of hanging.
{
  const Layer = require('express/lib/router/layer');
  const handle = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handleAsync(req, res, next) {
    if (this.handle.length > 3) return handle.call(this, req, res, next);
    try {
      const out = this.handle(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}
const cors = require('cors');

const { requireAuth } = require('./middleware/auth');
const clubsRoutes = require('./routes/clubs.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const ownerRoutes = require('./routes/owner.routes');
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
const { securityHeaders, requestId, corsOptions, limits, blockIps, shedLoad, cloudflareIp, originGuard } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
// Render / Vercel sit behind one proxy: trust it so req.ip is the real client (rate limits).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(requestId);
app.use(originGuard);
app.use(cloudflareIp);
app.use(blockIps());
app.use(shedLoad);
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
    '/api/events/public/:token/pay-later',
    '/api/events/public/:token/vote',
    '/api/player/discover/:clubId/join',
    '/api/player/invite/:token/join',
    '/api/public/surveys/:token',
    '/api/public/surveys/:token/join',
    '/api/public/surveys/:token/skip',
    '/api/public/quick/:eventId/open',
    '/api/public/quick/:eventId/book',
    '/api/public/quick/booking/:token/proof',
  ],
  limits.sensitive
);
// Easy to spam, and each one emails / notifies the owner or a host.
app.post(['/api/host/feedback', '/api/host/notifications/test', '/api/host/club-requests', '/api/host/plan/request'], limits.slow);

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

// Maintenance (Owner Console → Thông báo → Bảo trì): only the Owner gets through.
app.use(require('./routes/announcements.routes').gate);
app.use(require('./services/activityLog').recorder); // club activity log (Pro)

// /api/events contains its own public (unauthenticated) routes for shareable
// event links, declared before its internal `router.use(requireAuth)` — see
// events.routes.js. Do not add requireAuth here or those links will break.
app.use('/api/clubs', requireAuth, clubsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/matches', requireAuth, matchesRoutes);
app.use('/api/transactions', requireAuth, transactionsRoutes);
app.use('/api/host/security', requireAuth, require('./routes/security.routes')); // 2-step sign-in, devices, sign out everywhere
app.use('/api/host/privacy', requireAuth, require('./routes/privacy.routes')); // consent, download my data
app.use('/api/host', requireAuth, hostRoutes);
app.use('/api/staff-grants', requireAuth, staffGrantsRoutes);
app.use('/api/staff', requireAuth, staffRoutes);
app.use('/api/tournaments', requireAuth, tournamentsRoutes);
app.use('/api/leaderboard', requireAuth, leaderboardRoutes);
app.use('/api/player', requireAuth, playerRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/live', requireAuth, liveRoutes);
app.use('/api/inventory', requireAuth, inventoryRoutes);
app.use('/api/owner', requireAuth, ownerRoutes);
app.get('/api/public/live/:token', liveRoutes.publicBoard); // no login: live scoreboard
app.use('/api/public/auth', require('./routes/auth.routes')); // no login: sign in / sign up / forgot password
app.get('/api/public/announcements', require('./routes/announcements.routes').current); // no login: owner's banner
app.get('/api/public/maintenance', require('./routes/announcements.routes').maintenance); // no login: is the app under maintenance?
app.get('/api/announcements/mine', requireAuth, require('./routes/announcements.routes').mine); // owner's notices for my audience / clubs
app.use('/api/public/quick', require('./routes/quick.routes')); // no login: quick booking by the Host's 30-second invite link
app.use('/api/public', publicRoutes); // no login: club join pages

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  // Malformed / oversized JSON bodies are the client's fault, not a crash.
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  // Answers thrown on purpose (plan limits, plan ended…) keep their status and code.
  if (err?.code && [400, 402, 403, 404, 409, 410, 423].includes(err.status)) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.kind ? { kind: err.kind } : {}) });
  }
  console.error(`[${req.id}]`, err);
  res.status(500).json({ error: 'Internal server error.', request_id: req.id });
});

const port = process.env.PORT || 4000;
// Slow-client attacks (slowloris: headers or body sent one byte at a time) must not hold
// connections open: unfinished headers are cut after 20 s, a whole request after 30 s
// (checked every 5 s). Keep-alive stays a little longer than the load balancer's.
const server = require('http').createServer(
  {
    connectionsCheckingInterval: 5_000,
    headersTimeout: Number(process.env.HEADERS_TIMEOUT_MS || 20_000),
    requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS || 30_000),
    keepAliveTimeout: Number(process.env.KEEPALIVE_TIMEOUT_MS || 65_000),
  },
  app
);
server.listen(port, () => console.log(`Pickleball API listening on :${port}`));
server.maxHeadersCount = 100;
// One failed background task must not take the whole API down; a real crash restarts it.
process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
  process.exit(1);
});
// Thank-you + survey link to guests once their session is over.
if (process.env.SURVEY_SWEEP_DISABLED !== 'true') startSurveySweeper();
// Deletes old transfer screenshots / sign-in devices (services/privacy.js).
if (process.env.RETENTION_SWEEP_DISABLED !== 'true') require('./services/privacy').startRetentionSweeper();
