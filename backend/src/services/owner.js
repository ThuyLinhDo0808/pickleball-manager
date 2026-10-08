// The app owner (the people who run this platform): who they are, the audit log of
// what they change, and account suspension.
const { supabase } = require('../supabase');

// OWNER_EMAILS (comma-separated). ADMIN_EMAILS is the older name and still works.
// Kept in the server's environment, never in the database, so nobody can grant it to
// themselves through the app.
function ownerEmails() {
  return String(process.env.OWNER_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
const isOwner = (email) => !!email && ownerEmails().includes(String(email).toLowerCase());

// One audit row per change the owner makes. Never throws (the change already happened).
async function audit(req, { action, host = null, oldValue = null, newValue = null, note = null, undoOf = null }) {
  const { data, error } = await supabase
    .from('owner_audit_logs')
    .insert({
      actor_email: req.hostEmail,
      action,
      target_host_id: host?.id || null,
      target_email: host?.email || null,
      old_value: oldValue,
      new_value: newValue,
      note,
      undo_of: undoOf,
    })
    .select()
    .single();
  if (error) console.error('owner audit failed', error);
  return data || null;
}

// ---- Suspension ----------------------------------------------------------------
// Looked up on every signed-in request, so cached briefly; owner actions clear it.
const SUSPEND_TTL_MS = 30 * 1000;
const suspendCache = new Map(); // userId -> { at, value: null | { at, reason } }

async function suspensionOf(userId) {
  if (!userId) return null;
  const hit = suspendCache.get(userId);
  if (hit && Date.now() - hit.at < SUSPEND_TTL_MS) return hit.value;
  const { data, error } = await supabase.from('users').select('suspended_at, suspended_reason').eq('id', userId).maybeSingle();
  // Before the migration (no column) nobody is suspended.
  const value = !error && data?.suspended_at ? { at: data.suspended_at, reason: data.suspended_reason || null } : null;
  suspendCache.set(userId, { at: Date.now(), value });
  return value;
}
const forgetSuspension = (userId) => suspendCache.delete(userId);

// Paths a suspended account may still use: playing (player portal, signing up as a
// player) and reading its own plan / the notice. Everything that manages is blocked.
const OPEN_WHEN_SUSPENDED = [/^\/api\/player(\/|$)/, /^\/api\/events\/public\//, /^\/api\/host\/plan$/, /^\/api\/owner(\/|$)/];

function suspendedResponse(res, s) {
  return res.status(423).json({ error: 'This account is suspended.', code: 'account_suspended', reason: s.reason, since: s.at });
}

module.exports = { ownerEmails, isOwner, audit, suspensionOf, forgetSuspension, OPEN_WHEN_SUSPENDED, suspendedResponse };
