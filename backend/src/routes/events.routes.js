const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const MAIN_LIST = ['registered', 'checked_in'];

function nowIso() {
  return new Date().toISOString();
}

// ---- PUBLIC routes (no auth) — must be registered before requireAuth below,
// so a matching request is handled here and never falls through to it. ------
router.get('/public/:publicToken', async (req, res) => {
  const { data: event, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('public_token', req.params.publicToken)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!event) return notFound(res, 'Event');
  res.json(event);
});

router.post('/public/:publicToken/register', async (req, res) => {
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

  const { full_name, phone, dupr_level } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .in('status', MAIN_LIST);
  const status = (count || 0) >= event.slots ? 'waitlisted' : 'registered';

  const { data, error } = await supabase
    .from('event_participants')
    .insert({ event_id: event.id, full_name, phone: phone || null, dupr_level: dupr_level ?? null, status })
    .select()
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
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('host_id', req.hostId)
    .order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { title, event_date } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'title and event_date are required.' });

  const fields = pick(req.body, [
    'club_id', 'start_time', 'end_time', 'location', 'courts', 'slots',
    'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration',
  ]);
  const { data, error } = await supabase
    .from('events')
    .insert({ host_id: req.hostId, title, event_date, ...fields })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.get('/:eventId', (req, res) => res.json(req.event));

router.patch('/:eventId', async (req, res) => {
  const fields = pick(req.body, [
    'title', 'event_date', 'club_id', 'start_time', 'end_time', 'location', 'courts',
    'slots', 'level_min', 'level_max', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration',
  ]);
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

// Actions: check-in / no-show / promote / cancel / fee
router.post('/:eventId/participants/:participantId/:action', async (req, res) => {
  const { action } = req.params;
  const prior = req.participant;
  const patch = {};

  if (action === 'check-in') {
    patch.status = 'checked_in';
    patch.checked_in_at = nowIso();
  } else if (action === 'no-show') {
    patch.status = 'no_show';
    patch.no_show_at = nowIso();
  } else if (action === 'cancel') {
    patch.status = 'cancelled';
    patch.cancelled_at = nowIso();
  } else if (action === 'promote') {
    patch.status = 'registered';
  } else if (action === 'fee') {
    const paid = !!req.body.fee_paid;
    patch.fee_paid = paid;
    if (req.body.fee_amount != null) patch.fee_amount = req.body.fee_amount;
  } else {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  const { data: updated, error } = await supabase
    .from('event_participants')
    .update(patch)
    .eq('id', prior.id)
    .select()
    .single();
  if (error) return dbError(res, error);

  // Cancelling someone who held a main-list slot frees it up -> auto-promote next waitlisted
  if (action === 'cancel') {
    const freedAPlace = MAIN_LIST.includes(prior.status);
    if (freedAPlace) {
      const { data: nextUp } = await supabase
        .from('event_participants')
        .select('*')
        .eq('event_id', req.event.id)
        .eq('status', 'waitlisted')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextUp) {
        await supabase.from('event_participants').update({ status: 'registered' }).eq('id', nextUp.id);
      }
    }
  }

  // Fee ledger sync: write/void an event_fee transaction to match fee_paid
  if (action === 'fee') {
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
  const { data, error } = await supabase
    .from('v_player_reliability')
    .select('*')
    .eq('club_member_id', req.params.clubMemberId)
    .maybeSingle();
  if (error) return dbError(res, error);
  res.json(data || { club_member_id: req.params.clubMemberId, total_registrations: 0, no_shows: 0, attended: 0, reliability_pct: null });
});

module.exports = router;
