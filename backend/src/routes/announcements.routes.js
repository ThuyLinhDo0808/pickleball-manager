// The owner's notices (set in /owner/announcements).
//   GET /api/public/announcements[?public=1]   no login: notices for everyone (public=1: only
//                                              those meant for public pages too)
//   GET /api/announcements/mine                 signed in: also the ones for my audience / clubs
//   GET /api/public/maintenance                 is the app under maintenance right now?
// Maintenance (kind 'maintenance'): before it starts it is a warning banner for everyone; from
// starts_at to ends_at nobody but the Owner (OWNER_EMAILS) signs in or uses the API — they get
// 503 `maintenance` with the message and the time the app comes back (see gate()).
const { supabase } = require('../supabase');
const { isOwner } = require('../services/owner');

const TTL_MS = 15 * 1000;
let cache = null;
let hasKinds = true; // false before 20261126090000_announcements_v2.sql

const COLS_V2 = 'id, title, message, level, kind, audience, club_id, starts_at, ends_at, show_public';
const COLS_V1 = 'id, message, level, starts_at, ends_at, show_public';

// Every notice running now, plus maintenance announced ahead of time. Cached briefly.
async function live() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const now = new Date().toISOString();
  const query = (cols) =>
    supabase.from('announcements').select(cols).eq('active', true).or(`ends_at.is.null,ends_at.gt.${now}`).order('starts_at', { ascending: false }).limit(50);
  let { data, error } = hasKinds ? await query(COLS_V2) : { data: null, error: { message: 'v1' } };
  if (error) {
    hasKinds = !/kind|audience|club_id|title|schema cache|does not exist|v1/i.test(error.message || '') && hasKinds;
    ({ data, error } = await query(COLS_V1));
  }
  const rows = (error ? [] : data || []).map((a) => ({ kind: 'notice', audience: 'all', club_id: null, title: null, ...a }));
  // A notice shows from its start; maintenance is announced at once and blocks from its start.
  const t = Date.now();
  const out = rows.filter((a) => a.kind === 'maintenance' || Date.parse(a.starts_at) <= t);
  cache = { at: Date.now(), rows: out };
  return out;
}
const forget = () => { cache = null; };

// Maintenance running right now (the latest one), or null.
async function maintenanceNow() {
  const t = Date.now();
  const m = (await live()).filter((a) => a.kind === 'maintenance' && Date.parse(a.starts_at) <= t && (!a.ends_at || Date.parse(a.ends_at) > t));
  if (!m.length) return null;
  const a = m[0];
  return { id: a.id, title: a.title, message: a.message, starts_at: a.starts_at, ends_at: a.ends_at };
}

const shape = (a) => ({ id: a.id, title: a.title, message: a.message, level: a.kind === 'maintenance' ? 'warning' : a.level, kind: a.kind, starts_at: a.starts_at, ends_at: a.ends_at, show_public: a.show_public });

async function current(req, res) {
  try {
    // Without login: only notices for everyone (maintenance always shows, it concerns all).
    const rows = (await live()).filter((a) => (a.kind === 'maintenance' || (a.audience === 'all' && !a.club_id)) && (req.query.public !== '1' || a.show_public || a.kind === 'maintenance'));
    res.set('Cache-Control', 'public, max-age=15').json(rows.slice(0, 5).map(shape));
  } catch {
    res.json([]);
  }
}

// Who the signed-in account is, for audiences: hosts = owns or co-manages a club /
// community; players = plays somewhere (a player profile or a member row); clubs = clubs it
// belongs to or manages.
async function whoIs(userId, email) {
  const [own, staff, member, profile] = await Promise.all([
    supabase.from('clubs').select('id').eq('host_id', userId),
    // co-admins and other club staff (granted by a confirmed email)
    email ? supabase.from('staff_grants').select('club_id').eq('email', String(email).toLowerCase()).not('club_id', 'is', null) : Promise.resolve({ data: [] }),
    supabase.from('club_members').select('club_id').eq('user_id', userId),
    supabase.from('player_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);
  const managed = [...(own.data || []).map((c) => c.id), ...((staff && staff.data) || []).map((c) => c.club_id)];
  const memberOf = (member.data || []).map((m) => m.club_id);
  return { host: managed.length > 0, player: !!profile.data || memberOf.length > 0, clubs: new Set([...managed, ...memberOf]) };
}

function forMe(a, me) {
  if (a.kind === 'maintenance') return true;
  if (a.club_id && !me.clubs.has(a.club_id)) return false;
  if (a.audience === 'hosts') return me.host;
  if (a.audience === 'players') return me.player;
  return true;
}

async function mine(req, res) {
  try {
    const rows = await live();
    const me = rows.some((a) => a.audience !== 'all' || a.club_id) ? await whoIs(req.userId || req.hostId, req.emailVerified ? req.hostEmail : null) : { host: false, player: false, clubs: new Set() };
    res.set('Cache-Control', 'private, max-age=15').json(rows.filter((a) => forMe(a, me)).slice(0, 5).map(shape));
  } catch {
    res.json([]);
  }
}

async function maintenance(req, res) {
  try {
    const now = await maintenanceNow();
    const next = now ? null : (await live()).filter((a) => a.kind === 'maintenance').sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] || null;
    res.set('Cache-Control', 'no-store').json({ active: !!now, maintenance: now, upcoming: next ? shape(next) : null });
  } catch {
    res.json({ active: false, maintenance: null, upcoming: null });
  }
}

// Paths that stay open during maintenance (the Owner Console checks its own access; the
// maintenance status and sign-in, which itself only lets the Owner in).
const OPEN = [/^\/health/, /^\/api\/public\/maintenance$/, /^\/api\/public\/announcements$/, /^\/api\/public\/auth\/login$/, /^\/api\/public\/auth\/mfa-reset/];
const ownerCache = new Map(); // token -> { at, owner }

async function tokenIsOwner(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  const hit = ownerCache.get(token);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.owner;
  const { data } = await supabase.auth.getUser(token).catch(() => ({ data: null }));
  const u = data?.user;
  const owner = !!u?.email_confirmed_at && isOwner(u.email);
  if (ownerCache.size > 500) ownerCache.clear();
  ownerCache.set(token, { at: Date.now(), owner });
  return owner;
}

const maintenanceBody = (m) => ({ error: 'The app is under maintenance.', code: 'maintenance', maintenance: m });

// Express middleware, before every route.
async function gate(req, res, next) {
  try {
    if (req.method === 'OPTIONS' || OPEN.some((r) => r.test(req.path))) return next();
    const m = await maintenanceNow();
    if (!m) return next();
    if (await tokenIsOwner(req)) return next();
    res.set('Retry-After', m.ends_at ? String(Math.max(60, Math.round((Date.parse(m.ends_at) - Date.now()) / 1000))) : '600');
    return res.status(503).json(maintenanceBody(m));
  } catch (err) {
    console.error('maintenance gate', err.message);
    return next();
  }
}

module.exports = { current, mine, maintenance, gate, forget, maintenanceNow, maintenanceBody, forMe, live };
