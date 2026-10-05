const crypto = require('crypto');
const express = require('express');
const { assertCanCreateClub } = require('../services/plan');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { todayYmd, periodRange, summarize, syncMembershipTxn } = require('../services/memberships');
const { itemMetrics } = require('../services/inventory');
const birthdays = require('../services/birthdays');
const { guestsReady, discountReady, guestStats, PERKS } = require('../services/guests');
const { extrasReady, cleanExtras } = require('../services/memberExtras');
const { phoneLinkReady } = require('../services/phoneLink');
const { completeFinished } = require('../services/eventStatus');
const { setAttendance } = require('../services/attendance');
const { SPORTS, sportReady, cleanLevel } = require('../services/sport');
const { clubAccess, coAdminClubs, ownerOnly } = require('../services/clubAccess');
const {
  PERIODS: PERIODS_STATS,
  DEFAULT_MIN_MATCHES,
  localDate,
  periodBounds,
  aggregate,
  awards,
  winnerTeam,
  isScored,
} = require('../services/stats');

const router = express.Router();
const TIERS = ['vip', 'standard'];
const GENDERS = ['male', 'female'];
const FLAGS = ['unpaid', 'late', 'attitude'];
const PERIODS = ['month', 'quarter', 'year'];
const PAY_STATUSES = ['pending', 'paid', 'overdue'];

function cleanGender(v) {
  return GENDERS.includes(v) ? v : null;
}

function cleanBirthYear(v) {
  const n = Number(v);
  return v !== '' && v != null && Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}

// Dates as YYYY-MM-DD (birth date, club join date); '' / null clears.
function cleanDate(v, field) {
  if (v === '' || v == null) return null;
  const d = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw Object.assign(new Error(`${field} must be YYYY-MM-DD.`), { status: 400 });
  return d;
}

// birth_date / joined_on from a request body; birth_year follows the birth date.
function memberDates(body) {
  const out = {};
  if ('birth_date' in body) {
    out.birth_date = cleanDate(body.birth_date, 'birth_date');
    if (out.birth_date) out.birth_year = Number(out.birth_date.slice(0, 4));
  }
  if ('joined_on' in body) out.joined_on = cleanDate(body.joined_on, 'joined_on');
  return out;
}

// ---- access guard for :clubId: the owner, or a co-admin of this club -------
// A co-admin then acts as the owner (req.hostId = owner) for everything in this
// router, so fund entries, capacity limits etc. stay the owner's; owner-only
// routes are wrapped in `ownerOnly`.
router.param('clubId', async (req, res, next, clubId) => {
  try {
    const access = await clubAccess(req, clubId);
    if (!access) return notFound(res, 'Club');
    req.club = access.club;
    if (access.role === 'co_admin') {
      req.hostId = access.club.host_id;
      req.coAdmin = true;
    }
    next();
  } catch (err) {
    dbError(res, err);
  }
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

// ---- ownership guard for :planId (must belong to req.club) ----------------
router.param('planId', async (req, res, next, planId) => {
  if (!isUuid(planId)) return notFound(res, 'Plan');
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', planId)
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Plan');
  req.plan = data;
  next();
});

// ---- ownership guard for :membershipId (its member must be in req.club) ---
router.param('membershipId', async (req, res, next, membershipId) => {
  if (!isUuid(membershipId)) return notFound(res, 'Membership');
  const { data, error } = await supabase
    .from('memberships')
    .select('*, club_members!inner(club_id, full_name)')
    .eq('id', membershipId)
    .eq('club_members.club_id', req.club.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Membership');
  const { club_members: owner, ...membership } = data;
  req.membership = membership;
  req.membershipOwnerName = owner.full_name;
  next();
});

// ---- Clubs CRUD -------------------------------------------------------------
// My clubs (role 'owner') followed by clubs shared with me as co-admin.
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('host_id', req.hostId)
    .order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  try {
    const shared = await coAdminClubs(req);
    res.json([...data.map((c) => ({ ...c, role: 'owner' })), ...shared.filter((c) => c.host_id !== req.hostId)]);
  } catch (err) {
    dbError(res, err);
  }
});

router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  // The sport is picked once, when the club is created.
  const sport = req.body.sport || 'pickleball';
  if (!SPORTS.includes(sport)) return res.status(400).json({ error: `sport must be one of ${SPORTS.join(', ')}.` });
  if (sport !== 'pickleball' && !(await sportReady())) return res.status(409).json({ error: 'Run migration 20261012090000_multi_sport_badminton.sql first.' });
  try {
    await assertCanCreateClub(req.hostId);
  } catch (err) {
    return res.status(err.status).json({ error: err.message, code: err.code, plan: err.plan });
  }
  const { data, error } = await supabase
    .from('clubs')
    .insert({ host_id: req.hostId, name, description: description || null, ...(sport !== 'pickleball' ? { sport } : {}) })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.get('/:clubId', (req, res) => res.json({ ...req.club, role: req.coAdmin ? 'co_admin' : 'owner' }));

router.patch('/:clubId', async (req, res) => {
  const fields = pick(req.body, ['name', 'description', 'allow_join', 'join_note', 'bank_code', 'bank_account', 'bank_holder', 'guest_vip_discount']);
  if ('guest_vip_discount' in fields && !(await guestsReady())) {
    return res.status(409).json({ error: 'Run migration 20261009090000_guest_perks_survey.sql first.' });
  }
  if ('guest_vip_discount' in fields) {
    const d = Number(fields.guest_vip_discount || 0);
    if (!Number.isInteger(d) || d < 0 || d > 100000000) return res.status(400).json({ error: 'VIP discount must be a whole number of VND, 0 or more.' });
    fields.guest_vip_discount = d;
  }
  for (const k of ['join_note', 'bank_code', 'bank_account', 'bank_holder']) {
    if (k in fields) fields[k] = String(fields[k] ?? '').trim() || null;
  }
  if (fields.bank_code) fields.bank_code = fields.bank_code.toUpperCase();
  if (fields.bank_account && !/^[0-9A-Za-z]{4,30}$/.test(fields.bank_account)) {
    return res.status(400).json({ error: 'bank_account should be 4-30 letters/digits, no spaces.' });
  }
  if ('allow_join' in fields) fields.allow_join = !!fields.allow_join;
  const { data, error } = await supabase
    .from('clubs')
    .update(fields)
    .eq('id', req.club.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

// What deleting the club would remove (shown to the Host before they confirm).
router.get('/:clubId/delete-preview', ownerOnly, async (req, res) => {
  const count = (table, col = 'club_id') =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, req.club.id).then((r) => r.count || 0);
  try {
    const [members, events, tournaments, transactions] = await Promise.all([
      count('club_members'),
      count('events'),
      count('tournaments'),
      count('transactions'),
    ]);
    res.json({ name: req.club.name, members, events, tournaments, transactions });
  } catch (err) {
    dbError(res, err);
  }
});

// Delete a club with everything in it. Tournaments go first (their team line-ups point at
// members, which would otherwise clash while cascading), then the club's sessions (they
// would otherwise survive as club-less "Xé Vé" events), then the club itself.
router.delete('/:clubId', ownerOnly, async (req, res) => {
  if (String(req.query.confirm || '').trim() !== req.club.name.trim()) {
    return res.status(400).json({ error: 'Type the club name to confirm.', code: 'confirm_name' });
  }
  for (const table of ['tournaments', 'events']) {
    const { error } = await supabase.from(table).delete().eq('club_id', req.club.id);
    if (error) return dbError(res, error);
  }
  const { error } = await supabase.from('clubs').delete().eq('id', req.club.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// ---- Members CRUD -------------------------------------------------------------
router.get('/:clubId/members', async (req, res) => {
  const { data, error } = await supabase
    .from('club_members')
    .select('*, users(email)')
    .eq('club_id', req.club.id)
    .order('full_name', { ascending: true });
  if (error) return dbError(res, error);

  // Attach pass status (sessions left, debt) so the table needs one request.
  const ids = data.map((m) => m.id);
  const { data: passes, error: pErr } = ids.length
    ? await supabase.from('v_membership_status').select('*').in('club_member_id', ids)
    : { data: [] };
  if (pErr) return dbError(res, pErr);
  const today = todayYmd();
  // Guests: sessions played and cancellations after a paid / confirmed place.
  let stats = {};
  try {
    stats = await guestStats(data.filter((m) => m.member_type === 'guest').map((m) => m.id));
  } catch (err) {
    return dbError(res, err);
  }
  res.json(
    data.map(({ users, ...m }) => ({
      ...m,
      account_email: users?.email || null,
      ...summarize(passes.filter((p) => p.club_member_id === m.id), today),
      ...(m.member_type === 'guest' ? { guest_stats: stats[m.id] || { played: 0, last_played: null, paid_cancels: 0, last_cancel: null } } : {}),
    }))
  );
});

router.post('/:clubId/members', checkCapacity(), async (req, res) => {
  const { full_name, phone, member_type } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });
  let dupr_level;
  try {
    dupr_level = cleanLevel(req.body.dupr_level, req.club.sport); // badminton: step 1-6
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let tier = req.body.tier || null;
  if (tier && !TIERS.includes(tier)) {
    return res.status(400).json({ error: 'tier must be vip or standard.' });
  }
  const nextType = member_type === 'guest' ? 'guest' : 'fixed';
  if (tier && nextType !== 'fixed') tier = null; // guests are never tiered
  let dates;
  let extras;
  try {
    dates = memberDates(req.body);
    if (!dates.joined_on) delete dates.joined_on; // defaults to today
    extras = (await extrasReady()) ? cleanExtras(req.body) : {};
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const { data, error } = await supabase
    .from('club_members')
    .insert({
      club_id: req.club.id,
      full_name,
      phone: phone || null,
      dupr_level: dupr_level ?? null,
      member_type: nextType,
      tier,
      gender: cleanGender(req.body.gender),
      birth_year: cleanBirthYear(req.body.birth_year),
      notes: req.body.notes || null,
      ...dates,
      ...extras,
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
    gender: cleanGender(r.gender),
    birth_year: cleanBirthYear(r.birth_year),
    notes: r.notes || null,
  }));
  const { data, error } = await supabase.from('club_members').insert(payload).select();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.patch('/:clubId/members/:memberId', async (req, res) => {
  const fields = pick(req.body, ['full_name', 'phone', 'dupr_level', 'member_type', 'is_active', 'tier', 'notes', 'gender', 'birth_year', 'flags', 'guest_perk', 'guest_discount_pct']);
  if ('notes' in fields) fields.notes = String(fields.notes ?? '').trim().slice(0, 2000) || null;
  if ('dupr_level' in fields) {
    try {
      fields.dupr_level = cleanLevel(fields.dupr_level, req.club.sport);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  if ('guest_perk' in fields && !(await guestsReady())) delete fields.guest_perk; // migration not run yet
  if ('guest_perk' in fields) {
    fields.guest_perk = fields.guest_perk || null;
    if (fields.guest_perk && !PERKS.includes(fields.guest_perk)) return res.status(400).json({ error: 'Guests can only get the priority perk.', code: 'perk' });
    if (fields.guest_perk && (fields.member_type || req.member.member_type) !== 'guest') {
      return res.status(400).json({ error: 'Perks are for guests only.' });
    }
  }
  // Priority guests: % off the ticket (0-100). Dropped with the perk.
  if ('guest_discount_pct' in fields && !(await discountReady())) delete fields.guest_discount_pct;
  if ('guest_discount_pct' in fields) {
    const raw = fields.guest_discount_pct;
    const pct = raw === '' || raw == null ? null : Number(raw);
    if (pct != null && !(Number.isInteger(pct) && pct >= 0 && pct <= 100)) {
      return res.status(400).json({ error: 'Discount must be a whole percent from 0 to 100.', code: 'discount' });
    }
    const perk = 'guest_perk' in fields ? fields.guest_perk : req.member.guest_perk;
    fields.guest_discount_pct = perk ? pct || null : null;
  } else if ('guest_perk' in fields && !fields.guest_perk && (await discountReady())) {
    fields.guest_discount_pct = null;
  }
  if ('flags' in fields) fields.flags = (Array.isArray(fields.flags) ? fields.flags : []).filter((f) => FLAGS.includes(f));
  if ('gender' in fields) fields.gender = cleanGender(fields.gender);
  if ('birth_year' in fields) fields.birth_year = cleanBirthYear(fields.birth_year);
  try {
    Object.assign(fields, memberDates(req.body));
    if (await extrasReady()) Object.assign(fields, cleanExtras(req.body));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (fields.tier && !TIERS.includes(fields.tier)) {
    return res.status(400).json({ error: 'tier must be vip or standard.' });
  }
  const effectiveType = fields.member_type || req.member.member_type;
  if (fields.tier && effectiveType !== 'fixed') {
    return res.status(400).json({ error: 'tier can only be set on fixed members.' });
  }
  if (fields.member_type === 'guest') fields.tier = null; // clear tier if downgraded to guest
  if (fields.member_type === 'fixed' && req.member.guest_perk) fields.guest_perk = null; // perks are for guests
  if (req.body.unlink_account === true) {
    fields.user_id = null; // detach the player's login
    fields.account_verified = false;
    if (req.member.user_id && (await phoneLinkReady())) fields.unlinked_user_id = req.member.user_id; // don't auto-link it again
  }
  // Host confirms the linked player account really is this member.
  if (req.body.account_verified === true && req.member.user_id) fields.account_verified = true;

  const { data, error } = await supabase
    .from('club_members')
    .update(fields)
    .eq('id', req.member.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Waiting list (DS chờ): accounts linked to a member by phone, join requests from the
// event page, and guests who asked to join the fixed team in the after-session survey.
router.get('/:clubId/member-requests', async (req, res) => {
  const ready = await guestsReady();
  const { data, error } = await supabase
    .from('club_members')
    .select(
      `id, full_name, phone, gender, birth_year, birth_date, dupr_level, member_type, join_requested, account_verified, user_id, created_at, users(email)${ready ? ', join_requested_at, join_note' : ''}`
    )
    .eq('club_id', req.club.id)
    .or('and(account_verified.eq.false,user_id.not.is.null),join_requested.eq.true')
    .order('created_at', { ascending: true });
  if (error) return dbError(res, error);
  const { data: profiles } = data.length
    ? await supabase.from('player_profiles').select('user_id, full_name, phone').in('user_id', data.map((m) => m.user_id))
    : { data: [] };
  res.json(
    data.map(({ users, ...m }) => {
      const p = (profiles || []).find((x) => x.user_id === m.user_id);
      // survey = guest asked in the after-session survey; request = "I'm a member" with no match; link = phone matched
      const source = m.join_requested_at ? 'survey' : m.join_requested ? 'request' : 'link';
      return { ...m, source, account_email: users?.email || null, account_name: p?.full_name || null, account_phone: p?.phone || null };
    })
  );
});

// Approve: the Host also picks the membership type (fixed by default for join requests).
router.post('/:clubId/members/:memberId/approve', async (req, res) => {
  const m = req.member;
  if (!m.user_id && !m.join_requested) return res.status(400).json({ error: 'No player account is linked to this member.' });
  const patch = { join_requested: false };
  if (m.user_id) patch.account_verified = true;
  if (m.join_requested) {
    const type = req.body?.member_type === 'guest' ? 'guest' : 'fixed';
    patch.member_type = type;
    patch.tier = type === 'fixed' && TIERS.includes(req.body?.tier) ? req.body.tier : null;
    if (type === 'fixed') {
      if (m.guest_perk) patch.guest_perk = null;
      if (m.member_type !== 'fixed' || !m.joined_on) patch.joined_on = `${todayYmd().slice(0, 7)}-01`; // joined the fixed team now
    }
  }
  const { data, error } = await supabase
    .from('club_members')
    .update(patch)
    .eq('id', req.member.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Not our member: a new join request is removed; a link to an existing member is undone.
router.post('/:clubId/members/:memberId/reject', async (req, res) => {
  const m = req.member;
  // A guest who asked to join the fixed team stays a guest; only the request goes.
  if (m.join_requested && m.member_type === 'guest') {
    const { error } = await supabase.from('club_members').update({ join_requested: false }).eq('id', m.id);
    if (error) return dbError(res, error);
    return res.json({ declined: true });
  }
  if (m.account_verified) return res.status(400).json({ error: 'This account is already verified; unlink it instead.' });
  if (m.join_requested) {
    const { error } = await supabase.from('club_members').delete().eq('id', m.id);
    if (error) return dbError(res, error);
    return res.json({ removed: true });
  }
  const unlink = { user_id: null, account_verified: false };
  if (m.user_id && (await phoneLinkReady())) unlink.unlinked_user_id = m.user_id; // don't auto-link it again
  const { error } = await supabase.from('club_members').update(unlink).eq('id', m.id);
  if (error) return dbError(res, error);
  res.json({ unlinked: true });
});

router.delete('/:clubId/members/:memberId', async (req, res) => {
  const { error } = await supabase.from('club_members').delete().eq('id', req.member.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// Change history (SCD Type 2, written by DB triggers): member status/tier/type/DUPR,
// membership payment status, and the linked player's own DUPR.
router.get('/:clubId/members/:memberId/history', async (req, res) => {
  const { data: ms, error: mErr } = await supabase.from('memberships').select('id, period_label').eq('club_member_id', req.member.id);
  if (mErr) return dbError(res, mErr);
  const filters = [`and(entity.eq.club_member,entity_id.eq.${req.member.id})`];
  if (ms.length) filters.push(`and(entity.eq.membership,entity_id.in.(${ms.map((m) => m.id).join(',')}))`);
  if (req.member.user_id) filters.push(`and(entity.eq.player,entity_id.eq.${req.member.user_id})`);
  const { data, error } = await supabase
    .from('change_history')
    .select('entity, entity_id, attribute, value, valid_from, valid_to')
    .or(filters.join(','))
    .order('valid_from', { ascending: false })
    .limit(500);
  if (error) return dbError(res, error);
  const label = new Map(ms.map((m) => [m.id, m.period_label]));
  res.json(data.map((h) => ({ ...h, period_label: h.entity === 'membership' ? label.get(h.entity_id) || null : null })));
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
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: 'period must be month, quarter, or year.' });
  }
  if (!(Number(price) >= 0) || !(Number(sessions_included || 0) >= 0)) {
    return res.status(400).json({ error: 'price and sessions_included must be >= 0.' });
  }
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({ club_id: req.club.id, name, period, price: Number(price), sessions_included: Number(sessions_included || 0) })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// Edit a plan. Periods already registered keep their dates and amounts; the new
// period / price apply to the next registrations.
router.patch('/:clubId/plans/:planId', async (req, res) => {
  const fields = pick(req.body, ['name', 'period', 'price', 'sessions_included', 'is_active']);
  if ('name' in fields) {
    fields.name = String(fields.name || '').trim().slice(0, 120);
    if (!fields.name) return res.status(400).json({ error: 'name is required.' });
  }
  if ('period' in fields && !PERIODS.includes(fields.period)) {
    return res.status(400).json({ error: 'period must be month, quarter, or year.' });
  }
  for (const k of ['price', 'sessions_included']) {
    if (k in fields) {
      const n = Number(fields[k] === '' || fields[k] == null ? 0 : fields[k]);
      if (!(Number.isFinite(n) && n >= 0)) return res.status(400).json({ error: 'price and sessions_included must be >= 0.' });
      fields[k] = k === 'sessions_included' ? Math.floor(n) : n;
    }
  }
  if ('is_active' in fields) fields.is_active = !!fields.is_active;
  const { data, error } = await supabase.from('membership_plans').update(fields).eq('id', req.plan.id).select().single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Register a member for `count` consecutive periods of a plan, starting at `start_month` (YYYY-MM).
// e.g. monthly plan, start 2026-08, count 3 -> Aug, Sep, Oct.
router.post('/:clubId/members/:memberId/memberships', async (req, res) => {
  const { plan_id, start_month, status } = req.body;
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 12);
  if (!isUuid(plan_id) || !/^\d{4}-\d{2}$/.test(start_month || '')) {
    return res.status(400).json({ error: 'plan_id and start_month (YYYY-MM) are required.' });
  }
  const { data: plan, error: planErr } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', plan_id)
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (planErr) return dbError(res, planErr);
  if (!plan) return notFound(res, 'Plan');
  // Guests buy single tickets; plans are for the fixed team.
  if (req.member.member_type !== 'fixed') {
    return res.status(400).json({ error: 'Membership plans are for fixed members only.', code: 'fixed_only' });
  }

  const amount = req.body.amount != null && req.body.amount !== '' ? Number(req.body.amount) : Number(plan.price);
  const rows = Array.from({ length: count }, (_, i) => ({
    club_member_id: req.member.id,
    plan_id: plan.id,
    ...periodRange(plan.period, start_month, i),
    amount,
    status: PAY_STATUSES.includes(status) ? status : 'pending',
  }));
  const { data, error } = await supabase.from('memberships').insert(rows).select();
  if (error) return dbError(res, error);

  try {
    const synced = [];
    for (const m of data) {
      synced.push(await syncMembershipTxn({ membership: m, hostId: req.hostId, clubId: req.club.id, memberName: req.member.full_name }));
    }
    res.status(201).json(synced);
  } catch (err) {
    dbError(res, err);
  }
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
  const fields = pick(req.body, ['status', 'period_label', 'starts_on', 'ends_on', 'amount']);
  if (fields.status && !PAY_STATUSES.includes(fields.status)) {
    return res.status(400).json({ error: 'status must be pending, paid, or overdue.' });
  }
  // A paid membership's amount is already in the fund ledger; unpay it first to change the amount.
  const staysPaid = (fields.status || req.membership.status) === 'paid' && req.membership.transaction_id;
  if ('amount' in fields && staysPaid && Number(fields.amount) !== Number(req.membership.amount)) {
    return res.status(400).json({ error: 'Mark the membership unpaid before changing its amount.' });
  }
  const { data, error } = await supabase
    .from('memberships')
    .update(fields)
    .eq('id', req.membership.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  try {
    res.json(await syncMembershipTxn({ membership: data, hostId: req.hostId, clubId: req.club.id, memberName: req.membershipOwnerName }));
  } catch (err) {
    dbError(res, err);
  }
});

router.delete('/:clubId/memberships/:membershipId', async (req, res) => {
  try {
    await syncMembershipTxn({
      membership: { ...req.membership, status: 'pending' }, // voids the fund income, if any
      hostId: req.hostId,
      clubId: req.club.id,
      memberName: req.membershipOwnerName,
    });
  } catch (err) {
    return dbError(res, err);
  }
  const { error } = await supabase.from('memberships').delete().eq('id', req.membership.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// Manual session adjustments (a session played outside a tracked event, or a correction).
router.post('/:clubId/memberships/:membershipId/sessions', async (req, res) => {
  const { error } = await supabase.from('membership_sessions').insert({ membership_id: req.membership.id, event_id: null });
  if (error) return dbError(res, error);
  res.status(201).json({ ok: true });
});

router.delete('/:clubId/memberships/:membershipId/sessions/last', async (req, res) => {
  const { data: last, error } = await supabase
    .from('membership_sessions')
    .select('id')
    .eq('membership_id', req.membership.id)
    .order('used_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!last) return res.status(400).json({ error: 'No sessions to undo.' });
  const { error: delErr } = await supabase.from('membership_sessions').delete().eq('id', last.id);
  if (delErr) return dbError(res, delErr);
  res.status(204).end();
});

// ---- Stats: rankings + awards for a day / month / quarter / year / all time --
// Supabase caps a response at 1000 rows, so page through.
async function fetchAll(build) {
  const size = 1000;
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}

function shiftDay(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

router.get('/:clubId/stats', async (req, res) => {
  const period = PERIODS_STATS.includes(req.query.period) ? req.query.period : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayYmd();
  const minMatches = Math.min(Math.max(parseInt(req.query.min_matches, 10) || DEFAULT_MIN_MATCHES, 1), 50);
  const bounds = periodBounds(period, date);
  const inRange = (ymd) => !bounds || (ymd >= bounds.from && ymd <= bounds.to);

  // Two leaderboards: the club community (fixed members) and the guests. No group = all.
  const group = ['club', 'guest'].includes(req.query.group) ? req.query.group : null;
  try {
    const allMembers = await fetchAll(() =>
      supabase.from('club_members').select('id, full_name, gender, member_type').eq('club_id', req.club.id).order('id')
    );
    const members = allMembers.filter((m) => !group || (group === 'club' ? m.member_type === 'fixed' : m.member_type !== 'fixed'));
    const linkGuests = await guestsReady(); // guests in sessions are linked by guest_member_id
    const personOf = (p) => p?.source_club_member_id || (linkGuests ? p?.guest_member_id : null) || null;

    // Pad the UTC window by a day each side, then filter exactly on the local date.
    const matches = (
      await fetchAll(() => {
        let q = supabase
          .from('matches')
          .select('id, played_at, team1_score, team2_score, match_players(team, club_member_id)')
          .eq('club_id', req.club.id)
          .order('id');
        if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
        return q;
      })
    ).filter((m) => inRange(localDate(m.played_at)));

    // Matches recorded inside this club's sessions (by the Host or staff) count too:
    // their players are event participants, linked back to club members.
    const sessionMatches = (
      await fetchAll(() => {
        let q = supabase
          .from('matches')
          .select(`id, played_at, team1_score, team2_score, events!inner(club_id), match_players(team, event_participants(source_club_member_id${linkGuests ? ', guest_member_id' : ''}))`)
          .eq('events.club_id', req.club.id)
          .order('id');
        if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
        return q;
      })
    )
      .filter((m) => inRange(localDate(m.played_at)))
      .map((m) => ({
        ...m,
        match_players: m.match_players.map((p) => ({ team: p.team, club_member_id: personOf(p.event_participants) })),
      }));
    matches.push(...sessionMatches);

    const checkIns = await fetchAll(() => {
      let q = supabase
        .from('event_participants')
        .select(`source_club_member_id${linkGuests ? ', guest_member_id' : ''}, event_id, events!inner(club_id, event_date)`)
        .eq('status', 'checked_in')
        .eq('events.club_id', req.club.id)
        .order('id');
      if (bounds) q = q.gte('events.event_date', bounds.from).lte('events.event_date', bounds.to);
      return q;
    });
    const attendance = {};
    const seen = new Set();
    for (const c of checkIns) {
      const who = personOf(c);
      if (!who) continue;
      const key = `${who}:${c.event_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attendance[who] = (attendance[who] || 0) + 1;
    }

    const rankings = aggregate(matches, members);
    const ids = new Set(members.map((m) => m.id));
    res.json({
      period,
      date,
      group,
      range: bounds,
      // matches with a score that someone of this leaderboard played
      match_count: matches.filter((m) => isScored(m) && m.match_players.some((p) => ids.has(p.club_member_id))).length,
      rankings,
      awards: awards(rankings, attendance, members, minMatches),
    });
  } catch (err) {
    dbError(res, err);
  }
});

// ---- Player self-service: join link + payments to confirm -------------------
router.post('/:clubId/join-token/rotate', async (req, res) => {
  const { data, error } = await supabase
    .from('clubs')
    .update({ join_token: crypto.randomUUID() })
    .eq('id', req.club.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Memberships players requested themselves and haven't been marked paid, grouped by transfer note.
router.get('/:clubId/pending-payments', async (req, res) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, payment_ref, period_label, amount, status, created_at, club_members!inner(id, full_name, phone, club_id), membership_plans(name)')
    .eq('club_members.club_id', req.club.id)
    .eq('requested_by_player', true)
    .neq('status', 'paid')
    .order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  const groups = new Map();
  for (const m of data) {
    const g = groups.get(m.payment_ref) || {
      ref: m.payment_ref,
      member_id: m.club_members.id,
      full_name: m.club_members.full_name,
      phone: m.club_members.phone,
      plan_name: m.membership_plans?.name || null,
      periods: [],
      total: 0,
      created_at: m.created_at,
    };
    g.periods.push(m.period_label);
    g.total += Number(m.amount);
    groups.set(m.payment_ref, g);
  }
  res.json([...groups.values()]);
});

// "I received the transfer": mark every period in the request paid (writes club-fund income).
router.post('/:clubId/pending-payments/:ref/confirm', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('memberships')
    .select('*, club_members!inner(club_id, full_name)')
    .eq('payment_ref', req.params.ref)
    .eq('club_members.club_id', req.club.id);
  if (error) return dbError(res, error);
  if (!rows.length) return notFound(res, 'Payment');
  try {
    for (const { club_members: owner, ...m } of rows) {
      if (m.status === 'paid') continue;
      const { data: updated, error: uErr } = await supabase.from('memberships').update({ status: 'paid' }).eq('id', m.id).select().single();
      if (uErr) throw uErr;
      await syncMembershipTxn({ membership: updated, hostId: req.hostId, clubId: req.club.id, memberName: owner.full_name });
    }
    // Paying a membership the Host confirmed also confirms the player's account is this member.
    await supabase.from('club_members').update({ account_verified: true }).eq('id', rows[0].club_member_id).not('user_id', 'is', null);
    res.json({ ok: true, confirmed: rows.length });
  } catch (err) {
    dbError(res, err);
  }
});

// ---- Inventory (balls & supplies) -------------------------------------------
router.param('itemId', async (req, res, next, itemId) => {
  if (!isUuid(itemId)) return notFound(res, 'Item');
  const { data, error } = await supabase.from('inventory_items').select('*').eq('id', itemId).eq('club_id', req.club.id).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Item');
  req.item = data;
  next();
});

async function inventoryFor(clubId) {
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('*, inventory_moves(*)')
    .eq('club_id', clubId)
    .order('created_at');
  if (error) throw error;
  return items.map(({ inventory_moves: moves, ...item }) => ({
    ...item,
    ...itemMetrics(moves || []),
    moves: (moves || []).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)).slice(0, 30),
  }));
}

async function stockOf(itemId) {
  const { data, error } = await supabase.from('inventory_moves').select('*').eq('item_id', itemId);
  if (error) throw error;
  return itemMetrics(data).stock;
}

router.get('/:clubId/inventory', async (req, res) => {
  try {
    res.json(await inventoryFor(req.club.id));
  } catch (err) {
    dbError(res, err);
  }
});

router.post('/:clubId/inventory', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const holes = req.body.holes === '' || req.body.holes == null ? null : parseInt(req.body.holes, 10);
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      club_id: req.club.id,
      name,
      category: req.body.category === 'other' ? 'other' : 'ball',
      holes: Number.isInteger(holes) ? holes : null,
      unit: String(req.body.unit || '').trim() || 'quả',
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.patch('/:clubId/inventory/:itemId', async (req, res) => {
  const fields = pick(req.body, ['name', 'is_active', 'unit']);
  const { data, error } = await supabase.from('inventory_items').update(fields).eq('id', req.item.id).select().single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Purchase (optionally also a club-fund expense), retire (with sessions lasted) or adjust.
router.post('/:clubId/inventory/:itemId/moves', async (req, res) => {
  const kind = req.body.kind;
  const quantity = parseInt(req.body.quantity, 10);
  if (!['purchase', 'retire', 'adjust', 'use'].includes(kind)) return res.status(400).json({ error: 'kind must be purchase, retire, use or adjust.' });
  if (!Number.isInteger(quantity) || quantity === 0 || (kind !== 'adjust' && quantity < 0)) {
    return res.status(400).json({ error: 'quantity must be a whole number (positive for purchase/retire/use).' });
  }
  // 'use': shuttles used up in one of this club's sessions.
  let usedAt = null;
  if (kind === 'use') {
    if (!(await sportReady())) return res.status(409).json({ error: 'Run migration 20261012090000_multi_sport_badminton.sql first.' });
    if (!isUuid(req.body.event_id)) return res.status(400).json({ error: 'event_id is required for use.' });
    const { data: ev } = await supabase.from('events').select('id, event_date').eq('id', req.body.event_id).eq('club_id', req.club.id).maybeSingle();
    if (!ev) return notFound(res, 'Event');
    usedAt = ev;
  }
  const unitCost = kind === 'purchase' ? Number(req.body.unit_cost) : null;
  if (kind === 'purchase' && !(unitCost >= 0)) return res.status(400).json({ error: 'unit_cost is required for a purchase.' });
  const lasted = kind === 'retire' && req.body.sessions_lasted !== '' && req.body.sessions_lasted != null ? Number(req.body.sessions_lasted) : null;
  if (lasted != null && !(lasted > 0 && lasted < 10000)) return res.status(400).json({ error: 'sessions_lasted must be > 0.' });
  const occurred_on = usedAt ? usedAt.event_date : /^\d{4}-\d{2}-\d{2}$/.test(req.body.occurred_on || '') ? req.body.occurred_on : todayYmd();

  try {
    // Stock can never go below zero (retiring or a negative adjustment).
    if (kind === 'retire' || kind === 'use' || (kind === 'adjust' && quantity < 0)) {
      const stock = await stockOf(req.item.id);
      if (Math.abs(quantity) > stock) return res.status(400).json({ error: `Only ${stock} in stock.` });
    }
    let transaction_id = null;
    if (kind === 'purchase' && req.body.record_expense !== false && unitCost * quantity > 0) {
      const { data: txn, error: tErr } = await supabase
        .from('transactions')
        .insert({
          host_id: req.hostId,
          owner_type: 'club',
          club_id: req.club.id,
          type: 'expense',
          category: 'balls',
          amount: Math.round(unitCost * quantity),
          note: `${quantity} × ${req.item.name}`,
          occurred_on,
        })
        .select('id')
        .single();
      if (tErr) throw tErr;
      transaction_id = txn.id;
    }
    const { data, error } = await supabase
      .from('inventory_moves')
      .insert({
        item_id: req.item.id,
        kind,
        quantity,
        unit_cost: unitCost,
        sessions_lasted: lasted,
        occurred_on,
        note: String(req.body.note || '').trim() || null,
        transaction_id,
        ...(usedAt ? { event_id: usedAt.id } : {}),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    dbError(res, err);
  }
});

// Undo a mistaken entry; a linked fund expense is voided (the ledger stays append-only).
router.delete('/:clubId/inventory/:itemId/moves/:moveId', async (req, res) => {
  if (!isUuid(req.params.moveId)) return notFound(res, 'Move');
  const { data: move } = await supabase.from('inventory_moves').select('*').eq('id', req.params.moveId).eq('item_id', req.item.id).maybeSingle();
  if (!move) return notFound(res, 'Move');
  // Removing a purchase (or a positive adjustment) must not leave negative stock.
  const effect = move.kind === 'retire' ? -move.quantity : move.quantity;
  if (effect > 0) {
    let stock;
    try {
      stock = await stockOf(req.item.id);
    } catch (err) {
      return dbError(res, err);
    }
    if (stock - effect < 0) {
      return res.status(400).json({ error: `Can't delete: ${effect - stock} of these balls were already retired or adjusted. Delete those entries first.` });
    }
  }
  if (move.transaction_id) {
    await supabase
      .from('transactions')
      .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'inventory entry deleted' })
      .eq('id', move.transaction_id);
  }
  const { error } = await supabase.from('inventory_moves').delete().eq('id', move.id);
  if (error) return dbError(res, error);
  res.status(204).end();
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
  await completeFinished({ clubId: req.club.id });
  const { data, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('club_id', req.club.id)
    .order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  res.json(data);
});

// ---- Attendance (Stats → Members) ----------------------------------------------
// Everything for the attendance grid in one request: the club's sessions in a date
// range, who was on each (members and guests), and each member's passes (sessions
// included / used / left — what carries over to the next period).
const YMD = /^\d{4}-\d{2}-\d{2}$/;
router.get('/:clubId/attendance', async (req, res) => {
  const { from, to } = req.query;
  if (!YMD.test(from || '') || !YMD.test(to || '') || to < from) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required.' });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) return res.status(400).json({ error: 'Pick at most about a year.' });

  const [{ data: events, error: e1 }, { data: members, error: e2 }] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, event_date, start_time, kind, status')
      .eq('club_id', req.club.id)
      .gte('event_date', from)
      .lte('event_date', to)
      .neq('status', 'cancelled')
      .order('event_date')
      .order('start_time'),
    supabase
      .from('club_members')
      .select('*')
      .eq('club_id', req.club.id)
      .order('full_name'),
  ]);
  if (e1) return dbError(res, e1);
  if (e2) return dbError(res, e2);

  const eventIds = events.map((e) => e.id);
  const memberIds = members.map((m) => m.id);
  const ready = await guestsReady();
  const [{ data: people, error: e3 }, { data: passes, error: e4 }] = await Promise.all([
    eventIds.length
      ? supabase
          .from('event_participants')
          .select(`id, event_id, source_club_member_id, user_id, kind, full_name, phone, status, late_cancel${ready ? ', guest_member_id' : ''}`)
          .in('event_id', eventIds)
          .in('status', ['registered', 'checked_in', 'no_show', 'cancelled'])
      : { data: [] },
    memberIds.length
      ? supabase
          .from('v_membership_status')
          .select('club_member_id, period_label, starts_on, ends_on, status, sessions_included, sessions_used, sessions_remaining')
          .in('club_member_id', memberIds)
          .lte('starts_on', to)
          .gte('ends_on', from)
          .order('starts_on')
      : { data: [] },
  ]);
  if (e3) return dbError(res, e3);
  if (e4) return dbError(res, e4);

  // Fixed members fill the grid; everyone else is a guest row of their own (their guest
  // record, else phone / name), with sessions played and matches played / won.
  const byUser = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id, m.id]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const cells = [];
  const guestRows = new Map();
  const participantGuest = new Map(); // participant id -> guest row key
  for (const p of people) {
    const memberId = p.source_club_member_id || p.guest_member_id || (p.user_id && byUser.get(p.user_id)) || null;
    const member = memberId ? memberById.get(memberId) : null;
    const isFixed = member?.member_type === 'fixed';
    const key = member ? `m:${member.id}` : `p:${String(p.phone || '').replace(/\D/g, '').slice(-9) || p.full_name.trim().toLowerCase()}`;
    if (!isFixed) participantGuest.set(p.id, key);
    // Cancelled in time doesn't count at all. A late cancel counts as a session (red, and
    // it used a pass session); a no-show is marked absent but not counted.
    if (p.status === 'cancelled' && !p.late_cancel) continue;
    const state = p.status === 'checked_in' ? 'attended' : p.status === 'registered' ? 'registered' : p.status === 'cancelled' ? 'late' : 'absent';
    const locked = p.status === 'cancelled'; // a late cancel stays as it is
    if (isFixed) {
      cells.push({ event_id: p.event_id, club_member_id: memberId, state, participant_id: p.id, locked });
      continue;
    }
    if (!guestRows.has(key)) {
      guestRows.set(key, {
        key,
        member_id: member?.id || null,
        full_name: member?.full_name || p.full_name,
        phone: member?.phone || p.phone || null,
        guest_perk: member?.guest_perk || null,
        is_active: member ? member.is_active : true,
        events: {},
        participants: {}, // event id -> { participant_id, locked } (for editing)
        sessions: 0,
        matches: 0,
        wins: 0,
      });
    }
    const g = guestRows.get(key);
    if (g.events[p.event_id] !== 'attended') {
      g.events[p.event_id] = state;
      g.participants[p.event_id] = { participant_id: p.id, locked };
    }
  }
  // Sessions = checked in + cancelled too late (both count).
  for (const g of guestRows.values()) g.sessions = Object.values(g.events).filter((s) => s === 'attended' || s === 'late').length;

  // Matches the guests played: inside the period's sessions, and club matches in the period.
  const pids = [...participantGuest.keys()];
  const guestMemberIds = [...guestRows.values()].map((g) => g.member_id).filter(Boolean);
  const [{ data: eventMatches }, { data: clubMatches }] = await Promise.all([
    pids.length
      ? supabase.from('match_players').select('team, event_participant_id, matches(team1_score, team2_score)').in('event_participant_id', pids)
      : { data: [] },
    guestMemberIds.length
      ? supabase.from('match_players').select('team, club_member_id, matches(played_at, team1_score, team2_score)').in('club_member_id', guestMemberIds)
      : { data: [] },
  ]);
  const count = (key, row) => {
    const g = guestRows.get(key);
    if (!g || !isScored(row.matches)) return;
    g.matches++;
    if (winnerTeam(row.matches) === row.team) g.wins++;
  };
  for (const r of eventMatches || []) count(participantGuest.get(r.event_participant_id), r);
  for (const r of clubMatches || []) {
    const day = r.matches && localDate(r.matches.played_at);
    if (day && day >= from && day <= to) count(`m:${r.club_member_id}`, r);
  }

  res.json({
    from,
    to,
    events,
    members: members
      .filter((m) => m.member_type === 'fixed')
      .map(({ id, full_name, member_type, tier, is_active, joined_on, birth_date }) => ({ id, full_name, member_type, tier, is_active, joined_on, birth_date })),
    cells,
    guests: [...guestRows.values()],
    passes,
  });
});

// Host fixes the attendance grid (late check-in, wrong tick). The page sends every change
// at once after the Host confirms them. Same rules as checking in at the court: a club
// member's pass session is used / given back.
const EDIT_ACTION = { attended: 'check-in', absent: 'no-show', registered: 'reset' };
router.post('/:clubId/attendance/edits', async (req, res) => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  if (!changes.length || changes.length > 500) return res.status(400).json({ error: 'Send 1-500 changes.' });
  if (!changes.every((c) => isUuid(c.participant_id) && EDIT_ACTION[c.state])) {
    return res.status(400).json({ error: 'Each change needs participant_id and state (attended / absent / registered).' });
  }
  const ids = [...new Set(changes.map((c) => c.participant_id))];
  const { data: rows, error } = await supabase.from('event_participants').select('*, events(*)').in('id', ids);
  if (error) return dbError(res, error);
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  if (ids.some((id) => byId.get(id)?.events?.club_id !== req.club.id)) return notFound(res, 'Participant');
  const results = [];
  try {
    for (const c of changes) {
      const { events: event, ...prior } = byId.get(c.participant_id);
      if (prior.status === 'cancelled') {
        results.push({ participant_id: prior.id, skipped: 'cancelled' });
        continue;
      }
      const updated = await setAttendance(event, prior, EDIT_ACTION[c.state]);
      byId.set(prior.id, { ...updated, events: event });
      results.push({ participant_id: prior.id, status: updated.status });
    }
  } catch (err) {
    return err.status ? res.status(err.status).json({ error: err.message }) : dbError(res, err);
  }
  res.json({ updated: results.filter((r) => r.status).length, results });
});

// Birthdays today or in the next few days (default 3) — shown as a reminder on the Host's pages.
router.get('/:clubId/birthdays', async (req, res) => {
  const within = Math.min(Math.max(parseInt(req.query.days, 10) || 3, 0), 31);
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, birth_date, member_type')
    .eq('club_id', req.club.id)
    .eq('is_active', true)
    .not('birth_date', 'is', null);
  if (error) return dbError(res, error);
  res.json(birthdays.upcoming(data, within));
});

module.exports = router;
