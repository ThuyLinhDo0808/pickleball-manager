const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');

const router = express.Router();
const TIERS = ['vip', 'standard'];

// ---- ownership guard for :clubId ------------------------------------------
router.param('clubId', async (req, res, next, clubId) => {
  if (!isUuid(clubId)) return notFound(res, 'Club');
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .eq('host_id', req.hostId)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Club');
  req.club = data;
  next();
});

// ---- ownership guard for :memberId (must belong to req.club) --------------
router.param('memberId', async (req, res, next, memberId) => {
  if (!isUuid(memberId)) return notFound(res, 'Member');
  const { data, error } = await supabase
    .from('club_members')
    .select('*')
    .eq('id', memberId)
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Member');
  req.member = data;
  next();
});

// ---- Clubs CRUD -------------------------------------------------------------
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('host_id', req.hostId)
    .order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const { data, error } = await supabase
    .from('clubs')
    .insert({ host_id: req.hostId, name, description: description || null })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.get('/:clubId', (req, res) => res.json(req.club));

router.patch('/:clubId', async (req, res) => {
  const fields = pick(req.body, ['name', 'description']);
  const { data, error } = await supabase
    .from('clubs')
    .update(fields)
    .eq('id', req.club.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.delete('/:clubId', async (req, res) => {
  const { error } = await supabase.from('clubs').delete().eq('id', req.club.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// ---- Members CRUD -------------------------------------------------------------
router.get('/:clubId/members', async (req, res) => {
  const { data, error } = await supabase
    .from('club_members')
    .select('*')
    .eq('club_id', req.club.id)
    .order('full_name', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/:clubId/members', checkCapacity(), async (req, res) => {
  const { full_name, phone, dupr_level, member_type } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });

  let tier = req.body.tier || null;
  if (tier && !TIERS.includes(tier)) {
    return res.status(400).json({ error: 'tier must be vip or standard.' });
  }
  const nextType = member_type === 'guest' ? 'guest' : 'fixed';
  if (tier && nextType !== 'fixed') tier = null; // guests are never tiered

  const { data, error } = await supabase
    .from('club_members')
    .insert({
      club_id: req.club.id,
      full_name,
      phone: phone || null,
      dupr_level: dupr_level ?? null,
      member_type: nextType,
      tier,
      notes: req.body.notes || null,
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// Bulk import (used by "Import from Club" on the event side, or CSV-style add)
router.post('/:clubId/members/bulk', async (req, res) => {
  const rows = Array.isArray(req.body.members) ? req.body.members : [];
  if (!rows.length) return res.status(400).json({ error: 'members[] is required.' });

  const { willExceed, allowed, usage } = await limitBody(req.hostId, rows.length);
  if (willExceed) {
    return res.status(403).json({
      error: `Only ${allowed} more people fit on the ${usage.tier} plan (${usage.used}/${usage.capacity_limit} used).`,
      usage,
    });
  }

  const payload = rows.map((r) => ({
    club_id: req.club.id,
    full_name: r.full_name,
    phone: r.phone || null,
    dupr_level: r.dupr_level ?? null,
    member_type: r.member_type === 'guest' ? 'guest' : 'fixed',
    tier: TIERS.includes(r.tier) ? r.tier : null,
    notes: r.notes || null,
  }));
  const { data, error } = await supabase.from('club_members').insert(payload).select();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.patch('/:clubId/members/:memberId', async (req, res) => {
  const fields = pick(req.body, ['full_name', 'phone', 'dupr_level', 'member_type', 'is_active', 'tier', 'notes']);

  if (fields.tier && !TIERS.includes(fields.tier)) {
    return res.status(400).json({ error: 'tier must be vip or standard.' });
  }
  const effectiveType = fields.member_type || req.member.member_type;
  if (fields.tier && effectiveType !== 'fixed') {
    return res.status(400).json({ error: 'tier can only be set on fixed members.' });
  }
  if (fields.member_type === 'guest') fields.tier = null; // clear tier if downgraded to guest

  const { data, error } = await supabase
    .from('club_members')
    .update(fields)
    .eq('id', req.member.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.delete('/:clubId/members/:memberId', async (req, res) => {
  const { error } = await supabase.from('club_members').delete().eq('id', req.member.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// ---- Membership plans / registrations -----------------------------------
router.get('/:clubId/plans', async (req, res) => {
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('club_id', req.club.id)
    .order('created_at', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/:clubId/plans', async (req, res) => {
  const { name, period, price, sessions_included } = req.body;
  if (!name || !period || price == null) {
    return res.status(400).json({ error: 'name, period, and price are required.' });
  }
  if (!['month', 'quarter', 'year'].includes(period)) {
    return res.status(400).json({ error: 'period must be month, quarter, or year.' });
  }
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({ club_id: req.club.id, name, period, price, sessions_included: sessions_included || 0 })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.post('/:clubId/members/:memberId/memberships', async (req, res) => {
  const { plan_id, period_label, starts_on, ends_on, amount, status } = req.body;
  if (!plan_id || !period_label || !starts_on || !ends_on || amount == null) {
    return res.status(400).json({ error: 'plan_id, period_label, starts_on, ends_on, amount are required.' });
  }
  const { data, error } = await supabase
    .from('memberships')
    .insert({
      club_member_id: req.member.id,
      plan_id,
      period_label,
      starts_on,
      ends_on,
      amount,
      status: status && ['pending', 'paid', 'overdue'].includes(status) ? status : 'pending',
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.get('/:clubId/members/:memberId/memberships', async (req, res) => {
  const { data, error } = await supabase
    .from('v_membership_status')
    .select('*')
    .eq('club_member_id', req.member.id)
    .order('starts_on', { ascending: false });
  if (error) return dbError(res, error);
  res.json(data);
});

router.patch('/:clubId/memberships/:membershipId', async (req, res) => {
  if (!isUuid(req.params.membershipId)) return notFound(res, 'Membership');
  const fields = pick(req.body, ['status', 'period_label', 'starts_on', 'ends_on', 'amount']);
  const { data, error } = await supabase
    .from('memberships')
    .update(fields)
    .eq('id', req.params.membershipId)
    .select()
    .single();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Membership');
  res.json(data);
});

// ---- Rankings / fund ------------------------------------------------------
router.get('/:clubId/rankings', async (req, res) => {
  const view = req.query.period === 'monthly' ? 'v_club_rankings_monthly' : 'v_club_rankings_all_time';
  const { data, error } = await supabase.from(view).select('*').eq('club_id', req.club.id);
  if (error) return dbError(res, error);
  res.json(data);
});

router.get('/:clubId/fund', async (req, res) => {
  const { data: balanceRow, error: balErr } = await supabase
    .from('v_club_fund_balance')
    .select('*')
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (balErr) return dbError(res, balErr);

  const { data: txns, error: txnErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner_type', 'club')
    .eq('club_id', req.club.id)
    .order('occurred_on', { ascending: false });
  if (txnErr) return dbError(res, txnErr);

  res.json({ balance: balanceRow?.balance || 0, transactions: txns });
});

// ---- Club events (schedule list scoped to a club) -------------------------
router.get('/:clubId/events', async (req, res) => {
  const { data, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('club_id', req.club.id)
    .order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

module.exports = router;
