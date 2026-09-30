const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { requireAuth } = require('../middleware/auth');
const { normalizePhone, findClubMemberByPhone } = require('../services/memberships');
const {
  ATTENDANCE_ACTIONS,
  setAttendance,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  checkInByCode,
} = require('../services/attendance');
const signup = require('../services/signup');
const { HOLDS_PLACE } = require('../services/fees');

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
  'cancel_deadline_hours',
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
    return dbError(res, err);
  }

  const { data: people, error: pErr } = await supabase
    .from('event_participants')
    .select('full_name, dupr_level, status, joined_at')
    .eq('event_id', event.id)
    .in('status', [...MAIN_LIST, 'waitlisted'])
    .order('joined_at', { ascending: true });
  if (pErr) return dbError(res, pErr);

  let closedCode = null;
  if (!event.allow_public_registration) closedCode = 'disabled';
  else if (!['draft', 'open'].includes(event.status)) closedCode = 'not_open';
  else if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) closedCode = 'deadline';

  res.json({
    ...pick(event, PUBLIC_EVENT_FIELDS),
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
  const { data } = await supabase.from('player_profiles').select('full_name, phone, dupr_level').eq('user_id', userId).maybeSingle();
  return data;
}

// My standing (member / pending verification / guest) and my registration, with payment details when owed.
router.get('/public/:publicToken/me', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    await signup.expireHolds(event);
    const [profile, mine] = await Promise.all([playerProfile(req.userId), signup.myRegistration(event, req.userId)]);
    const { standing, participant } = mine;
    res.json({
      profile,
      member: {
        state: standing.state, // 'verified' | 'pending' | 'none'
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
    res.status(201).json(await signup.registerOnline(event, req.userId, await playerProfile(req.userId)));
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

// "I'm a member of this club" -> links the account to the member with my phone; the Host verifies it.
router.post('/public/:publicToken/claim-member', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    res.json({ state: await signup.claimMembership(event, req.userId, await playerProfile(req.userId)) });
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
  req.event = data;
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

// Normalises optional fields in place; returns an error message or null.
function cleanEventFields(fields) {
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
  let query = supabase.from('v_event_summary').select('*').eq('host_id', req.hostId);
  if (req.query.scope === 'standalone') query = query.is('club_id', null);
  const { data, error } = await query.order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

// `repeat_weeks` (1-26) creates the same session every week — the club's recurring schedule.
router.post('/', async (req, res) => {
  const { title, event_date } = req.body;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) {
    return res.status(400).json({ error: 'title and event_date are required.' });
  }

  const fields = pick(req.body, [
    'club_id', 'start_time', 'end_time', 'location', 'courts', 'slots',
    'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours',
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  if (!(await ownsClub(req.hostId, fields.club_id))) return notFound(res, 'Club');

  const weeks = Math.min(Math.max(parseInt(req.body.repeat_weeks, 10) || 1, 1), 26);
  const rows = Array.from({ length: weeks }, (_, i) => ({
    host_id: req.hostId,
    title,
    ...fields,
    event_date: addDays(event_date, 7 * i),
    registration_deadline: fields.registration_deadline
      ? new Date(new Date(fields.registration_deadline).getTime() + i * 7 * 86400000).toISOString()
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
    'allow_public_registration', 'notice', 'cancel_deadline_hours',
  ]);
  const bad = cleanEventFields(fields);
  if (bad) return res.status(400).json({ error: bad });
  if ('club_id' in fields && !(await ownsClub(req.hostId, fields.club_id))) return notFound(res, 'Club');
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', req.event.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.delete('/:eventId', async (req, res) => {
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

  const { data, error } = await supabase
    .from('event_participants')
    .insert({
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
  res.status(201).json(data);
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
    if (action === 'transfer') return res.json(await signup.transferSlot(req.event, prior, req.body, { byHost: true }));
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
