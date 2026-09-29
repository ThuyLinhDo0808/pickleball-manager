const { supabaseAdmin } = require('../config/supabase');

// Users who signed up before schema.sql was run (or whose signup trigger
// failed) would have no public.users / host_subscriptions row, and every
// insert would then fail on a foreign key. This makes the API self-healing:
// the first authenticated request per user per server run guarantees both rows.
const ensured = new Set();

async function ensureHostRows(user) {
  if (ensured.has(user.id)) return;

  const fullName =
    user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'Host');

  const { error: userErr } = await supabaseAdmin
    .from('users')
    .upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true });
  if (userErr) throw userErr;

  const { error: subErr } = await supabaseAdmin
    .from('host_subscriptions')
    .upsert({ host_id: user.id, tier: 'free' }, { onConflict: 'host_id', ignoreDuplicates: true });
  if (subErr) throw subErr;

  ensured.add(user.id);
}

/**
 * Verifies the Supabase access token sent by the mobile app as
 *   Authorization: Bearer <access_token>
 * and attaches the authenticated user to req.user.
 * Every route reads req.user.id as the host_id — never a value from the body.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  try {
    await ensureHostRows(data.user);
  } catch (e) {
    return res.status(500).json({
      error: 'Could not initialise your account. Has database/schema.sql been run in this Supabase project?',
      details: e.message,
    });
  }

  req.user = data.user;
  next();
}

module.exports = { requireAuth };
