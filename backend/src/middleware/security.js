// HTTP-level protections for the API: security headers, CORS allow-list, rate limits,
// request ids. Dependency-free on purpose (small, auditable, no supply-chain surface).
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

// ---- Security headers ---------------------------------------------------------
// The API only returns JSON, so the browser may do nothing with it except read it.
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Personal / financial data must never sit in a shared cache.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// ---- Request id (ties a user-visible error to the server log) ------------------
function requestId(req, res, next) {
  req.id = crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}

// ---- CORS ------------------------------------------------------------------------
// CORS_ORIGIN: comma-separated list of web origins (e.g. https://my-app.vercel.app).
// Falls back to PUBLIC_WEB_URL. Outside production, none set = any origin (local dev).
// In production the API refuses to start without a real list: a missing variable must
// never silently open the API to every website.
function corsOptions() {
  const list = (process.env.CORS_ORIGIN || process.env.PUBLIC_WEB_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!list.length || list.includes('*')) {
    if (isProd) {
      throw new Error('[security] CORS_ORIGIN must list the web address(es) in production (e.g. https://your-app.vercel.app); "*" is not allowed.');
    }
    return { origin: '*', maxAge: 600 };
  }
  return {
    origin(origin, cb) {
      // Server-to-server calls (Telegram webhook, health checks) send no Origin header.
      if (!origin || list.includes(origin.replace(/\/+$/, ''))) return cb(null, true);
      return cb(null, false);
    },
    maxAge: 600,
  };
}

// ---- Rate limiting (fixed window, in memory) ------------------------------------
const MAX_KEYS = Number(process.env.RATE_LIMIT_MAX_KEYS || 100_000);
// Enough for a single API instance (Render). Keyed by client IP (+ a name per limiter).
function rateLimit({ name, windowMs, max, message = 'Too many requests, please slow down.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    const now = Date.now();
    const key = `${name}|${req.ip}`;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      // A flood from many addresses must not fill the memory: past MAX_KEYS, drop
      // finished windows, then the oldest tenth (Map keeps insertion order).
      if (hits.size >= MAX_KEYS) {
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
        if (hits.size >= MAX_KEYS) {
          let n = Math.ceil(MAX_KEYS / 10);
          for (const k of hits.keys()) {
            hits.delete(k);
            if (--n <= 0) break;
          }
        }
      }
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(max - entry.count, 0)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message, code: 'rate_limited' });
    }
    next();
  };
}

const limits = {
  // everything under /api
  api: rateLimit({ name: 'api', windowMs: 60_000, max: Number(process.env.RATE_LIMIT_API || 600) }),
  // pages anyone can open (event link, ticket, club join page)
  publicRead: rateLimit({ name: 'public', windowMs: 60_000, max: 120 }),
  // actions that create things or could be brute-forced
  sensitive: rateLimit({ name: 'sensitive', windowMs: 60_000, max: 30, message: 'Too many attempts. Please wait a minute and try again.' }),
  // feedback / test notifications: easy to spam
  slow: rateLimit({ name: 'slow', windowMs: 10 * 60_000, max: 10, message: 'Too many messages. Please try again later.' }),
};

// ---- Blocked addresses ------------------------------------------------------------
// BLOCKED_IPS on the server (comma-separated IPs or IPv4 /24 /16 prefixes such as
// "203.0.113.7, 198.51.100."): those addresses get 403 at once. For stopping one attacker
// quickly without a code change; a firewall in front (Cloudflare) is the real wall.
function blockList() {
  const raw = (process.env.BLOCKED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (ip) => {
    const v = String(ip || '').replace(/^::ffff:/, '');
    return raw.some((b) => (b.endsWith('.') || b.endsWith(':') ? v.startsWith(b) : v === b));
  };
}
function blockIps() {
  const isBlocked = blockList();
  return (req, res, next) => (isBlocked(req.ip) ? res.status(403).json({ error: 'Forbidden.', code: 'blocked' }) : next());
}

// ---- Load shedding -------------------------------------------------------------------
// When the server is overloaded (the event loop lags more than OVERLOAD_LAG_MS, default
// 1 s), answer new API calls with a quick 503 + Retry-After instead of queueing them until
// everything times out. The health check and requests already running are not affected,
// and the server recovers by itself once the flood stops.
const LAG_LIMIT = Number(process.env.OVERLOAD_LAG_MS || 1000);
let lag = 0;
{
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    lag = Math.max(0, now - last - 500);
    last = now;
  }, 500).unref();
}
function shedLoad(req, res, next) {
  if (lag > LAG_LIMIT && req.path.startsWith('/api/')) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'The server is busy. Please try again in a few seconds.', code: 'overloaded' });
  }
  next();
}
const currentLag = () => lag;

module.exports = { securityHeaders, requestId, corsOptions, rateLimit, limits, isProd, blockIps, blockList, shedLoad, currentLag };
