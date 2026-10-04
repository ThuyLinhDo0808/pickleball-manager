// Who may work on a club: its owner, or a co-admin the owner granted by email
// (staff_grants.role = 'co_admin', scoped to that club). Co-admins manage members
// and finance but never delete the club, change where payments go, or rotate its join link.
const { supabase } = require('../supabase');
const { isUuid } = require('../utils/respond');
const { todayYmd } = require('./memberships');

// Inside the grant's optional validity dates (before migration 20261015090000: always).
const activeToday = (g, today = todayYmd()) => (!g.valid_from || g.valid_from <= today) && (!g.valid_until || g.valid_until >= today);

// -> { club, role: 'owner' | 'co_admin' } or null. Uses the signed-in account (req.userId),
// never req.hostId, which may already have been swapped to a club owner.
async function clubAccess(req, clubId) {
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
    .eq('role', 'co_admin')
    .eq('email', req.hostEmail.toLowerCase());
  return (rows || []).some((g) => activeToday(g)) ? { club, role: 'co_admin' } : null;
}

// Clubs shared with this account as co-admin (with the owner's email for display).
async function coAdminClubs(req) {
  if (!req.emailVerified || !req.hostEmail) return [];
  const { data: grants, error } = await supabase
    .from('staff_grants')
    .select('*')
    .eq('role', 'co_admin')
    .eq('email', req.hostEmail.toLowerCase())
    .not('club_id', 'is', null);
  if (error) throw error;
  const live = grants.filter((g) => activeToday(g));
  if (!live.length) return [];
  const { data: clubs, error: cErr } = await supabase.from('clubs').select('*').in('id', live.map((g) => g.club_id));
  if (cErr) throw cErr;
  const { data: owners } = clubs.length
    ? await supabase.from('users').select('id, email').in('id', [...new Set(clubs.map((c) => c.host_id))])
    : { data: [] };
  return clubs.map((c) => ({ ...c, role: 'co_admin', owner_email: (owners || []).find((u) => u.id === c.host_id)?.email || null }));
}

// Route guard for owner-only actions inside a router whose :clubId param may admit co-admins.
function ownerOnly(req, res, next) {
  if (req.coAdmin) return res.status(403).json({ error: 'Only the club owner can do this.', code: 'owner_only' });
  next();
}

module.exports = { clubAccess, coAdminClubs, ownerOnly };
