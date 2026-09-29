const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { checkCapacity, getUsage, limitBody } = require('../middleware/checkCapacity');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');

const router = express.Router();
router.use(requireAuth);

const EVENT_STATUSES = ['draft', 'open', 'closed', 'completed', 'cancelled'];
// Participants who occupy a place on the main list.
const MAIN_LIST = ['registered', 'checked_in', 'no_show'];
const nowIso = () => new Date().toISOString();

// ---- Param guards: prove ownership before any handler runs -----------------

router.param('eventId', async (req, res, next, eventId) => {
  if (!isUuid(eventId)) return res.status(400).json({ error: 'Invalid event id.' });
  const { data, error } = await supabaseAdmin
    .from('v_event_summary').select('*').eq('id', eventId).eq('host_id', req.user.id).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Event');
  req.event = data;
  next();
});

router.param('participantId', async (req, res, next, id) => {
  if (!isUuid(id)) return res.status(400).json({ error: 'Invalid participant id.' });
  const { data, error } = await supabaseAdmin
    .from('event_participants').select('*').eq('id', id).eq('event_id', req.event.id).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Participant');
  req.participant = data;
  next();
});

// ---- Validation ------------------------------------------------------------

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// A club can only be attached if it belongs to the caller.
async function ownsClub(hostId, clubId) {
  if (!isUuid(clubId)) return false;
  const { data } = await supabaseAdmin.from('clubs').select('id').eq('id', clubId).eq('host_id', hostId).maybeSingle();
  return !!data;
}

function buildEventFields(body, partial) {
  const f = pick(body, ['title', 'event_date', 'start_time', 'end_time', 'location', 'notes', 'status', 'club_id']);
  for (const k of ['end_time', 'location', 'notes', 'club_id']) if (f[k] === '') f[k] = null;

  const rules = {
    num_courts: { min: 1, int: true },
    max_slots: { min: 1, int: true },
    required_level: { min: 0, max: 9.99 },
    fee_amount: { min: 0 },
    court_cost: { min: 0 },
    ball_cost: { min: 0 },
  };
  for (const [k, r] of Object.entries(rules)) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === '') {
      if (k === 'required_level') f[k] = null;
      continue;
    }
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < r.min || (r.max !== undefined && n > r.max) || (r.int && !Number.isInteger(n))) {
      return { error: `${k} is invalid.` };
    }
    f[k] = n;
  }

  if (!partial) {
    for (const k of ['title', 'event_date', 'start_time', 'max_slots']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') return { error: `${k} is required.` };
    }
  }
  if (f.title !== undefined && !String(f.title).trim()) return { error: 'title cannot be empty.' };
  if (f.title !== undefined) f.title = String(f.title).trim();
  if (f.event_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f.event_date)) return { error: 'event_date must be YYYY-MM-DD.' };
  if (f.start_time !== undefined && !/^\d{2}:\d{2}(:\d{2})?$/.test(f.start_time)) return { error: 'start_time must be HH:MM.' };
  if (f.end_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(f.end_time)) return { error: 'end_time must be HH:MM.' };
  if (f.status !== undefined && !EVENT_STATUSES.includes(f.status)) return { error: 'Invalid status.' };
  return { fields: f };
}

// ---- Player reliability (declared before the :eventId routes) ---------------

router.get('/players/reliability', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_player_reliability').select('*').eq('host_id', req.user.id)
    .order('reliability_pct', { ascending: true, nullsFirst: false });
  if (error) return dbError(res, error);
  res.json({ players: data });
});

// ---- Events ----------------------------------------------------------------

router.get('/', async (req, res) => {
  let query = supabaseAdmin
    .from('v_event_summary').select('*').eq('host_id', req.user.id)
    .order('event_date', { ascending: false }).order('start_time', { ascending: false });
  if (req.query.club_id) {
    if (!isUuid(req.query.club_id)) return res.status(400).json({ error: 'Invalid club id.' });
    query = query.eq('club_id', req.query.club_id);
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json({ events: data });
});

// Create one event, or a weekly series (repeat_count = total number of events, max 12).
router.post('/', async (req, res) => {
  const { fields, error: vErr } = buildEventFields(req.body, false);
  if (vErr) return res.status(400).json({ error: vErr });

  const repeat = req.body.repeat_count === undefined ? 1 : Number(req.body.repeat_count);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 12) {
    return res.status(400).json({ error: 'repeat_count must be a whole number from 1 to 12.' });
  }
  if (fields.club_id && !(await ownsClub(req.user.id, fields.club_id))) {
    return res.status(400).json({ error: 'INVALID_CLUB', message: 'That club does not exist.' });
  }

  const rows = Array.from({ length: repeat }, (_, i) => ({
    ...fields,
    event_date: addDays(fields.event_date, i * 7),
    host_id: req.user.id,
    status: 'open',
  }));
  const { data, error } = await supabaseAdmin.from('events').insert(rows).select();
  if (error) return dbError(res, error);
  res.status(201).json({ event: data[0], events: data });
});

router.get('/:eventId', (req, res) => res.json({ event: req.event }));

router.patch('/:eventId', async (req, res) => {
  const { fields, error: vErr } = buildEventFields(req.body, true);
  if (vErr) return res.status(400).json({ error: vErr });
  if (fields.club_id && !(await ownsClub(req.user.id, fields.club_id))) {
    return res.status(400).json({ error: 'INVALID_CLUB', message: 'That club does not exist.' });
  }
  const { data, error } = await supabaseAdmin
    .from('events').update({ ...fields, updated_at: nowIso() }).eq('id', req.event.id).select().single();
  if (error) return dbError(res, error);
  res.json({ event: data });
});

// ---- Participants ------------------------------------------------------------

router.get('/:eventId/participants', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('event_participants').select('*').eq('event_id', req.event.id)
    .order('registered_at', { ascending: true });
  if (error) return dbError(res, error);
  res.json({ participants: data });
});

async function mainListCount(eventId) {
  const { count, error } = await supabaseAdmin
    .from('event_participants').select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).in('status', MAIN_LIST);
  if (error) throw error;
  return count || 0;
}

// Add someone. Lands on the main list until max_slots is reached, then the waitlist.
router.post('/:eventId/participants', checkCapacity, async (req, res) => {
  if (req.event.status !== 'open') {
    return res.status(409).json({
      error: 'EVENT_NOT_OPEN',
      message: `This event is ${req.event.status}. Set it back to "open" to add participants.`,
    });
  }

  const display_name = (req.body.display_name || '').trim();
  if (!display_name) return res.status(400).json({ error: 'display_name is required.' });
  const phone = req.body.phone ? String(req.body.phone).trim() : null;

  let fee_amount = null;
  if (req.body.fee_amount !== undefined && req.body.fee_amount !== null && req.body.fee_amount !== '') {
    fee_amount = Number(req.body.fee_amount);
    if (!Number.isFinite(fee_amount) || fee_amount < 0) return res.status(400).json({ error: 'fee_amount must be 0 or more.' });
  }

  let dupr_level = null;
  if (req.body.dupr_level !== undefined && req.body.dupr_level !== null && req.body.dupr_level !== '') {
    dupr_level = Number(req.body.dupr_level);
    if (!Number.isFinite(dupr_level) || dupr_level < 0 || dupr_level > 9.99) return res.status(400).json({ error: 'dupr_level must be between 0 and 9.99.' });
  }

  if (phone) {
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from('event_participants').select('id')
      .eq('event_id', req.event.id).eq('phone', phone)
      .in('status', ['registered', 'waitlist', 'checked_in', 'no_show']).limit(1);
    if (dupErr) return dbError(res, dupErr);
    if (dup && dup.length) {
      return res.status(409).json({ error: 'DUPLICATE_PARTICIPANT', message: 'Someone with that phone number is already registered for this event.' });
    }
  }

  const count = await mainListCount(req.event.id);
  const goesToMainList = count < req.event.max_slots;

  const { data, error } = await supabaseAdmin
    .from('event_participants')
    .insert({
      event_id: req.event.id,
      user_id: isUuid(req.body.user_id) ? req.body.user_id : null,
      display_name, phone, fee_amount, dupr_level,
      status: goesToMainList ? 'registered' : 'waitlist',
      waitlisted_at: goesToMainList ? null : nowIso(),
    })
    .select().single();
  if (error) return dbError(res, error);
  res.status(201).json({ participant: data, waitlisted: !goesToMainList, capacity: req.capacity });
});

// ---- Import from a club ------------------------------------------------------
// Clones selected club members into this event's participants. The main list fills
// first (in the order the host selected), the rest go to the waitlist. People who are
// already in the event are skipped, and the plan limit is checked for the whole batch.
router.post('/:eventId/participants/import', async (req, res) => {
  if (req.event.status !== 'open') {
    return res.status(409).json({
      error: 'EVENT_NOT_OPEN',
      message: `This event is ${req.event.status}. Set it back to "open" to add participants.`,
    });
  }

  const { club_id, member_ids } = req.body;
  if (!isUuid(club_id)) return res.status(400).json({ error: 'club_id is required.' });
  if (!Array.isArray(member_ids) || member_ids.length === 0) return res.status(400).json({ error: 'Select at least one member.' });
  if (member_ids.length > 500 || !member_ids.every(isUuid)) return res.status(400).json({ error: 'Invalid member selection.' });
  if (!(await ownsClub(req.user.id, club_id))) return notFound(res, 'Club');

  const ids = [...new Set(member_ids)];
  const { data: members, error: memErr } = await supabaseAdmin
    .from('club_members').select('*').eq('club_id', club_id).eq('status', 'active').in('id', ids);
  if (memErr) return dbError(res, memErr);

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('event_participants').select('display_name, phone, source_club_member_id')
    .eq('event_id', req.event.id).in('status', ['registered', 'waitlist', 'checked_in', 'no_show']);
  if (exErr) return dbError(res, exErr);

  const norm = (v) => String(v || '').trim().toLowerCase();
  const takenIds = new Set(existing.map((e) => e.source_club_member_id).filter(Boolean));
  const takenPhones = new Set(existing.map((e) => norm(e.phone)).filter(Boolean));
  const takenNames = new Set(existing.map((e) => norm(e.display_name)));

  const byId = new Map(members.map((m) => [m.id, m]));
  const toAdd = [];
  const skipped = [];
  for (const id of ids) {                       // keep the host's selection order
    const m = byId.get(id);
    if (!m) { skipped.push({ id, reason: 'NOT_FOUND' }); continue; }
    if (takenIds.has(m.id) || (m.phone && takenPhones.has(norm(m.phone))) || takenNames.has(norm(m.display_name))) {
      skipped.push({ id, reason: 'ALREADY_IN_EVENT' });
      continue;
    }
    takenIds.add(m.id);
    if (m.phone) takenPhones.add(norm(m.phone));
    takenNames.add(norm(m.display_name));
    toAdd.push(m);
  }

  if (toAdd.length === 0) return res.json({ added: [], skipped, waitlisted: 0 });

  const usage = await getUsage(req.user.id);
  const remaining = Math.max(0, usage.max_capacity - usage.current_usage);
  if (toAdd.length > remaining) {
    return res.status(403).json({ ...limitBody(usage), remaining, requested: toAdd.length });
  }

  const count = await mainListCount(req.event.id);
  const slotsLeft = Math.max(0, req.event.max_slots - count);
  const base = Date.now();
  const rows = toAdd.map((m, i) => {
    const main = i < slotsLeft;
    return {
      event_id: req.event.id,
      user_id: m.user_id || null,
      display_name: m.display_name,
      phone: m.phone,
      dupr_level: m.dupr_level,
      source_club_member_id: m.id,
      status: main ? 'registered' : 'waitlist',
      waitlisted_at: main ? null : new Date(base + i).toISOString(),
    };
  });

  const { data: added, error } = await supabaseAdmin.from('event_participants').insert(rows).select();
  if (error) return dbError(res, error);
  res.status(201).json({ added, skipped, waitlisted: rows.filter((r) => r.status === 'waitlist').length });
});

async function setParticipant(req, res, patch, allowedFrom, conflictMsg) {
  if (!allowedFrom.includes(req.participant.status)) {
    return res.status(409).json({ error: 'INVALID_STATE', message: conflictMsg });
  }
  const { data, error } = await supabaseAdmin
    .from('event_participants').update({ ...patch, updated_at: nowIso() })
    .eq('id', req.participant.id).select().single();
  if (error) return dbError(res, error);
  res.json({ participant: data });
}

router.post('/:eventId/participants/:participantId/check-in', (req, res) =>
  setParticipant(req, res,
    { status: 'checked_in', checked_in_at: nowIso(), no_show_at: null },
    ['registered', 'no_show', 'checked_in'],
    'Move this person off the waitlist before checking them in.'));

router.post('/:eventId/participants/:participantId/no-show', (req, res) =>
  setParticipant(req, res,
    { status: 'no_show', no_show_at: nowIso(), checked_in_at: null },
    ['registered', 'checked_in', 'no_show'],
    'Only people on the main list can be flagged as no-shows.'));

// Host override: bring a waitlisted person onto the main list (e.g. you added a court).
router.post('/:eventId/participants/:participantId/promote', (req, res) =>
  setParticipant(req, res,
    { status: 'registered', waitlisted_at: null },
    ['waitlist'],
    'Only waitlisted people can be moved to the main list.'));

// Cancel a registration. If a main-list place opens up, the longest-waiting
// waitlisted person is promoted automatically.
router.post('/:eventId/participants/:participantId/cancel', async (req, res) => {
  const prior = req.participant;
  if (prior.status === 'cancelled') return res.json({ cancelled: prior, promoted: null });

  const { data: cancelled, error } = await supabaseAdmin
    .from('event_participants').update({ status: 'cancelled', cancelled_at: nowIso(), updated_at: nowIso() })
    .eq('id', prior.id).select().single();
  if (error) return dbError(res, error);

  let promoted = null;
  const freedAPlace = ['registered', 'checked_in'].includes(prior.status);
  if (freedAPlace && req.event.status === 'open') {
    const count = await mainListCount(req.event.id);
    if (count < req.event.max_slots) {
      const { data: next } = await supabaseAdmin
        .from('event_participants').select('id')
        .eq('event_id', req.event.id).eq('status', 'waitlist')
        .order('waitlisted_at', { ascending: true }).limit(1).maybeSingle();
      if (next) {
        const { data: up } = await supabaseAdmin
          .from('event_participants').update({ status: 'registered', waitlisted_at: null, updated_at: nowIso() })
          .eq('id', next.id).select().single();
        promoted = up;
      }
    }
  }
  res.json({ cancelled, promoted });
});

// ---- Fees ------------------------------------------------------------------
// Marking a fee paid writes an income row to the ledger; unmarking VOIDS that row
// (the ledger is append-only, so nothing is ever deleted).

router.patch('/:eventId/participants/:participantId/fee', async (req, res) => {
  const { fee_paid, fee_amount } = req.body;
  const p = req.participant;

  if (typeof fee_paid !== 'boolean' && fee_amount === undefined) {
    return res.status(400).json({ error: 'Provide fee_paid (boolean) and/or fee_amount.' });
  }

  const owed = fee_amount !== undefined && fee_amount !== null ? Number(fee_amount) : (p.fee_amount ?? req.event.fee_amount);
  if (!Number.isFinite(Number(owed)) || Number(owed) < 0) return res.status(400).json({ error: 'fee_amount must be 0 or more.' });

  // Changing the amount of an already-paid fee would desync the ledger.
  if (fee_amount !== undefined && p.fee_paid && fee_paid !== false) {
    return res.status(409).json({ error: 'INVALID_STATE', message: 'Unmark the fee as paid before changing its amount.' });
  }

  if (fee_paid === true && !p.fee_paid) {
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('transactions')
      .insert({
        event_id: req.event.id, type: 'income', source: 'event_fee', amount: Number(owed),
        description: `Fee: ${p.display_name}`, related_participant_id: p.id, created_by: req.user.id,
      })
      .select().single();
    if (txnErr) return dbError(res, txnErr);

    const { data, error } = await supabaseAdmin
      .from('event_participants')
      .update({ fee_paid: true, fee_amount: fee_amount !== undefined ? Number(owed) : p.fee_amount, updated_at: nowIso() })
      .eq('id', p.id).select().single();
    if (error) {
      // Keep the ledger and the participant row in agreement.
      await supabaseAdmin.from('transactions')
        .update({ is_voided: true, voided_at: nowIso(), void_reason: 'Rolled back: participant update failed' })
        .eq('id', txn.id);
      return dbError(res, error);
    }
    return res.json({ participant: data, transaction: txn });
  }

  if (fee_paid === false && p.fee_paid) {
    const { error: voidErr } = await supabaseAdmin
      .from('transactions')
      .update({ is_voided: true, voided_at: nowIso(), void_reason: 'Fee unmarked as paid' })
      .eq('related_participant_id', p.id).eq('source', 'event_fee').eq('is_voided', false);
    if (voidErr) return dbError(res, voidErr);
  }

  const patch = { updated_at: nowIso() };
  if (typeof fee_paid === 'boolean') patch.fee_paid = fee_paid;
  if (fee_amount !== undefined) patch.fee_amount = fee_amount === null ? null : Number(fee_amount);
  const { data, error } = await supabaseAdmin
    .from('event_participants').update(patch).eq('id', p.id).select().single();
  if (error) return dbError(res, error);
  res.json({ participant: data });
});

// ---- Finance (Lai / Lo) ------------------------------------------------------

router.get('/:eventId/finance', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_event_finance').select('*').eq('event_id', req.event.id).maybeSingle();
  if (error) return dbError(res, error);
  res.json({ finance: data, event: req.event });
});

module.exports = router;
