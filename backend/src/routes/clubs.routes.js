const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { checkCapacity, getUsage, limitBody } = require('../middleware/checkCapacity');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');

const router = express.Router();
router.use(requireAuth);

// Every route with :clubId first proves the club belongs to the caller.
// This closes the hole where knowing another host's club UUID was enough.
router.param('clubId', async (req, res, next, clubId) => {
  if (!isUuid(clubId)) return res.status(400).json({ error: 'Invalid club id.' });
  const { data, error } = await supabaseAdmin
    .from('clubs').select('*').eq('id', clubId).eq('host_id', req.user.id).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Club');
  req.club = data;
  next();
});

const MEMBER_TYPES = ['fixed', 'guest'];
const MEMBER_STATUSES = ['active', 'inactive', 'removed'];

function validDupr(v) {
  if (v === null || v === undefined || v === '') return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 9.99;
}

// ---- Clubs ---------------------------------------------------------------

// List the host's clubs with live counts: active members and upcoming events.
// The app passes its own local date as ?today=YYYY-MM-DD so "upcoming" respects the host's timezone.
router.get('/', async (req, res) => {
  const { data: clubs, error } = await supabaseAdmin
    .from('clubs').select('*').eq('host_id', req.user.id).order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  if (!clubs.length) return res.json({ clubs: [] });

  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today || '') ? req.query.today : new Date().toISOString().slice(0, 10);
  const ids = clubs.map((c) => c.id);

  const [members, events] = await Promise.all([
    supabaseAdmin.from('club_members').select('club_id').in('club_id', ids).eq('status', 'active'),
    supabaseAdmin.from('events').select('club_id').in('club_id', ids).gte('event_date', today).in('status', ['draft', 'open', 'closed']),
  ]);
  if (members.error) return dbError(res, members.error);
  if (events.error) return dbError(res, events.error);

  const tally = (rows) => rows.reduce((acc, r) => { acc[r.club_id] = (acc[r.club_id] || 0) + 1; return acc; }, {});
  const memberCounts = tally(members.data);
  const eventCounts = tally(events.data);

  res.json({
    clubs: clubs.map((c) => ({ ...c, member_count: memberCounts[c.id] || 0, upcoming_events: eventCounts[c.id] || 0 })),
  });
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const fee = req.body.monthly_fee_default === undefined ? 0 : Number(req.body.monthly_fee_default);
  if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'monthly_fee_default must be 0 or more.' });

  const { data, error } = await supabaseAdmin
    .from('clubs')
    .insert({ host_id: req.user.id, name, description: req.body.description || null, monthly_fee_default: fee })
    .select().single();
  if (error) return dbError(res, error);
  res.status(201).json({ club: data });
});

router.get('/:clubId', (req, res) => res.json({ club: req.club }));

router.patch('/:clubId', async (req, res) => {
  const fields = pick(req.body, ['name', 'description', 'monthly_fee_default', 'is_active']);
  if (fields.name !== undefined && !String(fields.name).trim()) return res.status(400).json({ error: 'name cannot be empty.' });
  const { data, error } = await supabaseAdmin
    .from('clubs').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', req.club.id).select().single();
  if (error) return dbError(res, error);
  res.json({ club: data });
});

// ---- Members ---------------------------------------------------------------

router.get('/:clubId/members', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('club_members').select('*').eq('club_id', req.club.id).order('display_name', { ascending: true });
  if (error) return dbError(res, error);
  res.json({ members: data });
});

router.post('/:clubId/members', checkCapacity, async (req, res) => {
  const display_name = (req.body.display_name || '').trim();
  if (!display_name) return res.status(400).json({ error: 'display_name is required.' });
  if (!validDupr(req.body.dupr_level)) return res.status(400).json({ error: 'dupr_level must be between 0 and 9.99.' });
  const member_type = req.body.member_type || 'fixed';
  if (!MEMBER_TYPES.includes(member_type)) return res.status(400).json({ error: 'member_type must be fixed or guest.' });

  const { data, error } = await supabaseAdmin
    .from('club_members')
    .insert({
      club_id: req.club.id,
      display_name,
      phone: req.body.phone || null,
      dupr_level: req.body.dupr_level === '' ? null : req.body.dupr_level ?? null,
      member_type,
    })
    .select().single();
  if (error) return dbError(res, error);
  res.status(201).json({ member: data, capacity: req.capacity });
});

router.patch('/:clubId/members/:memberId', async (req, res) => {
  if (!isUuid(req.params.memberId)) return res.status(400).json({ error: 'Invalid member id.' });

  const { data: existing, error: findErr } = await supabaseAdmin
    .from('club_members').select('*').eq('id', req.params.memberId).eq('club_id', req.club.id).maybeSingle();
  if (findErr) return dbError(res, findErr);
  if (!existing) return notFound(res, 'Member');

  const fields = pick(req.body, ['display_name', 'phone', 'dupr_level', 'member_type', 'status']);
  if (fields.display_name !== undefined && !String(fields.display_name).trim()) return res.status(400).json({ error: 'display_name cannot be empty.' });
  if (!validDupr(fields.dupr_level)) return res.status(400).json({ error: 'dupr_level must be between 0 and 9.99.' });
  if (fields.member_type !== undefined && !MEMBER_TYPES.includes(fields.member_type)) return res.status(400).json({ error: 'member_type must be fixed or guest.' });
  if (fields.status !== undefined && !MEMBER_STATUSES.includes(fields.status)) return res.status(400).json({ error: 'Invalid status.' });

  if (fields.status !== undefined) {
    // Bringing someone back to 'active' takes a seat, so it is capacity-checked too.
    if (fields.status === 'active' && existing.status !== 'active') {
      const usage = await getUsage(req.user.id);
      if (usage.current_usage >= usage.max_capacity) return res.status(403).json(limitBody(usage));
    }
    fields.removed_at = fields.status === 'removed' ? new Date().toISOString() : null;
  }

  const { data, error } = await supabaseAdmin
    .from('club_members').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', existing.id).select().single();
  if (error) return dbError(res, error);
  res.json({ member: data });
});

// ---- Rankings & fund -------------------------------------------------------

router.get('/:clubId/rankings/all-time', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_club_rankings_all_time').select('*').eq('club_id', req.club.id)
    .order('wins', { ascending: false }).order('win_rate_pct', { ascending: false });
  if (error) return dbError(res, error);
  res.json({ rankings: data });
});

router.get('/:clubId/rankings/monthly', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_club_rankings_monthly').select('*').eq('club_id', req.club.id)
    .order('month', { ascending: false }).order('wins', { ascending: false });
  if (error) return dbError(res, error);
  res.json({ rankings: data });
});

router.get('/:clubId/fund-balance', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_club_fund_balance').select('*').eq('club_id', req.club.id).maybeSingle();
  if (error) return dbError(res, error);
  res.json({ balance: data || { club_id: req.club.id, balance: 0, total_income: 0, total_expense: 0 } });
});

module.exports = router;
