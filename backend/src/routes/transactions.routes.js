const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');

const router = express.Router();

async function ownsParent(hostId, { club_id, event_id }) {
  if (club_id) {
    const { data } = await supabase.from('clubs').select('id').eq('id', club_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  if (event_id) {
    const { data } = await supabase.from('events').select('id').eq('id', event_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  return false;
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
    if (!isUuid(club_id)) return res.status(400).json({ error: 'invalid club_id' });
    query = query.eq('owner_type', 'club').eq('club_id', club_id);
  } else if (event_id) {
    if (!isUuid(event_id)) return res.status(400).json({ error: 'invalid event_id' });
    query = query.eq('owner_type', 'event').eq('event_id', event_id);
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
  const owns = await ownsParent(req.hostId, parent);
  if (!owns) return res.status(403).json({ error: 'You do not own this club/event.' });

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      host_id: req.hostId,
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

router.post('/:id/void', async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res, 'Transaction');
  const { data: txn, error: fErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', req.params.id)
    .eq('host_id', req.hostId)
    .maybeSingle();
  if (fErr) return dbError(res, fErr);
  if (!txn) return notFound(res, 'Transaction');
  if (txn.is_voided) return res.status(400).json({ error: 'Already voided.' });

  // Entries created from somewhere else must be changed there, or the two would disagree.
  const [{ data: ms }, { data: moves }] = await Promise.all([
    supabase.from('memberships').select('id').eq('transaction_id', txn.id).limit(1),
    supabase.from('inventory_moves').select('id').eq('transaction_id', txn.id).limit(1),
  ]);
  const source = ms?.length ? 'membership' : moves?.length ? 'inventory' : txn.category === 'event_fee' ? 'event_fee' : null;
  if (source) {
    return res.status(409).json({ error: `This entry comes from a ${source.replace('_', ' ')}; change it there instead.`, code: `linked_${source}` });
  }

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
