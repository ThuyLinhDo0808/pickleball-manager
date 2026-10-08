// Who may work on a club: its owner, or a co-admin the owner granted by email
// (staff_grants.role = 'co_admin', scoped to that club). Co-admins manage members
// and finance but never delete the club, change where payments go, or rotate its join link.
const { supabase } = require('../supabase');
const { isUuid } = require('../utils/respond');
const { todayYmd } = require('./memberships');
const { CLUB_ROLES, LIMITED_ROLES, permits } = require('./clubRoles');

// Inside the grant's optional validity dates (before migration 20261015090000: always).
const activeToday = (g, today = todayYmd()) => (!g.valid_from || g.valid_from <= today) && (!g.valid_until || g.valid_until >= today);

// Club staff roles (Finance / Operations) only count while the owner's plan includes them.
async function rolesAllowed(hostId) {
  const p = await require('./plan').getPlan(hostId);
  return !p.features_enforced || !!p.features.staff_roles;
}


// -> { club, role: 'owner' | 'co_admin' | 'finance' | 'operator', roles } or null. Uses
// the signed-in account (req.userId), never req.hostId, which may already have been
// swapped to a club owner. Finance / Operations are checked against this request's
// route (services/clubRoles.js); anything else returns null with req.roleForbidden set,
// so the caller can answer 403 role_forbidden (or simply not found).
async function clubAccess(req, clubId, { check = true } = {}) {
  if (!isUuid(clubId)) return null;
  const { data: club, error } = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
  if (error) throw error;
  if (!club) return null;
  const me = req.userId || req.hostId;
  if (club.host_id === me) return { club, role: 'owner' };
  // Grants are by email, so only an address Supabase has confirmed counts.
  if (!req.emailVerified || !req.hostEmail) return null;
  const { data: rows } = await supabase
    .from('staff_grants')
    .select('*')
    .eq('host_id', club.host_id)
    .eq('club_id', club.id)
    .in('role', CLUB_ROLES)
    .eq('email', req.hostEmail.toLowerCase());
  let roles = [...new Set((rows || []).filter((g) => activeToday(g)).map((g) => g.role))];
  if (roles.some((r) => LIMITED_ROLES.includes(r)) && !(await rolesAllowed(club.host_id))) roles = roles.filter((r) => !LIMITED_ROLES.includes(r));
  if (!roles.length) return null;
  const role = roles.includes('co_admin') ? 'co_admin' : roles[0];
  if (check && !permits(roles, req.method, req.originalUrl, req.body)) {
    req.roleForbidden = true;
    return null;
  }
  return { club, role, roles };
}

// Clubs shared with this account (co-admin, Finance or Operations), with the owner's
// email for display and the role (co_admin wins over the others). `roles` narrows it.
async function coAdminClubs(req, roles = CLUB_ROLES) {
  if (!req.emailVerified || !req.hostEmail) return [];
  const { data: grants, error } = await supabase
    .from('staff_grants')
    .select('*')
    .in('role', roles)
    .eq('email', req.hostEmail.toLowerCase())
    .not('club_id', 'is', null);
  if (error) throw error;
  const live = [];
  for (const g of grants.filter((x) => activeToday(x))) {
    if (LIMITED_ROLES.includes(g.role) && !(await rolesAllowed(g.host_id))) continue;
    live.push(g);
  }
  if (!live.length) return [];
  const { data: clubs, error: cErr } = await supabase.from('clubs').select('*').in('id', live.map((g) => g.club_id));
  if (cErr) throw cErr;
  const { data: owners } = clubs.length
    ? await supabase.from('users').select('id, email').in('id', [...new Set(clubs.map((c) => c.host_id))])
    : { data: [] };
  const roleOf = (c) => {
    const rs = live.filter((g) => g.club_id === c.id).map((g) => g.role);
    return rs.includes('co_admin') ? 'co_admin' : rs[0];
  };
  return clubs.map((c) => ({ ...c, role: roleOf(c), owner_email: (owners || []).find((u) => u.id === c.host_id)?.email || null }));
}

// The club owner's id when this account may work on the club (owner or co-admin), else null.
async function actingHost(req, clubId) {
  const access = await clubAccess(req, clubId);
  return access ? access.club.host_id : null;
}

// May this account work on the event? Its host, or club staff of its club (Finance /
// Operations only for what their role allows). -> { hostId, coAdmin, role } or null.
async function eventAccess(req, event) {
  if (!event) return null;
  const me = req.userId || req.hostId;
  if (event.host_id === me) return { hostId: me, coAdmin: false };
  if (!event.club_id) return null;
  const access = await clubAccess(req, event.club_id);
  return access && access.club.host_id === event.host_id ? { hostId: event.host_id, coAdmin: true, role: access.role } : null;
}

// Ids of the clubs this account works on as staff (optionally only some roles).
async function coAdminClubIds(req, roles) {
  return (await coAdminClubs(req, roles)).map((c) => c.id);
}

// Route guard for owner-only actions inside a router whose :clubId param may admit co-admins.
function ownerOnly(req, res, next) {
  if (req.coAdmin) return res.status(403).json({ error: 'Only the club owner can do this.', code: 'owner_only' });
  next();
}

const ROLE_FORBIDDEN = { error: 'Your role in this club does not allow this.', code: 'role_forbidden' };

module.exports = { ROLE_FORBIDDEN, clubAccess, coAdminClubs, coAdminClubIds, actingHost, eventAccess, ownerOnly };
