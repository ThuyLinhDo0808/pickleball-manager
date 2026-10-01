const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
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
} = require('../services/attendance');
const signup = require('../services/signup');
const { notifyEventCancelled } = require('../services/notify');
const { HOLDS_PLACE } = require('../services/fees');
const { perksFor, ensureGuestMember } = require('../services/guests');
const survey = require('../services/survey');
const { itemMetrics } = require('../services/inventory');
const { clubSport } = require('../services/sport');
const { linkByPhone } = require('../services/phoneLink');
const { HOST_STATUSES, completeFinished, completeIfFinished } = require('../services/eventStatus');

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
  'cancel_deadline_hours', 'kind',
];

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
    .select('full_name, dupr_level, status, joined_at')
    .eq('event_id', event.id)
    .not('status', 'in', '(cancelled,no_show)') // (works on databases that don't know 'pending' yet)
    .order('joined_at', { ascending: true });
  if (pErr) return dbError(res, pErr);

  let closedCode = null;
  if (!event.allow_public_registration) closedCode = 'disabled';
  else if (!['draft', 'open'].includes(event.status)) closedCode = 'not_open';
  else if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) closedCode = 'deadline';

  res.json({
    ...pick(event, PUBLIC_EVENT_FIELDS),
    sport: await clubSport(event.club_id), // levels show as DUPR or badminton steps
    registration_open: !closedCode,
    closed_code: closedCode,
    participants: people.map(({ joined_at, ...p }) => p),
  });
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
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
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
        sessions_remaining: standing.pass ? (standing.pass.sessions_included === 0 ? null : standing.pass.sessions_remaining) : null,
      },
      registration: await signup.registrationView(event, participant),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/register', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
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
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('host_id', req.hostId)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Event');
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
async function ownsClub(hostId, clubId) {
  if (!clubId) return true; // standalone (Xé Vé) event
  if (!isUuid(clubId)) return false;
  const { data } = await supabase.from('clubs').select('id').eq('id', clubId).eq('host_id', hostId).maybeSingle();
  return !!data;
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
  return null;
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Transfer screenshots waiting for the Host, across all their upcoming events.
router.get('/pending-payments', async (req, res) => {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, event_date, start_time, fee_amount, club_id')
    .eq('host_id', req.hostId)
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
  let query = supabase.from('v_event_summary').select('*').eq('host_id', req.hostId);
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
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  if (!(await ownsClub(req.hostId, fields.club_id))) return notFound(res, 'Club');

  const weeks = Math.min(Math.max(parseInt(req.body.repeat_weeks, 10) || 1, 1), 26);
  const days = dates || Array.from({ length: weeks }, (_, i) => addDays(event_date, 7 * i));
  // The registration deadline keeps the same distance to each session as to the first.
  const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
  const rows = days.map((d) => ({
    host_id: req.hostId,
    title,
    ...fields,
    status: fields.status || 'open',
    event_date: d,
    registration_deadline: fields.registration_deadline
      ? new Date(new Date(fields.registration_deadline).getTime() + dayMs(d) - dayMs(event_date)).toISOString()
      : null,
  }));
  const { data, error } = await supabase.from('events').insert(rows).select();
  if (error) return dbError(res, error);
  data.sort((a, b) => a.event_date.localeCompare(b.event_date));
  res.status(201).json({ ...data[0], created_count: data.length });
});

router.get('/:eventId', (req, res) => res.json(req.event));

router.patch('/:eventId', async (req, res) => {
  const fields = pick(req.body, [
    'title', 'event_date', 'club_id', 'start_time', 'end_time', 'location', 'courts',
    'slots', 'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours', 'kind',
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  if (req.event.status === 'cancelled' && fields.status && fields.status !== 'cancelled') {
    return res.status(409).json({ error: 'A cancelled event stays cancelled.', code: 'cancelled' });
  }
  if ('club_id' in fields && !(await ownsClub(req.hostId, fields.club_id))) return notFound(res, 'Club');
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', req.event.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  // Host cancelled the event: tell everyone who had a place (in the background).
  if (fields.status === 'cancelled' && req.event.status !== 'cancelled') notifyEventCancelled(data);
  res.json(data);
});

// Deleting wipes the event's participants and money records too. When there are any,
// the Host must confirm (?force=1); "Cancelled" is the way to keep the history.
// Upcoming session with people signed up: never deleted — cancel it so they are told.
// A past session (completed / cancelled / its date gone) can be deleted to tidy up the
// history, but only once the Host confirmed (?force=1) after seeing what goes with it.
// Otherwise money records alone also need ?force=1.
router.delete('/:eventId', async (req, res) => {
  const [{ count: people }, { count: money }, { count: matches }] = await Promise.all([
    supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).neq('status', 'cancelled'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).eq('is_voided', false),
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
  // screenshots are fetched one at a time (they are large)
  res.json(data.map(({ payment_proof, ...p }) => ({ ...p, has_proof: !!payment_proof })));
});

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

// Actions: check-in / no-show / reset / promote / cancel / waive / fee
router.post('/:eventId/participants/:participantId/:action', async (req, res) => {
  const { action } = req.params;
  const prior = req.participant;

  try {
    if (ATTENDANCE_ACTIONS.includes(action)) return res.json(await setAttendance(req.event, prior, action));
    if (action === 'cancel') return res.json(await cancelParticipant(req.event, prior));
    if (action === 'waive') return res.json(await waiveLateCancel(req.event, prior));
    if (action === 'promote') return res.json(await promoteParticipant(req.event, prior));
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
