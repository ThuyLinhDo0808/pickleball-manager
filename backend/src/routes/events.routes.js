const express = require('express');
const { assertSocialManager, assertFeature } = require('../services/plan');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { actingHost, eventAccess, coAdminClubIds, ROLE_FORBIDDEN } = require('../services/clubAccess');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { requireAuth } = require('../middleware/auth');
const { normalizePhone, findClubMemberByPhone, todayYmd } = require('../services/memberships');
const {
  ATTENDANCE_ACTIONS,
  setAttendance,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  checkInByCode,
  setPlace,
} = require('../services/attendance');
const signup = require('../services/signup');
const { notifyEventCancelled } = require('../services/notify');
const { suspensionOf } = require('../services/owner');
const { HOLDS_PLACE } = require('../services/fees');
const { perksFor, ensureGuestMember, memberForUser, findClubPerson } = require('../services/guests');
const survey = require('../services/survey');
const votes = require('../services/votes');
const meeting = require('../services/meetingMoney');
const { itemMetrics } = require('../services/inventory');
const { clubSport } = require('../services/sport');
const { linkByPhone } = require('../services/phoneLink');
const { HOST_STATUSES, completeFinished, completeIfFinished } = require('../services/eventStatus');
const { cleanCostItems, sameItems, syncEventCosts } = require('../services/eventCosts');
const { randomUUID } = require('crypto');

const router = express.Router();
const MAIN_LIST = HOLDS_PLACE; // registered, checked_in, pending (payment being checked)

function nowIso() {
  return new Date().toISOString();
}

// ---- PUBLIC routes (no auth) — must be registered before requireAuth below,
// so a matching request is handled here and never falls through to it. ------
// Only what a player needs to see — no host id, fees config internals, or phones.
const PUBLIC_EVENT_FIELDS = [
  'title', 'event_date', 'start_time', 'end_time', 'location', 'courts', 'slots',
  'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
  'allow_public_registration', 'notice', 'club_name', 'main_count', 'waitlist_count',
  'cancel_deadline_hours', 'kind', 'services', 'play_format', 'map_url',
];

// Short links: /e/<8 characters> stands for the event's full public token.
router.param('publicToken', async (req, res, next, token) => {
  if (isUuid(token) || !/^[0-9a-z]{6,12}$/i.test(token || '')) return next();
  const { data, error } = await supabase.from('events').select('public_token').eq('short_code', token.toLowerCase()).maybeSingle();
  if (error) return dbError(res, error);
  if (data) req.params.publicToken = data.public_token;
  next();
});

router.get('/public/:publicToken', async (req, res) => {
  if (!isUuid(req.params.publicToken)) return notFound(res, 'Event');
  const { data: event, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('public_token', req.params.publicToken)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!event) return notFound(res, 'Event');
  try {
    await signup.expireHolds(event);
  } catch (err) {
    // Housekeeping only — never keep players from seeing the event (e.g. a migration not run yet).
    console.error('expireHolds failed on public page', err);
  }

  const { data: people, error: pErr } = await supabase
    .from('event_participants')
    .select('full_name, dupr_level, status, joined_at, is_organizer')
    .eq('event_id', event.id)
    // Players with a place or on the waitlist (not requests waiting for the Host, nor organizers who don't play).
    .not('status', 'in', '(cancelled,no_show,requested,not_playing)')
    .order('joined_at', { ascending: true });
  if (pErr) return dbError(res, pErr);

  let closedCode = null;
  // The organiser's account is suspended by the app owner: no new sign-ups.
  if (await suspensionOf(event.host_id)) closedCode = 'suspended';
  else if (!event.allow_public_registration) closedCode = 'disabled';
  else if (!['draft', 'open'].includes(event.status)) closedCode = 'not_open';
  else if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) closedCode = 'deadline';

  res.json({
    ...pick(event, PUBLIC_EVENT_FIELDS),
    sport: await clubSport(event.club_id), // levels show as DUPR or badminton steps
    registration_open: !closedCode,
    closed_code: closedCode,
    participants: people.map(({ joined_at, ...p }) => p),
    public_token: event.public_token,
  });
});

// ---- Meeting vote link (/v/<token>) ---------------------------------------------
// A club meeting / get-together shared by link: anyone sees what, when, where, the fee
// and who is coming; signed-in players (members or not) vote Coming / Not coming. A
// voter from outside the club joins its guest list.
async function meetingByToken(req, res) {
  if (!isUuid(req.params.publicToken)) {
    notFound(res, 'Event');
    return null;
  }
  const { data: event, error } = await supabase.from('events').select('*, clubs(name)').eq('public_token', req.params.publicToken).maybeSingle();
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!event || event.kind !== 'meeting' || !event.club_id) {
    notFound(res, 'Event');
    return null;
  }
  return event;
}
const votingClosed = (e) => e.status === 'cancelled' || e.event_date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

async function meetingView(event) {
  const { data: rows, error } = await supabase.from('event_votes').select('choice, updated_at, club_members(full_name)').eq('event_id', event.id).order('updated_at');
  if (error) throw error;
  const yes = (rows || []).filter((r) => r.choice === 'yes');
  return {
    title: event.title,
    event_date: event.event_date,
    start_time: event.start_time,
    end_time: event.end_time,
    location: event.location,
    map_url: event.map_url,
    fee_amount: event.fee_amount,
    notice: event.notice,
    status: event.status,
    club_name: event.clubs?.name || null,
    closed: votingClosed(event),
    yes: yes.length,
    no: (rows || []).length - yes.length,
    coming: yes.map((r) => r.club_members?.full_name).filter(Boolean),
  };
}

router.get('/public/:publicToken/vote', async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  try {
    res.json(await meetingView(event));
  } catch (err) {
    dbError(res, err);
  }
});

router.get('/public/:publicToken/vote/me', requireAuth, async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  try {
    const profile = await playerProfile(req.userId);
    const member = await findClubPerson(event.club_id, { userId: req.userId, phone: profile?.phone });
    let myVote = null;
    if (member) {
      const { data } = await supabase.from('event_votes').select('choice').eq('event_id', event.id).eq('club_member_id', member.id).maybeSingle();
      myVote = data?.choice || null;
    }
    res.json({ profile, in_club: !!member, member_type: member?.member_type || null, my_vote: myVote });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/vote', requireAuth, async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  const choice = req.body?.choice ?? null;
  if (choice !== null && !votes.CHOICES.includes(choice)) return res.status(400).json({ error: 'choice must be yes, no or null.' });
  try {
    if (votingClosed(event)) return res.status(409).json({ error: 'Voting is closed.', code: 'closed' });
    const member = await memberForUser(event, req.userId);
    if (!member) return res.status(400).json({ error: 'Add your name and phone to your profile first.', code: 'profile_required' });
    await votes.castVote(event.id, member.id, choice, false);
    res.json({ my_vote: choice, ...(await meetingView(event)) });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Signed-in player on the public page ------------------------------------
// Sign-ups need an account: it tells a verified club member from a guest, and guests
// pay (and get their ticket) through it.
async function publicEvent(req, res) {
  if (!isUuid(req.params.publicToken)) {
    notFound(res, 'Event');
    return null;
  }
  const { data: event, error } = await supabase.from('events').select('*').eq('public_token', req.params.publicToken).maybeSingle();
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!event) notFound(res, 'Event');
  return event;
}

function fail(res, err) {
  // reason / until: why and how long a player is kept out (blocked / suspended by the club).
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code, ...(err.reason ? { reason: err.reason } : {}), ...(err.until ? { until: err.until } : {}) }) : dbError(res, err);
}

async function playerProfile(userId) {
  const { data } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

// My standing (member / pending verification / guest) and my registration, with payment details when owed.
router.get('/public/:publicToken/me', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    await signup.expireHolds(event);
    const profile = await playerProfile(req.userId);
    await linkByPhone(req.userId, profile); // same phone as a club member -> that member
    const mine = await signup.myRegistration(event, req.userId);
    const { standing, participant } = mine;
    // Guest perk (priority / VIP price) the club gave this player, if any.
    const perks = standing.state === 'verified' ? null : await perksFor(event, { userId: req.userId, phone: profile?.phone });
    res.json({
      profile,
      member: {
        guest_perk: perks?.perk || null,
        my_fee: perks?.fee_amount ?? null,
        discount_pct: perks?.discount_pct ?? null,
        state: standing.state, // 'verified' | 'pending' | 'guest' | 'none'
        is_club_event: !!event.club_id,
        has_pass: !!standing.pass,
        // the Host checks this player before they get a place (and pay)
        needs_approval: signup.needsApproval(event, standing),
        sessions_remaining: standing.pass ? (standing.pass.sessions_included === 0 ? null : standing.pass.sessions_remaining) : null,
      },
      registration: await signup.registrationView(event, participant),
      survey: await survey.surveyFor(event, participant).catch(() => null),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/register', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  if (await suspensionOf(event.host_id)) return res.status(423).json({ error: 'Sign-ups for this event are paused.', code: 'organiser_suspended' });
  try {
    const profile = await playerProfile(req.userId);
    await linkByPhone(req.userId, profile);
    res.status(201).json(await signup.registerOnline(event, req.userId, profile));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/payment-proof', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    const { participant } = await signup.myRegistration(event, req.userId);
    if (!participant) throw Object.assign(new Error('You are not registered for this event.'), { status: 404, code: 'not_registered' });
    res.json(await signup.submitProof(event, participant, req.body.image));
  } catch (err) {
    fail(res, err);
  }
});

// Everything below requires the authenticated Host.
router.use(requireAuth);

// ---- ownership guard for :eventId -----------------------------------------
router.param('eventId', async (req, res, next, eventId) => {
  if (!isUuid(eventId)) return notFound(res, 'Event');
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) return dbError(res, error);
  // The event's host, or a co-admin of its club (who then acts as the owner).
  const access = await eventAccess(req, data).catch(() => null);
  if (!access) return req.roleForbidden ? res.status(403).json(ROLE_FORBIDDEN) : notFound(res, 'Event');
  req.hostId = access.hostId;
  req.coAdmin = access.coAdmin;
  req.event = await completeIfFinished(data);
  next();
});

router.param('participantId', async (req, res, next, participantId) => {
  if (!isUuid(participantId)) return notFound(res, 'Participant');
  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('id', participantId)
    .eq('event_id', req.event.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Participant');
  req.participant = data;
  next();
});

// ---- Events CRUD (schedule) -------------------------------------------------
// The host the event belongs to: the club's owner (also for its co-admins), or the
// signed-in account for a standalone Xé Vé event. null = not allowed.
async function hostForClub(req, clubId) {
  if (!clubId) return req.userId || req.hostId; // standalone (Xé Vé) event
  if (!isUuid(clubId)) return null;
  return actingHost(req, clubId);
}

const EVENT_KINDS = ['weekly', 'game', 'training', 'meeting', 'challenge'];

// Normalises optional fields in place; returns an error message or null.
function cleanEventFields(fields) {
  // Host picks open / completed / cancelled only (no drafts, no "closed": a session that
  // won't happen is cancelled, or deleted while nobody has signed up).
  if ('status' in fields && !HOST_STATUSES.includes(fields.status)) return `status must be one of ${HOST_STATUSES.join(', ')}.`;
  if ('kind' in fields && !EVENT_KINDS.includes(fields.kind)) return `kind must be one of ${EVENT_KINDS.join(', ')}.`;
  if ('cancel_deadline_hours' in fields) {
    const v = fields.cancel_deadline_hours;
    if (v === '' || v == null) fields.cancel_deadline_hours = null;
    else if (!(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 168)) return 'cancel_deadline_hours must be 0-168.';
    else fields.cancel_deadline_hours = Number(v);
  }
  if (fields.start_time && fields.end_time && fields.end_time <= fields.start_time) return 'end_time must be after start_time.';
  if ('services' in fields) {
    const v = fields.services == null ? '' : String(fields.services).trim();
    if (v.length > 300) return 'services: at most 300 characters.';
    fields.services = v || null;
  }
  if ('play_format' in fields) {
    if (fields.play_format === '' || fields.play_format == null) fields.play_format = null;
    else if (!PLAY_FORMATS.includes(fields.play_format)) return `play_format must be one of ${PLAY_FORMATS.join(', ')}.`;
  }
  if ('map_url' in fields) {
    const v = fields.map_url == null ? '' : String(fields.map_url).trim();
    if (v && (v.length > 500 || !/^https:\/\/\S+$/i.test(v))) return 'map_url must be an https link (Google Maps).';
    fields.map_url = v || null;
  }
  if ('auto_approve' in fields) fields.auto_approve = fields.auto_approve === true || fields.auto_approve === 'true';
  if ('cost_items' in fields) {
    const { items, error } = cleanCostItems(fields.cost_items);
    if (error) return error;
    fields.cost_items = items;
  }
  return null;
}
const PLAY_FORMATS = ['men', 'women', 'mixed', 'open'];
// Fields a weekly schedule edit copies to every upcoming session (each keeps its own day).
const SERIES_FIELDS = [
  'auto_approve', 'title', 'start_time', 'end_time', 'location', 'map_url', 'courts', 'slots', 'level_min', 'level_max',
  'fee_amount', 'services', 'play_format', 'notice', 'cancel_deadline_hours', 'allow_public_registration', 'cost_items',
];

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Transfer screenshots waiting for the Host, across all their upcoming events.
router.get('/pending-payments', async (req, res) => {
  // Payments to review: the owner's, co-admins' and Finance's clubs (not Operations).
  const shared = await coAdminClubIds(req, ['co_admin', 'finance']).catch(() => []);
  const base = supabase.from('events').select('id, title, event_date, start_time, fee_amount, club_id');
  const { data: events, error } = await (shared.length ? base.or(`host_id.eq.${req.hostId},club_id.in.(${shared.join(',')})`) : base.eq('host_id', req.hostId))
    .gte('event_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  if (error) return dbError(res, error);
  if (!events.length) return res.json([]);
  const { data: rows, error: pErr } = await supabase
    .from('event_participants')
    .select('id, event_id, full_name, phone, kind, fee_amount, payment_ref, payment_submitted_at')
    .in('event_id', events.map((e) => e.id))
    .eq('status', 'pending')
    .eq('payment_status', 'proof_submitted')
    .order('payment_submitted_at', { ascending: true });
  if (pErr) return dbError(res, pErr);
  const byId = new Map(events.map((e) => [e.id, e]));
  res.json(rows.map((r) => {
    const e = byId.get(r.event_id);
    return { ...r, event: { id: e.id, title: e.title, event_date: e.event_date, start_time: e.start_time }, amount: Number(r.fee_amount ?? e.fee_amount ?? 0) };
  }));
});

// ?scope=standalone -> only events not tied to a club (Xé Vé workspace).
router.get('/', async (req, res) => {
  await completeFinished({ hostId: req.hostId });
  let query = supabase.from('v_event_summary').select('*');
  // My own events, plus the sessions of clubs I co-administer (not for Xé Vé).
  const shared = req.query.scope === 'standalone' ? [] : await coAdminClubIds(req).catch(() => []);
  query = shared.length ? query.or(`host_id.eq.${req.hostId},club_id.in.(${shared.join(',')})`) : query.eq('host_id', req.hostId);
  if (req.query.scope === 'standalone') query = query.is('club_id', null);
  const { data, error } = await query.order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

// `repeat_weeks` (1-26) creates the same session every week — the club's recurring schedule.
router.post('/', async (req, res) => {
  const { title } = req.body;
  // `dates`: explicit list of days (weekly schedule: e.g. every Tue/Thu/Sat between two dates).
  let dates = null;
  if (Array.isArray(req.body.dates)) {
    dates = [...new Set(req.body.dates.map(String))].sort();
    if (!dates.length || dates.length > 200 || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))) {
      return res.status(400).json({ error: 'dates must be 1-200 days (YYYY-MM-DD).' });
    }
  }
  const event_date = dates ? dates[0] : req.body.event_date;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) {
    return res.status(400).json({ error: 'title and event_date are required.' });
  }

  const fields = pick(req.body, [
    'club_id', 'start_time', 'end_time', 'location', 'courts', 'slots',
    'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours', 'kind',
    'services', 'play_format', 'map_url', 'cost_items', 'auto_approve',
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  const hostId = await hostForClub(req, fields.club_id);
  if (!hostId) return notFound(res, 'Club');
  // Xé Vé games (no club) need the Social Manager add-on.
  if (!fields.club_id) {
    try {
      await assertSocialManager(hostId);
    } catch (err) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
  }

  const weeks = Math.min(Math.max(parseInt(req.body.repeat_weeks, 10) || 1, 1), 26);
  // Many club sessions at once (weekly schedule) is a Standard feature.
  if (fields.club_id && ((dates && dates.length > 1) || weeks > 1)) {
    try {
      await assertFeature(hostId, 'weekly_schedule');
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message, code: err.code, feature: err.feature, min_tier: err.min_tier });
    }
  }
  const days = dates || Array.from({ length: weeks }, (_, i) => addDays(event_date, 7 * i));
  // The registration deadline keeps the same distance to each session as to the first.
  const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
  // Sessions made together form a series: they can be edited all at once later.
  const series_id = days.length > 1 ? randomUUID() : null;
  const rows = days.map((d) => ({
    host_id: hostId,
    title,
    ...fields,
    ...(series_id ? { series_id } : {}),
    status: fields.status || 'open',
    event_date: d,
    registration_deadline: fields.registration_deadline
      ? new Date(new Date(fields.registration_deadline).getTime() + dayMs(d) - dayMs(event_date)).toISOString()
      : null,
  }));
  const { data, error } = await supabase.from('events').insert(rows).select();
  if (error) return dbError(res, error);
  // Each session's costs (court, water…) go into the ledger on its day.
  try {
    for (const ev of data) if (ev.cost_items?.length) await syncEventCosts(ev);
  } catch (err) {
    return dbError(res, err);
  }
  data.sort((a, b) => a.event_date.localeCompare(b.event_date));
  res.status(201).json({ ...data[0], created_count: data.length });
});

// With `series_upcoming`: how many other sessions of the same weekly schedule an edit can
// also change ("Áp dụng cho tất cả các buổi").
router.get('/:eventId', async (req, res) => {
  // The Host is always shown among the organizers ("Người tổ chức"), playing or not.
  const host = await hostPerson(req.event.host_id).catch(() => null);
  const base = { ...req.event, host_name: host?.full_name || null };
  if (!req.event.series_id) return res.json(base);
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', req.event.series_id)
    .neq('id', req.event.id)
    .gte('event_date', todayYmd())
    .not('status', 'in', '(completed,cancelled)');
  if (error) return dbError(res, error);
  res.json({ ...base, series_upcoming: count || 0 });
});

// ---- Meeting money (kind = 'meeting') ---------------------------------------------
function meetingOnly(req, res) {
  if (req.event.kind !== 'meeting' || !req.event.club_id) {
    res.status(400).json({ error: 'Only club meetings have this.' });
    return false;
  }
  return true;
}
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e10 ? Math.round(n) : null;
};
async function meetingReply(req, res) {
  const { data } = await supabase.from('events').select('*').eq('id', req.event.id).single();
  res.json(await meeting.summary(data));
}
async function clubMember(req, id) {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('club_members').select('id').eq('id', id).eq('club_id', req.event.club_id).maybeSingle();
  return data;
}

router.get('/:eventId/meeting', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    res.json(await meeting.summary(req.event));
  } catch (err) {
    fail(res, err);
  }
});

// What one person transferred / sponsored.
router.put('/:eventId/meeting/money/:clubMemberId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!(await clubMember(req, req.params.clubMemberId))) return notFound(res, 'Member');
    const patch = {};
    for (const k of ['paid_amount', 'sponsor_amount']) {
      if (k in (req.body || {})) {
        const v = money(req.body[k] === '' || req.body[k] == null ? 0 : req.body[k]);
        if (v == null) return res.status(400).json({ error: `${k} must be a non-negative amount.` });
        patch[k] = v;
      }
    }
    await meeting.setMoney(req.event.id, req.params.clubMemberId, patch);
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Guests a member brings: one more share of the fee each, charged to the inviter.
router.post('/:eventId/meeting/guests', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  const name = String(req.body?.full_name || '').trim().slice(0, 120);
  try {
    if (!name) return res.status(400).json({ error: 'full_name is required.' });
    if (!(await clubMember(req, req.body?.invited_by))) return res.status(400).json({ error: 'Pick who invited the guest.', code: 'inviter_required' });
    const { error } = await supabase.from('meeting_guests').insert({ event_id: req.event.id, full_name: name, invited_by: req.body.invited_by });
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/guests/:guestId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.guestId)) return notFound(res, 'Guest');
    const { error } = await supabase.from('meeting_guests').delete().eq('id', req.params.guestId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:eventId/meeting/expenses', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  const label = String(req.body?.label || '').trim().slice(0, 200);
  const amount = money(req.body?.amount);
  try {
    if (!label || amount == null) return res.status(400).json({ error: 'label and amount are required.' });
    const { error } = await supabase.from('meeting_expenses').insert({ event_id: req.event.id, label, amount });
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:eventId/meeting/expenses/:expenseId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.expenseId)) return notFound(res, 'Expense');
    const patch = {};
    if ('label' in req.body) {
      patch.label = String(req.body.label || '').trim().slice(0, 200);
      if (!patch.label) return res.status(400).json({ error: 'label is required.' });
    }
    if ('amount' in req.body) {
      patch.amount = money(req.body.amount);
      if (patch.amount == null) return res.status(400).json({ error: 'amount must be a non-negative amount.' });
    }
    const { error } = await supabase.from('meeting_expenses').update(patch).eq('id', req.params.expenseId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/expenses/:expenseId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.expenseId)) return notFound(res, 'Expense');
    const { error } = await supabase.from('meeting_expenses').delete().eq('id', req.params.expenseId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Settle the result (surplus -> fund; deficit -> sponsor / fund / split), or undo it.
router.post('/:eventId/meeting/settle', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    await meeting.settle(req.event, req.hostId, req.body || {});
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/settle', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    await meeting.undoSettle(req.event);
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Meeting votes: who comes (yes), who doesn't (no), who hasn't answered yet.
router.get('/:eventId/votes', async (req, res) => {
  if (req.event.kind !== 'meeting' || !req.event.club_id) return res.status(400).json({ error: 'Only club meetings have votes.' });
  try {
    res.json(await votes.votesFor(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

// The Host marks a member's vote (e.g. told in the group chat). choice null clears it.
router.put('/:eventId/votes/:clubMemberId', async (req, res) => {
  const choice = req.body?.choice ?? null;
  if (req.event.kind !== 'meeting' || !req.event.club_id) return res.status(400).json({ error: 'Only club meetings have votes.' });
  if (choice !== null && !votes.CHOICES.includes(choice)) return res.status(400).json({ error: 'choice must be yes, no or null.' });
  if (!isUuid(req.params.clubMemberId)) return notFound(res, 'Member');
  const { data: m } = await supabase.from('club_members').select('id').eq('id', req.params.clubMemberId).eq('club_id', req.event.club_id).maybeSingle();
  if (!m) return notFound(res, 'Member');
  try {
    await votes.castVote(req.event.id, m.id, choice, true);
    res.json(await votes.votesFor(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

router.patch('/:eventId', async (req, res) => {
  const fields = pick(req.body, [
    'title', 'event_date', 'club_id', 'start_time', 'end_time', 'location', 'courts',
    'slots', 'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours', 'kind',
    'services', 'play_format', 'map_url', 'cost_items', 'auto_approve',
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  if (req.event.status === 'cancelled' && fields.status && fields.status !== 'cancelled') {
    return res.status(409).json({ error: 'A cancelled event stays cancelled.', code: 'cancelled' });
  }
  if ('club_id' in fields && (await hostForClub(req, fields.club_id)) !== req.event.host_id) return notFound(res, 'Club');
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', req.event.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  // Host cancelled the event: tell everyone who had a place (in the background).
  if (fields.status === 'cancelled' && req.event.status !== 'cancelled') notifyEventCancelled(data);
  let updated = 0;
  try {
    if (('cost_items' in fields && !sameItems(fields.cost_items, req.event.cost_items)) || ('event_date' in fields && fields.event_date !== req.event.event_date && data.cost_items?.length)) {
      await syncEventCosts(data);
    }
    // "Áp dụng cho tất cả các buổi": the same change on every upcoming session of the schedule.
    if (req.body.apply_to === 'series' && data.series_id) updated = await applyToSeries(data, fields);
  } catch (err) {
    return dbError(res, err);
  }
  res.json(req.body.apply_to === 'series' ? { ...data, series_updated: updated } : data);
});

// Copy an edit to the other sessions of the same weekly schedule that haven't happened
// yet (not completed / cancelled, today or later). Each keeps its own day; a registration
// deadline keeps the same distance to its session as on the edited one.
async function applyToSeries(ev, fields) {
  const patch = pick(fields, SERIES_FIELDS);
  const { data: others, error } = await supabase
    .from('events')
    .select('id, event_date, cost_items, host_id')
    .eq('series_id', ev.series_id)
    .neq('id', ev.id)
    .gte('event_date', todayYmd())
    .not('status', 'in', '(completed,cancelled)');
  if (error) throw error;
  const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
  const deadline = 'registration_deadline' in fields ? fields.registration_deadline : undefined;
  for (const o of others) {
    const row = { ...patch };
    if (deadline !== undefined) {
      row.registration_deadline = deadline ? new Date(new Date(deadline).getTime() + dayMs(o.event_date) - dayMs(ev.event_date)).toISOString() : null;
    }
    if (!Object.keys(row).length) continue;
    const { data: next, error: uErr } = await supabase.from('events').update(row).eq('id', o.id).select().single();
    if (uErr) throw uErr;
    if ('cost_items' in row && !sameItems(row.cost_items, o.cost_items)) await syncEventCosts(next);
  }
  return others.length;
}

// Deleting wipes the event's participants and money records too. When there are any,
// the Host must confirm (?force=1); "Cancelled" is the way to keep the history.
// Upcoming session with people signed up: never deleted — cancel it so they are told.
// A past session (completed / cancelled / its date gone) can be deleted to tidy up the
// history, but only once the Host confirmed (?force=1) after seeing what goes with it.
// Otherwise money records alone also need ?force=1.
router.delete('/:eventId', async (req, res) => {
  const [{ count: people }, { count: money }, { count: matches }] = await Promise.all([
    // (organizers who don't play, e.g. the Host's own row, are not sign-ups)
    supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).not('status', 'in', '(cancelled,not_playing)'),
    // (the session's own costs from the form don't count: they go with it)
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).eq('is_voided', false).eq('event_cost', false),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id),
  ]);
  const past = ['completed', 'cancelled'].includes(req.event.status) || req.event.event_date < todayYmd();
  const force = req.query.force === '1';
  if (people > 0 && !past) {
    return res.status(409).json({ error: 'People have signed up for this event: cancel it instead (they will be notified).', code: 'has_signups', participants: people });
  }
  if (people + money + matches > 0 && !force) {
    return res.status(409).json({
      error: 'This event has sign-ups, matches or money records: confirm to delete them too.',
      code: past ? 'past_has_data' : 'has_activity',
      participants: people || 0,
      transactions: money || 0,
      matches: matches || 0,
    });
  }
  const { error } = await supabase.from('events').delete().eq('id', req.event.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// ---- Participants -----------------------------------------------------------
router.get('/:eventId/participants', async (req, res) => {
  try {
    await signup.expireHolds(req.event);
  } catch (err) {
    return dbError(res, err);
  }
  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('event_id', req.event.id)
    .order('joined_at', { ascending: true });
  if (error) return dbError(res, error);
  let cards;
  try {
    cards = await playerCards(req.event, data);
  } catch (err) {
    return dbError(res, err);
  }
  // screenshots are fetched one at a time (they are large)
  res.json(
    data.map(({ payment_proof, ...p }) => {
      const card = cards.get(p.id) || null;
      // Fixed members pay through their membership plan: their place is always paid.
      return { ...p, has_proof: !!payment_proof, card, paid_by_plan: card?.member_type === 'fixed' };
    })
  );
});

// What the participant list shows about each player (avatar, level, the Host's rank…)
// and the profile pop-up: their club record and their own player profile.
async function playerCards(event, rows) {
  const memberIds = [...new Set(rows.map((p) => p.source_club_member_id || p.guest_member_id).filter(Boolean))];
  const { data: members, error } = memberIds.length
    ? await supabase.from('club_members').select('*').in('id', memberIds)
    : { data: [] };
  if (error) throw error;
  const byMember = new Map((members || []).map((m) => [m.id, m]));
  const userIds = [...new Set(rows.map((p) => p.user_id || byMember.get(p.source_club_member_id || p.guest_member_id)?.user_id).filter(Boolean))];
  const { data: profiles, error: pErr } = userIds.length
    ? await supabase.from('player_profiles').select('*').in('user_id', userIds)
    : { data: [] };
  if (pErr) throw pErr;
  const byUser = new Map((profiles || []).map((x) => [x.user_id, x]));
  const cards = new Map();
  for (const p of rows) {
    const m = byMember.get(p.source_club_member_id || p.guest_member_id) || null;
    const prof = byUser.get(p.user_id || m?.user_id) || null;
    cards.set(p.id, {
      member_id: m?.id || null,
      member_type: m?.member_type || null,
      tier: m?.tier || null,
      avatar: prof?.avatar || null,
      level: m?.dupr_level ?? p.dupr_level ?? null,
      dupr: prof?.dupr_level ?? null,
      district: m?.district || null,
      play_duration: m?.play_duration || null,
      gender: m?.gender || prof?.gender || null,
      birth_date: m?.birth_date || prof?.birth_date || null,
      birth_year: m?.birth_year || prof?.birth_year || null,
      joined_on: m?.joined_on || null,
      phone: m?.phone || p.phone || prof?.phone || null,
      guest_perk: m?.guest_perk || null,
    });
  }
  return cards;
}

router.get('/:eventId/participants/:participantId/proof', (req, res) => {
  if (!req.participant.payment_proof) return notFound(res, 'Screenshot');
  res.json({ image: req.participant.payment_proof, submitted_at: req.participant.payment_submitted_at, ref: req.participant.payment_ref });
});

router.post('/:eventId/participants', checkCapacity(), async (req, res) => {
  const { full_name, phone, dupr_level, fee_amount } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });
  const memberId = await findClubMemberByPhone(req.event.club_id, phone);

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', req.event.id)
    .in('status', MAIN_LIST);
  const status = (count || 0) >= req.event.slots ? 'waitlisted' : 'registered';
  const perks = await perksFor(req.event, { phone });

  const { data, error } = await supabase
    .from('event_participants')
    .insert({
      ...(perks?.priority ? { priority: true } : {}),
      event_id: req.event.id,
      full_name,
      phone: phone || null,
      dupr_level: dupr_level ?? null,
      fee_amount: fee_amount ?? null,
      status,
      source_club_member_id: memberId,
      kind: memberId ? 'member' : 'guest',
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  await ensureGuestMember(req.event, data);
  res.status(201).json(data);
});

// Badminton: shuttles used in this session, what they cost (each shuttle at its item's
// average purchase price) and the share per player present.
router.get('/:eventId/shuttles', async (req, res) => {
  try {
    if (!req.event.club_id) return res.json({ items: [], used: [], total_qty: 0, total_cost: 0, players: 0, per_player: null });
    const { data: items, error } = await supabase.from('inventory_items').select('*, inventory_moves(*)').eq('club_id', req.event.club_id).order('created_at');
    if (error) throw error;
    const { count: players } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).eq('status', 'checked_in');
    const used = [];
    for (const it of items || []) {
      const m = itemMetrics(it.inventory_moves || []);
      for (const mv of (it.inventory_moves || []).filter((x) => x.kind === 'use' && x.event_id === req.event.id)) {
        used.push({ move_id: mv.id, item_id: it.id, name: it.name, unit: it.unit, quantity: mv.quantity, unit_cost: m.avg_unit_cost, cost: Math.round(mv.quantity * (m.avg_unit_cost || 0)) });
      }
      it.stock = m.stock;
    }
    const total_cost = used.reduce((t, u) => t + u.cost, 0);
    res.json({
      items: (items || []).filter((i) => i.is_active).map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock })),
      used,
      total_qty: used.reduce((t, u) => t + u.quantity, 0),
      total_cost,
      players: players || 0,
      per_player: players ? Math.round(total_cost / players) : null,
    });
  } catch (err) {
    dbError(res, err);
  }
});

// After-session survey answers for this event (guests' stars, comments, join wishes).
router.get('/:eventId/surveys', async (req, res) => {
  try {
    res.json(await survey.eventSurveys(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

// Import from Club: clone selected club members into this event's participants
router.post('/:eventId/participants/import', checkCapacity(), async (req, res) => {
  const memberIds = Array.isArray(req.body.club_member_ids) ? req.body.club_member_ids : [];
  if (!memberIds.length) return res.status(400).json({ error: 'club_member_ids[] is required.' });

  const { willExceed, allowed, usage } = await limitBody(req.hostId, memberIds.length);
  if (willExceed) {
    return res.status(403).json({
      error: `Only ${allowed} more people fit on the ${usage.tier} plan (${usage.used}/${usage.capacity_limit} used).`,
      usage,
    });
  }

  const { data: members, error: mErr } = await supabase
    .from('club_members')
    .select('*')
    .in('id', memberIds);
  if (mErr) return dbError(res, mErr);

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', req.event.id)
    .in('status', MAIN_LIST);
  let mainCount = count || 0;

  const payload = members.map((m) => {
    const status = mainCount < req.event.slots ? 'registered' : 'waitlisted';
    if (status === 'registered') mainCount += 1;
    return {
      event_id: req.event.id,
      full_name: m.full_name,
      phone: m.phone,
      dupr_level: m.dupr_level,
      source_club_member_id: m.id,
      kind: 'member',
      status,
    };
  });

  const { data, error } = await supabase.from('event_participants').insert(payload).select();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

async function hostPerson(hostId) {
  const [{ data: prof }, { data: user }] = await Promise.all([
    supabase.from('player_profiles').select('full_name, phone').eq('user_id', hostId).maybeSingle(),
    supabase.from('users').select('full_name, username, email').eq('id', hostId).maybeSingle(),
  ]);
  return { full_name: prof?.full_name || user?.full_name || user?.username || (user?.email || 'Host').split('@')[0], phone: prof?.phone || null };
}

// The Host plays (main list), may play (waitlist) or only organizes. Their row on the
// list is made the first time they choose to play; their place never costs a fee.
router.post('/:eventId/host-play', async (req, res) => {
  const to = req.body?.to;
  if (!['main', 'waitlist', 'not_playing'].includes(to)) return res.status(400).json({ error: 'to must be main, waitlist or not_playing.' });
  try {
    const { data: rows, error } = await supabase.from('event_participants').select('*').eq('event_id', req.event.id).eq('user_id', req.event.host_id).neq('status', 'cancelled').limit(1);
    if (error) throw error;
    let row = rows[0];
    if (!row) {
      if (to === 'not_playing') return res.json(null);
      const host = await hostPerson(req.event.host_id);
      const { data, error: iErr } = await supabase
        .from('event_participants')
        .insert({ event_id: req.event.id, user_id: req.event.host_id, full_name: host.full_name, phone: host.phone, kind: 'member', status: 'not_playing', is_organizer: true, fee_amount: 0 })
        .select()
        .single();
      if (iErr) throw iErr;
      row = data;
    } else if (!row.is_organizer) {
      const { data } = await supabase.from('event_participants').update({ is_organizer: true }).eq('id', row.id).select().single();
      row = data;
    }
    res.json(await setPlace(req.event, row, to));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});

const TAGS = ['coach', 'referee'];
async function setRoles(event, prior, body) {
  const patch = {};
  if ('is_organizer' in body) {
    if (prior.user_id === event.host_id && !body.is_organizer) throw Object.assign(new Error('The Host is always an organizer.'), { status: 400, code: 'host_organizer' });
    patch.is_organizer = !!body.is_organizer;
    // No longer an organizer: someone "not playing" goes to the waitlist.
    if (!patch.is_organizer && prior.status === 'not_playing') patch.status = 'waitlisted';
  }
  if ('tags' in body) {
    if (!Array.isArray(body.tags) || body.tags.some((x) => !TAGS.includes(x))) throw Object.assign(new Error(`tags: ${TAGS.join(', ')}.`), { status: 400 });
    patch.tags = [...new Set(body.tags)];
  }
  const { data, error } = await supabase.from('event_participants').update(patch).eq('id', prior.id).select().single();
  if (error) throw error;
  return data;
}

// Actions: check-in / no-show / reset / promote / cancel / waive / fee / place / roles
router.post('/:eventId/participants/:participantId/:action', async (req, res) => {
  const { action } = req.params;
  const prior = req.participant;

  try {
    if (ATTENDANCE_ACTIONS.includes(action)) return res.json(await setAttendance(req.event, prior, action));
    if (action === 'cancel') return res.json(await cancelParticipant(req.event, prior));
    if (action === 'waive') return res.json(await waiveLateCancel(req.event, prior));
    if (action === 'promote') return res.json(await promoteParticipant(req.event, prior));
    // The sheet on a name: where they are (main / waitlist / waiting for approval / not playing)…
    if (action === 'place') return res.json(await setPlace(req.event, prior, req.body.to));
    // …and their role: organizer (Host / co-host), coach, referee.
    if (action === 'roles') return res.json(await setRoles(req.event, prior, req.body || {}));
    if (action === 'confirm-payment') return res.json(await signup.confirmPayment(req.event, prior, req.hostId));
    if (action === 'reject-payment') return res.json(await signup.rejectPayment(req.event, prior, req.body.note));
    // "Paid" on someone still waiting for confirmation = confirm their payment.
    if (action === 'fee' && req.body.fee_paid && prior.status === 'pending') return res.json(await signup.confirmPayment(req.event, prior, req.hostId));
  } catch (err) {
    return err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
  if (action !== 'fee') return res.status(400).json({ error: `Unknown action: ${action}` });

  const patch = { fee_paid: !!req.body.fee_paid };
  if (req.body.fee_amount != null) patch.fee_amount = req.body.fee_amount;
  const { data: updated, error } = await supabase
    .from('event_participants')
    .update(patch)
    .eq('id', prior.id)
    .select()
    .single();
  if (error) return dbError(res, error);

  // Fee ledger sync: write/void an event_fee transaction to match fee_paid
  // (only on an actual change, so a repeated "paid" can't book the fee twice).
  if (patch.fee_paid !== !!prior.fee_paid) {
    const owed = req.body.fee_amount ?? prior.fee_amount ?? req.event.fee_amount ?? 0;
    if (patch.fee_paid) {
      await supabase.from('transactions').insert({
        host_id: req.hostId,
        owner_type: 'event',
        event_id: req.event.id,
        type: 'income',
        category: 'event_fee',
        amount: owed,
        note: `Fee from ${prior.full_name}`,
      });
    } else {
      const { data: existing } = await supabase
        .from('transactions')
        .select('*')
        .eq('owner_type', 'event')
        .eq('event_id', req.event.id)
        .eq('category', 'event_fee')
        .eq('is_voided', false)
        .ilike('note', `Fee from ${prior.full_name}`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('transactions')
          .update({ is_voided: true, voided_at: nowIso(), void_reason: 'fee marked unpaid' })
          .eq('id', existing.id);
      }
    }
  }

  res.json(updated);
});

// Scan a player's personal QR (from the player portal) -> check them in.
router.post('/:eventId/checkin-code', async (req, res) => {
  try {
    res.json(await checkInByCode(req.event, req.body.code));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});

// ---- Match scorers (referee/coordinator role) ------------------------------
router.get('/:eventId/scorers', async (req, res) => {
  const { data, error } = await supabase.from('event_scorers').select('*').eq('event_id', req.event.id);
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/:eventId/scorers', async (req, res) => {
  const { full_name, role } = req.body;
  if (!full_name || !['referee', 'coordinator'].includes(role)) {
    return res.status(400).json({ error: 'full_name and role (referee|coordinator) are required.' });
  }
  const { data, error } = await supabase
    .from('event_scorers')
    .insert({ event_id: req.event.id, full_name, role })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// ---- Finance ------------------------------------------------------------------
router.get('/:eventId/finance', async (req, res) => {
  const { data: summary, error: sErr } = await supabase
    .from('v_event_finance')
    .select('*')
    .eq('event_id', req.event.id)
    .maybeSingle();
  if (sErr) return dbError(res, sErr);

  const { data: txns, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner_type', 'event')
    .eq('event_id', req.event.id)
    .order('occurred_on', { ascending: false });
  if (tErr) return dbError(res, tErr);

  res.json({ income: summary?.income || 0, expense: summary?.expense || 0, net: summary?.net || 0, transactions: txns });
});

// ---- Player reliability -------------------------------------------------------
router.get('/reliability/:clubMemberId', async (req, res) => {
  if (!isUuid(req.params.clubMemberId)) return notFound(res, 'Club member');
  const { data: member } = await supabase
    .from('club_members')
    .select('id, clubs!inner(host_id)')
    .eq('id', req.params.clubMemberId)
    .eq('clubs.host_id', req.hostId)
    .maybeSingle();
  if (!member) return notFound(res, 'Club member');
  const { data, error } = await supabase
    .from('v_player_reliability')
    .select('*')
    .eq('club_member_id', req.params.clubMemberId)
    .maybeSingle();
  if (error) return dbError(res, error);
  res.json(data || { club_member_id: req.params.clubMemberId, total_registrations: 0, no_shows: 0, attended: 0, reliability_pct: null });
});

module.exports = router;
