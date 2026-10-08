const express = require('express');
const { clubSport } = require('../services/sport');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { todayYmd } = require('../services/memberships');
const { setAttendance, checkInByCode, promoteParticipant } = require('../services/attendance');
const { getUsage } = require('../middleware/checkCapacity');
const { HOLDS_PLACE } = require('../services/fees');
const { PLAYER_SELECT, createMatch, updateMatch } = require('../services/matches');
const { schemaStatus } = require('../services/schemaCheck');
const { getPlan } = require('../services/plan');
const { GROUP_NAMES } = require('../services/clubRoles');

const EVENT_ROLES = ['referee', 'coordinator'];
// co_admin: co-owner of one club (members + finance); handled by services/clubAccess.js, not here.
const ROLES = [...EVENT_ROLES, 'co_admin', 'finance', 'operator'];
// Roles for one club. Finance / Operations need the Advanced plan (seats per club by plan).
const CLUB_ONLY = ['co_admin', 'finance', 'operator'];
const SEAT_ROLES = ['finance', 'operator'];
const ROLE_ERROR = 'role must be referee, coordinator, co_admin, finance or operator.';

// 402 when the owner's plan has no Finance / Operations roles, or this club's seats for
// the role are taken. `except` = a grant being changed (doesn't count against itself).
async function seatProblem(hostId, role, clubId, except = null) {
  if (!SEAT_ROLES.includes(role)) return null;
  const plan = await getPlan(hostId);
  if (!plan.features_enforced) return null;
  if (!plan.features.staff_roles) return { status: 402, body: { error: 'Finance and Operations roles need the Advanced plan or higher.', code: 'feature_locked', feature: 'staff_roles', min_tier: 'advanced' } };
  const seats = plan.role_seats?.[role];
  if (seats == null) return null;
  let q = supabase.from('staff_grants').select('id', { count: 'exact', head: true }).eq('host_id', hostId).eq('club_id', clubId).eq('role', role);
  if (except) q = q.neq('id', except);
  const { count } = await q;
  if ((count || 0) >= seats) return { status: 402, body: { error: `Your ${plan.tier} plan allows ${seats} ${role} per club. Upgrade to Pro for more.`, code: 'role_seats', role, limit: seats } };
  return null;
}
// Custom permissions (Pro): permission groups replacing a Finance / Operations role's
// defaults. [] or null = the role's defaults. -> { value } or { status, body }.
async function cleanPermissions(hostId, role, value) {
  if (value == null || (Array.isArray(value) && !value.length)) return { value: null };
  if (!SEAT_ROLES.includes(role)) return { status: 400, body: { error: 'Custom permissions are for Finance and Operations roles.', code: 'bad_permissions' } };
  if (!Array.isArray(value) || value.some((g) => !GROUP_NAMES.includes(g))) return { status: 400, body: { error: `permissions: any of ${GROUP_NAMES.join(', ')}.`, code: 'bad_permissions' } };
  const plan = await getPlan(hostId);
  if (plan.features_enforced && !plan.features.custom_roles) return { status: 402, body: { error: 'Custom permissions need the Pro plan.', code: 'feature_locked', feature: 'custom_roles', min_tier: 'pro' } };
  return { value: [...new Set(value)] };
}
const RANK = { referee: 1, coordinator: 2 };
// What each role may do. Neither ever sees phones, fees or any finance data.
const CAN = {
  referee: { checkIn: false, scores: true, walkIn: false, promote: false, courts: false },
  // Coordinators run the session at the court: check-in, walk-ins, the waitlist, courts.
  coordinator: { checkIn: true, scores: true, walkIn: true, promote: true, courts: true },
};

function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message }) : dbError(res, err);
}

const SCOPES = ['all', 'clubs', 'xeve'];
const GRANT_MIGRATION = '20261015090000_staff_grant_scope.sql';

async function scopesReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(GRANT_MIGRATION);
}

// A grant is active today when today is inside its (optional) validity window.
function activeToday(g, today = todayYmd()) {
  return (!g.valid_from || g.valid_from <= today) && (!g.valid_until || g.valid_until >= today);
}

// Does this grant cover the event? One event, one club's sessions, or a broad scope.
function covers(g, event) {
  if (g.event_id) return g.event_id === event.id;
  if (g.club_id) return g.club_id === event.club_id;
  const scope = g.scope || 'all';
  if (scope === 'clubs') return !!event.club_id;
  if (scope === 'xeve') return !event.club_id;
  return true;
}

// Validity dates from the body ('' clears). Throws a 400 message.
function cleanWindow(body) {
  const out = {};
  for (const k of ['valid_from', 'valid_until']) {
    if (!(k in body)) continue;
    const v = body[k] || null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw Object.assign(new Error(`${k} must be YYYY-MM-DD.`), { status: 400 });
    out[k] = v;
  }
  if (out.valid_from && out.valid_until && out.valid_until < out.valid_from) {
    throw Object.assign(new Error('The end date is before the start date.'), { status: 400, code: 'bad_window' });
  }
  return out;
}

function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function shiftDay(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// Host side: manage who has staff access  —  /api/staff-grants
// =============================================================================
const grants = express.Router();

grants.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('staff_grants')
    .select('*, clubs(name), events(title, event_date)')
    .eq('host_id', req.hostId)
    .order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  res.json(data);
});

grants.post('/', async (req, res) => {
  const email = cleanEmail(req.body.email);
  const { role } = req.body;
  const club_id = req.body.club_id || null;
  const event_id = req.body.event_id || null;
  if (!email) return res.status(400).json({ error: 'A valid email is required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: ROLE_ERROR });
  if (club_id && event_id) return res.status(400).json({ error: 'Choose one club or one event, not both.' });
  const ready = await scopesReady();
  const scope = club_id || event_id ? 'all' : req.body.scope || 'all';
  if (!SCOPES.includes(scope)) return res.status(400).json({ error: 'scope must be all, clubs or xeve.' });
  if (scope !== 'all' && !ready) return res.status(409).json({ error: `Run migration ${GRANT_MIGRATION} first.` });
  let window = {};
  try {
    window = ready ? cleanWindow(req.body) : {};
  } catch (err) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (CLUB_ONLY.includes(role) && !club_id) return res.status(400).json({ error: 'This role is always for one club.', code: 'co_admin_needs_club' });
  if (email === String(req.hostEmail || '').toLowerCase()) {
    return res.status(400).json({ error: 'You already have full access to your own events.' });
  }

  if (club_id) {
    if (!isUuid(club_id)) return notFound(res, 'Club');
    const { data } = await supabase.from('clubs').select('id').eq('id', club_id).eq('host_id', req.hostId).maybeSingle();
    if (!data) return notFound(res, 'Club');
    const problem = await seatProblem(req.hostId, role, club_id);
    if (problem) return res.status(problem.status).json(problem.body);
  }
  const perms = await cleanPermissions(req.hostId, role, req.body.permissions);
  if (perms.status) return res.status(perms.status).json(perms.body);
  if (event_id) {
    if (!isUuid(event_id)) return notFound(res, 'Event');
    const { data } = await supabase.from('events').select('id').eq('id', event_id).eq('host_id', req.hostId).maybeSingle();
    if (!data) return notFound(res, 'Event');
  }

  const { data, error } = await supabase
    .from('staff_grants')
    .insert({ host_id: req.hostId, email, full_name: String(req.body.full_name || '').trim() || null, role, club_id, event_id, ...(ready ? { scope, ...window } : {}), ...(perms.value ? { permissions: perms.value } : {}) })
    .select('*, clubs(name), events(title, event_date)')
    .single();
  if (error?.code === '23505') return res.status(409).json({ error: 'This person already has access for that scope.' });
  if (error?.code === '22P02' && SEAT_ROLES.includes(role)) return res.status(409).json({ error: 'Run migration 20261029090000_club_staff_roles.sql first.' });
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

grants.patch('/:grantId', async (req, res) => {
  if (!isUuid(req.params.grantId)) return notFound(res, 'Grant');
  const patch = {};
  if ('role' in req.body) {
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: ROLE_ERROR });
    patch.role = req.body.role;
  }
  if ('valid_from' in req.body || 'valid_until' in req.body) {
    if (!(await scopesReady())) return res.status(409).json({ error: `Run migration ${GRANT_MIGRATION} first.` });
    try {
      Object.assign(patch, cleanWindow(req.body));
    } catch (err) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
  }
  // Custom permissions (co-admins always have everything, so theirs are ignored).
  if ('permissions' in req.body) {
    const { data: cur } = await supabase.from('staff_grants').select('role').eq('id', req.params.grantId).eq('host_id', req.hostId).maybeSingle();
    const role = patch.role || cur?.role;
    const perms = SEAT_ROLES.includes(role) ? await cleanPermissions(req.hostId, role, req.body.permissions) : { value: null };
    if (perms.status) return res.status(perms.status).json(perms.body);
    patch.permissions = perms.value;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' });
  if (CLUB_ONLY.includes(patch.role)) {
    const { data: g } = await supabase.from('staff_grants').select('club_id').eq('id', req.params.grantId).eq('host_id', req.hostId).maybeSingle();
    if (g && !g.club_id) return res.status(400).json({ error: 'This role is always for one club.', code: 'co_admin_needs_club' });
    if (g) {
      const problem = await seatProblem(req.hostId, patch.role, g.club_id, req.params.grantId);
      if (problem) return res.status(problem.status).json(problem.body);
    }
  }
  const { data, error } = await supabase
    .from('staff_grants')
    .update(patch)
    .eq('id', req.params.grantId)
    .eq('host_id', req.hostId)
    .select('*, clubs(name), events(title, event_date)')
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Grant');
  res.json(data);
});

grants.delete('/:grantId', async (req, res) => {
  if (!isUuid(req.params.grantId)) return notFound(res, 'Grant');
  const { error } = await supabase.from('staff_grants').delete().eq('id', req.params.grantId).eq('host_id', req.hostId);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// =============================================================================
// Staff side: what a referee / coordinator can see and do  —  /api/staff
// =============================================================================
const staff = express.Router();

// Grants for the signed-in account. Unconfirmed emails get none: otherwise anyone
// could sign up with a coordinator's address and inherit their access.
async function allMyGrants(req) {
  if (!req.emailVerified || !req.hostEmail) return [];
  const { data, error } = await supabase.from('staff_grants').select('*').eq('email', req.hostEmail.toLowerCase());
  if (error) throw error;
  return data;
}

// Event roles only (referee / coordinator) — what the Staff workspace works with.
async function myGrants(req) {
  return (await allMyGrants(req)).filter((g) => EVENT_ROLES.includes(g.role));
}

// Highest role any grant gives this user on this event, or null.
function roleFor(grantList, event) {
  let best = null;
  for (const g of grantList) {
    if (g.host_id !== event.host_id || !activeToday(g)) continue;
    if (covers(g, event) && (!best || RANK[g.role] > RANK[best])) best = g.role;
  }
  return best;
}

// Guard: loads the event and the caller's role, or 404 (never reveal other hosts' events).
staff.param('eventId', async (req, res, next, eventId) => {
  if (!isUuid(eventId)) return notFound(res, 'Event');
  try {
    const { data: event, error } = await supabase.from('v_event_summary').select('*').eq('id', eventId).maybeSingle();
    if (error) throw error;
    const role = event && roleFor(await myGrants(req), event);
    if (!role) return notFound(res, 'Event');
    req.event = event;
    req.staffRole = role;
    next();
  } catch (err) {
    fail(res, err);
  }
});

const STAFF_EVENT_FIELDS = (e) => ({
  id: e.id,
  title: e.title,
  event_date: e.event_date,
  start_time: e.start_time,
  end_time: e.end_time,
  location: e.location,
  courts: e.courts,
  slots: e.slots,
  status: e.status,
  club_name: e.club_name,
  main_count: e.main_count,
  waitlist_count: e.waitlist_count,
});

// Does this account have any staff access at all? (drives the "Staff" workspace)
staff.get('/me', async (req, res) => {
  try {
    const all = await allMyGrants(req);
    const list = all.filter((g) => EVENT_ROLES.includes(g.role));
    // The strongest role held (shown in the space switcher: coordinator over referee).
    const role = list.reduce((best, g) => (!best || RANK[g.role] > RANK[best] ? g.role : best), null);
    res.json({
      is_staff: list.length > 0,
      role,
      roles: [...new Set(list.map((g) => g.role))],
      grants: list.length,
      co_admin_clubs: all.filter((g) => g.role === 'co_admin').length,
      email_verified: req.emailVerified,
    });
  } catch (err) {
    fail(res, err);
  }
});

// Events I'm assigned to, from two weeks ago onwards.
staff.get('/events', async (req, res) => {
  try {
    const list = await myGrants(req);
    if (!list.length) return res.json([]);
    const hostIds = [...new Set(list.map((g) => g.host_id))];
    const { data: events, error } = await supabase
      .from('v_event_summary')
      .select('*')
      .in('host_id', hostIds)
      .gte('event_date', shiftDay(todayYmd(), -14))
      .neq('status', 'cancelled')
      .order('event_date', { ascending: true })
      .limit(200);
    if (error) throw error;
    const mine = events.map((e) => ({ ...STAFF_EVENT_FIELDS(e), kind: e.kind || null, role: roleFor(list, e) })).filter((e) => e.role);
    // Who has arrived so far (check-in progress on each card).
    const arrived = new Map();
    if (mine.length) {
      const { data: rows } = await supabase.from('event_participants').select('event_id').in('event_id', mine.map((e) => e.id)).eq('status', 'checked_in');
      for (const r of rows || []) arrived.set(r.event_id, (arrived.get(r.event_id) || 0) + 1);
    }
    res.json(mine.map((e) => ({ ...e, arrived: arrived.get(e.id) || 0 })));
  } catch (err) {
    fail(res, err);
  }
});

staff.get('/events/:eventId', async (req, res) => {
  try {
    const [{ data: people, error: pErr }, { data: matches, error: mErr }] = await Promise.all([
      supabase
        .from('event_participants')
        .select('id, full_name, dupr_level, status, checked_in_at')
        .eq('event_id', req.event.id)
        .in('status', ['registered', 'checked_in', 'no_show', 'waitlisted', 'pending'])
        .order('joined_at', { ascending: true }),
      supabase.from('matches').select(PLAYER_SELECT).eq('event_id', req.event.id).order('played_at', { ascending: false }),
    ]);
    if (pErr) throw pErr;
    if (mErr) throw mErr;
    res.json({
      ...STAFF_EVENT_FIELDS(req.event),
      sport: await clubSport(req.event.club_id), // levels / scoring follow the club's sport
      role: req.staffRole,
      can: CAN[req.staffRole],
      participants: people,
      matches,
    });
  } catch (err) {
    fail(res, err);
  }
});

// Walk-in: someone turns up at the court without signing up. The coordinator adds them
// (name only — staff never handle phones or money) and, by default, checks them in.
staff.post('/events/:eventId/participants', async (req, res) => {
  if (!CAN[req.staffRole].walkIn) return res.status(403).json({ error: 'Only coordinators can add players.' });
  const name = String(req.body?.full_name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'full_name is required.' });
  try {
    const usage = await getUsage(req.event.host_id).catch(() => null);
    if (usage && usage.remaining <= 0) return res.status(402).json({ error: "The host's plan is full.", code: 'capacity' });
    const { count } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).in('status', HOLDS_PLACE);
    const full = (count || 0) >= req.event.slots;
    const { data: p, error } = await supabase
      .from('event_participants')
      .insert({ event_id: req.event.id, full_name: name, status: full ? 'waitlisted' : 'registered', kind: 'guest' })
      .select()
      .single();
    if (error) throw error;
    const done = req.body?.check_in !== false && !full ? await setAttendance(req.event, p, 'check-in') : p;
    res.status(201).json({ id: done.id, full_name: done.full_name, status: done.status, dupr_level: null, waitlisted: full });
  } catch (err) {
    fail(res, err);
  }
});

staff.post('/events/:eventId/participants/:participantId/:action', async (req, res) => {
  const action = req.params.action;
  if (action === 'promote' ? !CAN[req.staffRole].promote : !CAN[req.staffRole].checkIn) {
    return res.status(403).json({ error: 'Referees cannot check players in.' });
  }
  if (!['check-in', 'no-show', 'reset', 'promote'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
  if (!isUuid(req.params.participantId)) return notFound(res, 'Participant');
  try {
    const { data: prior, error } = await supabase
      .from('event_participants')
      .select('*')
      .eq('id', req.params.participantId)
      .eq('event_id', req.event.id)
      .maybeSingle();
    if (error) throw error;
    if (!prior) return notFound(res, 'Participant');
    if (prior.status === 'pending' && req.params.action === 'check-in') {
      return res.status(409).json({ error: "This player's payment hasn't been confirmed by the host yet.", code: 'unpaid' });
    }
    if (action === 'promote') {
      // Waitlist -> main list (e.g. someone on the list didn't come).
      const { data: ev } = await supabase.from('events').select('*').eq('id', req.event.id).single();
      const r = await promoteParticipant(ev, prior);
      return res.json({ id: prior.id, full_name: prior.full_name, status: r.status || r.participant?.status || 'registered' });
    }
    const updated = await setAttendance(req.event, prior, action);
    res.json({ id: updated.id, full_name: updated.full_name, status: updated.status, pass: updated.pass });
  } catch (err) {
    fail(res, err);
  }
});

// Coordinator scans a player's personal QR -> check-in (uses their session like a manual check-in).
staff.post('/events/:eventId/checkin-code', async (req, res) => {
  if (!CAN[req.staffRole].checkIn) return res.status(403).json({ error: 'Referees cannot check players in.' });
  try {
    const p = await checkInByCode(req.event, req.body.code);
    res.json({ id: p.id, full_name: p.full_name, status: p.status, already: p.already, pass: p.pass });
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : fail(res, err);
  }
});

staff.post('/events/:eventId/matches', async (req, res) => {
  const players = (Array.isArray(req.body.players) ? req.body.players : []).map((p) => ({
    team: p.team,
    event_participant_id: p.event_participant_id, // staff only pick from this event's players
  }));
  try {
    res.status(201).json(await createMatch({ event_id: req.event.id }, { ...req.body, players }));
  } catch (err) {
    fail(res, err);
  }
});

staff.patch('/events/:eventId/matches/:matchId', async (req, res) => {
  if (!isUuid(req.params.matchId)) return notFound(res, 'Match');
  const { data: match } = await supabase.from('matches').select('id').eq('id', req.params.matchId).eq('event_id', req.event.id).maybeSingle();
  if (!match) return notFound(res, 'Match');
  try {
    res.json(await updateMatch(match.id, req.body));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = { staffGrantsRoutes: grants, staffRoutes: staff };
