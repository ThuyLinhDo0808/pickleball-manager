const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { clubAccess, eventAccess } = require('../services/clubAccess');

const router = express.Router();

// Whose ledger an entry goes into: a club I own or co-admin (-> its owner), or an event I
// own or whose club I co-admin (-> the event's host).
async function ledgerOwner(req, { club_id, event_id }) {
  if (club_id) return (await clubAccess(req, club_id))?.club.host_id || null;
  if (event_id && isUuid(event_id)) {
    const { data } = await supabase.from('events').select('id, host_id, club_id').eq('id', event_id).maybeSingle();
    return (await eventAccess(req, data))?.hostId || null;
  }
  return null;
}

router.get('/', async (req, res) => {
  const { club_id, event_id } = req.query;
  let query = supabase.from('transactions').select('*, events(title, event_date)').eq('host_id', req.hostId).order('occurred_on', { ascending: false });
  if (req.query.scope === 'standalone') {
    // Xé Vé ledger: every entry of the host's events that aren't tied to a club.
    const { data: evs, error: eErr } = await supabase.from('events').select('id').eq('host_id', req.hostId).is('club_id', null);
    if (eErr) return dbError(res, eErr);
    if (!evs.length) return res.json([]);
    query = query.eq('owner_type', 'event').in('event_id', evs.map((e) => e.id));
  } else if (club_id) {
    const access = await clubAccess(req, club_id);
    if (!access) return notFound(res, 'Club');
    query = supabase
      .from('transactions')
      .select('*, events(title, event_date)')
      .eq('host_id', access.club.host_id)
      .eq('owner_type', 'club')
      .eq('club_id', club_id)
      .order('occurred_on', { ascending: false });
  } else if (event_id) {
    if (!isUuid(event_id)) return res.status(400).json({ error: 'invalid event_id' });
    const host = await ledgerOwner(req, { event_id });
    if (!host) return notFound(res, 'Event');
    query = supabase.from('transactions').select('*, events(title, event_date)').eq('host_id', host).eq('owner_type', 'event').eq('event_id', event_id).order('occurred_on', { ascending: false });
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { owner_type, club_id, event_id, type, category, amount, note, occurred_on } = req.body;
  if (!['club', 'event'].includes(owner_type)) return res.status(400).json({ error: 'owner_type must be club or event.' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense.' });
  if (amount == null || amount < 0) return res.status(400).json({ error: 'amount must be >= 0.' });

  const parent = owner_type === 'club' ? { club_id } : { event_id };
  const hostId = await ledgerOwner(req, parent);
  if (!hostId) return res.status(403).json({ error: 'You do not have access to this club/event.' });

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      host_id: hostId,
      owner_type,
      club_id: owner_type === 'club' ? club_id : null,
      event_id: owner_type === 'event' ? event_id : null,
      type,
      category: category || null,
      amount,
      note: note || null,
      occurred_on: occurred_on || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// An entry I may change (my ledger, or a club I co-admin), or null.
async function ownTxn(req) {
  if (!isUuid(req.params.id)) return null;
  const { data: txn, error } = await supabase.from('transactions').select('*').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  const allowed =
    txn &&
    (txn.host_id === req.hostId ||
      (txn.owner_type === 'club' && (await clubAccess(req, txn.club_id))) ||
      (txn.owner_type === 'event' && (await ledgerOwner(req, { event_id: txn.event_id })) === txn.host_id));
  return allowed ? txn : null;
}

// Entries created from somewhere else must be changed there, or the two would disagree.
async function linkedSource(txn) {
  const [{ data: ms }, { data: moves }] = await Promise.all([
    supabase.from('memberships').select('id').eq('transaction_id', txn.id).limit(1),
    supabase.from('inventory_moves').select('id').eq('transaction_id', txn.id).limit(1),
  ]);
  return ms?.length ? 'membership' : moves?.length ? 'inventory' : txn.category === 'event_fee' ? 'event_fee' : txn.category === 'meeting' ? 'meeting' : null;
}
const linkedError = (res, source) =>
  res.status(409).json({ error: `This entry comes from a ${source.replace('_', ' ')}; change it there instead.`, code: `linked_${source}` });

// Fix an entry. Category, note and date change in place; a new amount or type voids the
// entry and writes the corrected one (the ledger only grows, so the history stays).
router.patch('/:id', async (req, res) => {
  let txn;
  try {
    txn = await ownTxn(req);
  } catch (err) {
    return dbError(res, err);
  }
  if (!txn) return notFound(res, 'Transaction');
  if (txn.is_voided) return res.status(400).json({ error: 'This entry was voided.' });
  const source = await linkedSource(txn);
  if (source) return linkedError(res, source);
  const b = req.body || {};
  const type = b.type ?? txn.type;
  const amount = b.amount != null && b.amount !== '' ? Number(b.amount) : Number(txn.amount);
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense.' });
  if (!(amount >= 0)) return res.status(400).json({ error: 'amount must be >= 0.' });
  if (b.occurred_on && !/^\d{4}-\d{2}-\d{2}$/.test(b.occurred_on)) return res.status(400).json({ error: 'occurred_on must be YYYY-MM-DD.' });
  const soft = {
    category: 'category' in b ? b.category || null : txn.category,
    note: 'note' in b ? (b.note ? String(b.note).slice(0, 500) : null) : txn.note,
    occurred_on: b.occurred_on || txn.occurred_on,
  };
  if (type === txn.type && amount === Number(txn.amount)) {
    const { data, error } = await supabase.from('transactions').update(soft).eq('id', txn.id).select().single();
    if (error) return dbError(res, error);
    return res.json(data);
  }
  const { id, created_at, is_voided, voided_at, void_reason, replaced_by, ...rest } = txn;
  const { data: next, error: iErr } = await supabase.from('transactions').insert({ ...rest, ...soft, type, amount }).select().single();
  if (iErr) return dbError(res, iErr);
  const { error: vErr } = await supabase
    .from('transactions')
    .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'edited', replaced_by: next.id })
    .eq('id', txn.id);
  if (vErr) return dbError(res, vErr);
  res.json(next);
});

router.post('/:id/void', async (req, res) => {
  let txn;
  try {
    txn = await ownTxn(req);
  } catch (err) {
    return dbError(res, err);
  }
  if (!txn) return notFound(res, 'Transaction');
  if (txn.is_voided) return res.status(400).json({ error: 'Already voided.' });
  const source = await linkedSource(txn);
  if (source) return linkedError(res, source);

  const { data, error } = await supabase
    .from('transactions')
    .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: req.body.reason || null })
    .eq('id', txn.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

module.exports = router;
