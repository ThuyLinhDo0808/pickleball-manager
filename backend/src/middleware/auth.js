const { supabase } = require('../supabase');
const { suspensionOf, OPEN_WHEN_SUSPENDED, suspendedResponse } = require('../services/owner');
const viewAs = require('../services/viewAs');
const security = require('../services/accountSecurity');
const emailVerify = require('../services/emailVerify');

// Self-healing: if a host's users/host_subscriptions rows are somehow missing
// (e.g. account existed before the bootstrap trigger), create them on the fly.
const ensuredHosts = new Set();

async function ensureHostRows(userId, email) {
  if (ensuredHosts.has(userId)) return;
  await supabase.from('users').upsert({ id: userId, email }, { onConflict: 'id' });
  await supabase.from('host_subscriptions').upsert(
    { host_id: userId },
    { onConflict: 'host_id', ignoreDuplicates: true }
  );
  ensuredHosts.add(userId);
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session.' });

    await ensureHostRows(data.user.id, data.user.email);
    req.hostId = data.user.id;
    // The signed-in account itself. req.hostId can later be swapped to a club's owner
    // when this account is that club's co-admin (see services/clubAccess.js).
    req.userId = data.user.id;
    // What was typed at sign-up (e.g. the DUPR ID, used to fill the welcome step).
    req.authMeta = data.user.user_metadata || {};
    // An account whose email is not confirmed yet (quick sign-up, see services/emailVerify.js)
    // gets no rights from its email: no owner / support console, no club roles given by
    // email. req.hostEmail is then null; req.accountEmail is the address it signed up with.
    const unverified = await emailVerify.unverifiedSince(data.user.id).catch(() => null);
    req.accountEmail = data.user.email;
    req.emailUnverified = !!unverified;
    req.hostEmail = unverified ? null : data.user.email;
    // Staff access is granted by email, so only trust an email that has been confirmed.
    req.emailVerified = !!data.user.email_confirmed_at && !unverified;
    // Which sign-in session this is (two-step sign-in is tied to it) and when the token was
    // issued ("sign out on every device" refuses older ones).
    const info = security.tokenInfo(token);
    req.sessionKey = info.sessionKey;
    req.tokenIat = info.iat;
    req.accessToken = token;
    const blocked = await security.gate(req);
    if (blocked) return res.status(blocked.status).json(blocked.body);
    // Managers (club / community / kèo hosts and club staff) need two-step sign-in on.
    const enroll = await security.managerGate(req);
    if (enroll) return res.status(enroll.status).json(enroll.body);
    // The owner viewing the app as one Host (read-only, see services/viewAs.js).
    if (req.headers['x-view-as']) {
      if (await viewAs.apply(req, res)) return;
      if (req.viewAs) return next();
    }
    // A suspended account can still play, but not manage anything.
    const path = (req.originalUrl || '').split('?')[0];
    if (!OPEN_WHEN_SUSPENDED.some((re) => re.test(path))) {
      const s = await suspensionOf(data.user.id);
      if (s) return suspendedResponse(res, s);
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed.' });
  }
}

// For public routes: attach the user if a valid token is sent, otherwise carry on anonymously.
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) {
        await ensureHostRows(data.user.id, data.user.email);
        req.userId = data.user.id;
      }
    }
  } catch {
    /* anonymous */
  }
  next();
}

// After an account is deleted, its rows must not be silently re-created from the cache.
function forgetHost(userId) {
  ensuredHosts.delete(userId);
}

module.exports = { requireAuth, optionalAuth, ensureHostRows, forgetHost };
