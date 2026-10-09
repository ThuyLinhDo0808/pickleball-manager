// Small in-memory limiter for the sign-in endpoints (one server instance): at most
// `max` hits per key in `windowMs`. Returns a middleware; keys are built per request.
// RATE_LIMIT_DISABLED=true turns it off (tests).
function rateLimit({ windowMs, max, key = (req) => req.ip, code = 'rate_limited' }) {
  const hits = new Map(); // key -> [timestamps]
  setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
      const fresh = list.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh);
      else hits.delete(k);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    const k = key(req);
    if (!k) return next();
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - list[0])) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.', code });
    }
    list.push(now);
    hits.set(k, list);
    next();
  };
}

module.exports = { rateLimit };
