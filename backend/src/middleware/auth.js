const { supabase } = require('../supabase');

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
    req.hostEmail = data.user.email;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed.' });
  }
}

module.exports = { requireAuth, ensureHostRows };
