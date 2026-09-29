const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { dbError, notFound, isUuid } = require('../utils/respond');

const router = express.Router();
router.use(requireAuth);

async function assertOwnership(req, { club_id, event_id }) {
  if ((club_id && !isUuid(club_id)) || (event_id && !isUuid(event_id))) return false;
  if (club_id) {
    const { data } = await supabaseAdmin.from('clubs').select('id').eq('id', club_id).eq('host_id', req.user.id).maybeSingle();
    return !!data;
  }
  if (event_id) {
    const { data } = await supabaseAdmin.from('events').select('id').eq('id', event_id).eq('host_id', req.user.id).maybeSingle();
    return !!data;
  }
  return false;
}

// List: GET /api/transactions?club_id=... or ?event_id=...
router.get('/', async (req, res) => {
  const { club_id, event_id } = req.query;
  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id query param is required.' });

  const owned = await assertOwnership(req, { club_id, event_id });
  if (!owned) return notFound(res, club_id ? 'Club' : 'Event');

  let query = supabaseAdmin.from('transactions').select('*').order('created_at', { ascending: false });
  query = club_id ? query.eq('club_id', club_id) : query.eq('event_id', event_id);

  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json({ transactions: data });
});

// Create: an append-only ledger entry (income or expense).
router.post('/', async (req, res) => {
  const { club_id, event_id, type, source, amount, description, related_member_id, related_participant_id } = req.body;

  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id is required.' });
  if (club_id && event_id) return res.status(400).json({ error: 'Provide only one of club_id or event_id.' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: "type must be 'income' or 'expense'." });
  if (typeof amount !== 'number' || amount < 0) return res.status(400).json({ error: 'amount must be a non-negative number.' });

  const owned = await assertOwnership(req, { club_id, event_id });
  if (!owned) return notFound(res, club_id ? 'Club' : 'Event');

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      club_id: club_id || null,
      event_id: event_id || null,
      type, source: source || 'other', amount, description,
      related_member_id, related_participant_id,
      created_by: req.user.id,
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json({ transaction: data });
});

// Void a transaction (the ONLY way to "undo" one — see append-only trigger
// in schema.sql). Optionally pass replacement fields to insert a corrected
// entry in the same call.
router.post('/:transactionId/void', async (req, res) => {
  if (!isUuid(req.params.transactionId)) return res.status(400).json({ error: 'Invalid transaction id.' });
  const { void_reason, replacement } = req.body;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', req.params.transactionId)
    .maybeSingle();
  if (fetchErr) return dbError(res, fetchErr);
  if (!existing) return notFound(res, 'Transaction');
  if (existing.is_voided) return res.status(409).json({ error: 'ALREADY_VOIDED', message: 'This transaction is already voided.' });

  const owned = await assertOwnership(req, { club_id: existing.club_id, event_id: existing.event_id });
  if (!owned) return notFound(res, 'Transaction');

  let replacementRow = null;
  if (replacement) {
    const { data: rep, error: repErr } = await supabaseAdmin
      .from('transactions')
      .insert({
        club_id: existing.club_id,
        event_id: existing.event_id,
        type: replacement.type || existing.type,
        source: replacement.source || existing.source,
        amount: replacement.amount ?? existing.amount,
        description: replacement.description ?? `Correction of ${existing.id}`,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (repErr) return dbError(res, repErr);
    replacementRow = rep;
  }

  const { data: voided, error: voidErr } = await supabaseAdmin
    .from('transactions')
    .update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      void_reason: void_reason || 'No reason given',
      replaced_by: replacementRow?.id || null,
    })
    .eq('id', req.params.transactionId)
    .select()
    .single();
  if (voidErr) return dbError(res, voidErr);

  res.json({ voided, replacement: replacementRow });
});

module.exports = router;
