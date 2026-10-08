const { supabase } = require('../supabase');
const { suspensionOf, OPEN_WHEN_SUSPENDED, suspendedResponse } = require('../services/owner');
const viewAs = require('../services/viewAs');

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
    req.hostEmail = data.user.email;
    // Staff access is granted by email, so only trust an email Supabase has confirmed.
    req.emailVerified = !!data.user.email_confirmed_at;
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
