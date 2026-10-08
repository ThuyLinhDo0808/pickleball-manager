// Support staff: people who help run the app from the owner console with only some
// of its parts. Owners (OWNER_EMAILS) add them in Owner Console → Nhân viên. What
// each permission opens is listed in ROUTES; anything not listed (suspensions, club
// transfers, system settings, the audit log, managing staff) stays with the owners.
const { supabase } = require('../supabase');
const owner = require('./owner');

const PERMISSIONS = ['stats', 'hosts', 'payments', 'plans', 'feedback', 'announcements', 'promos', 'view_as'];

// [methods, path under /api/owner, permission]
const ROUTES = [
  ['GET', '/overview', 'stats'],
  ['GET', '/hosts', 'hosts'],
  ['GET', '/hosts/:id', 'hosts'],
  ['POST', '/hosts/:id/notes', 'hosts'],
  ['GET', '/activity/(clubs|xeve)', 'hosts'],
  ['PATCH', '/hosts/:id/subscription', 'plans'],
  ['PATCH', '/clubs/:id/member-addon', 'plans'],
  ['GET', '/payments', 'payments'],
  ['POST', '/payments/:id/(confirm|cancel)', 'payments'],
  ['GET', '/feedback', 'feedback'],
  ['PATCH', '/feedback/:id', 'feedback'],
  ['GET POST', '/announcements', 'announcements'],
  ['PATCH', '/announcements/:id', 'announcements'],
  ['GET POST', '/promos', 'promos'],
  ['GET', '/promos/:id/redemptions', 'promos'],
  ['PATCH', '/promos/:id', 'promos'],
].map(([m, p, perm]) => ({ methods: m.split(' '), path: new RegExp(`^${p.replace(/:id/g, '[^/]+')}$`), perm }));

// The permission a console request needs; null = owners only.
function permissionFor(method, path) {
  const hit = ROUTES.find((r) => r.methods.includes(method) && r.path.test(path));
  return hit ? hit.perm : null;
}

const TTL_MS = 30 * 1000;
const cache = new Map(); // email -> { at, value }
const forget = (email) => (email ? cache.delete(String(email).toLowerCase()) : cache.clear());

// The active support row for this email, or null.
async function supportOf(email) {
  if (!email) return null;
  const key = String(email).toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const { data, error } = await supabase.from('support_staff').select('email, full_name, permissions, active').eq('email', key).maybeSingle();
  const value = !error && data?.active ? { ...data, permissions: (data.permissions || []).filter((p) => PERMISSIONS.includes(p)) } : null;
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Who this is in the owner console: { owner: true } | { support: true, permissions } | null.
async function consoleAccess(email) {
  if (owner.isOwner(email)) return { owner: true, permissions: PERMISSIONS };
  const s = await supportOf(email);
  return s ? { support: true, permissions: s.permissions, full_name: s.full_name } : null;
}

const can = (access, perm) => !!access && (access.owner || access.permissions.includes(perm));

module.exports = { PERMISSIONS, permissionFor, supportOf, consoleAccess, can, forget };
