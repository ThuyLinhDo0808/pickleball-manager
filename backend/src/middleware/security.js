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
// Falls back to PUBLIC_WEB_URL. With neither set, any origin is allowed (local dev) and a
// warning is printed — set it in production.
function corsOptions() {
  const list = (process.env.CORS_ORIGIN || process.env.PUBLIC_WEB_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!list.length || list.includes('*')) {
    if (isProd) console.warn('[security] CORS_ORIGIN is not set: the API accepts browser calls from any website. Set CORS_ORIGIN to your web URL.');
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

module.exports = { securityHeaders, requestId, corsOptions, rateLimit, limits, isProd };
