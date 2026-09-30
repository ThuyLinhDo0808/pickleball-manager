const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { normalizePhone, findClubMemberByPhone } = require('../services/memberships');
const {
  ATTENDANCE_ACTIONS,
  setAttendance,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  checkInByCode,
} = require('../services/attendance');

const router = express.Router();
const MAIN_LIST = ['registered', 'checked_in'];

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

router.post('/public/:publicToken/register', optionalAuth, async (req, res) => {
  if (!isUuid(req.params.publicToken)) return notFound(res, 'Event');
  const { data: event, error: eErr } = await supabase
    .from('events')
    .select('*')
    .eq('public_token', req.params.publicToken)
    .eq('allow_public_registration', true)
    .maybeSingle();
  if (eErr) return dbError(res, eErr);
  if (!event) return notFound(res, 'Event');

  const blockedReason = assertRegistrationOpen(event);
  if (blockedReason) return res.status(403).json({ error: blockedReason });

  const full_name = String(req.body.full_name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const dupr_level = req.body.dupr_level === '' || req.body.dupr_level == null ? null : Number(req.body.dupr_level);
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });
  if (normalizePhone(phone).length < 9) return res.status(400).json({ error: 'A valid phone number is required.' });
  if (dupr_level != null && !(dupr_level >= 1 && dupr_level <= 8)) {
    return res.status(400).json({ error: 'dupr_level must be between 1 and 8.' });
  }

  // One active registration per phone number per event.
  const { data: existing, error: dErr } = await supabase
    .from('event_participants')
    .select('phone')
    .eq('event_id', event.id)
    .in('status', [...MAIN_LIST, 'waitlisted']);
  if (dErr) return dbError(res, dErr);
  if (existing.some((p) => normalizePhone(p.phone) === normalizePhone(phone))) {
    return res.status(409).json({ error: 'This phone number is already registered for this event.' });
  }

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .in('status', MAIN_LIST);
  const status = (count || 0) >= event.slots ? 'waitlisted' : 'registered';

  const { data, error } = await supabase
    .from('event_participants')
    .insert({
      event_id: event.id,
      full_name,
      phone,
      dupr_level,
      status,
      source_club_member_id: await findClubMemberByPhone(event.club_id, phone),
      user_id: req.userId || null, // signed-in player: shows up in their history
    })
    .select('full_name, status')
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
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

function assertRegistrationOpen(event) {
  if (!['draft', 'open'].includes(event.status)) {
    return 'Registration is not open for this event.';
  }
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    return 'The registration deadline has passed.';
  }
  return null;
}

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
  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('event_id', req.event.id)
    .order('joined_at', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/:eventId/participants', checkCapacity(), async (req, res) => {
  const { full_name, phone, dupr_level, fee_amount } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });

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
      source_club_member_id: await findClubMemberByPhone(req.event.club_id, phone),
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
