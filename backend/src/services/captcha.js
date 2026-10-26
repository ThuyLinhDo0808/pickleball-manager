// Bot check (Cloudflare Turnstile) for sign-in, sign-up and "forgot password": stops
// scripts that try thousands of passwords or make fake accounts. Off until
// TURNSTILE_SECRET_KEY is set on the server (and NEXT_PUBLIC_TURNSTILE_SITE_KEY on the web).
// If Cloudflare cannot be reached the request goes through (logged), so an outage there
// never locks real people out; the rate limits still apply.
const VERIFY_URL = () => process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const enabled = () => !!process.env.TURNSTILE_SECRET_KEY;

async function verify(token, ip) {
  if (!enabled()) return { ok: true, skipped: true };
  const t = String(token || '');
  if (!t || t.length > 2048) return { ok: false };
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: t, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch(VERIFY_URL(), { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!r.ok) {
      console.error('captcha verify http', r.status);
      return { ok: true, degraded: true };
    }
    const j = await r.json();
    return { ok: j.success === true };
  } catch (err) {
    console.error('captcha verify', err.message);
    return { ok: true, degraded: true };
  }
}

// Middleware: body.captcha_token must pass. 400 captcha_failed otherwise.
function requireCaptcha(req, res, next) {
  if (!enabled()) return next();
  verify(req.body?.captcha_token, req.ip).then((v) => {
    if (v.ok) return next();
    res.status(400).json({ error: 'Please confirm you are not a robot and try again.', code: 'captcha_failed' });
  }, next);
}

module.exports = { enabled, verify, requireCaptcha };
