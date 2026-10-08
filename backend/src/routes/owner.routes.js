// The app owner's back office (/owner). Only emails in OWNER_EMAILS get in (everyone
// else sees a plain 404). Every change made here is written to owner_audit_logs.
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, isUuid } = require('../utils/respond');
const { fetchAll } = require('../services/clubStats');
const { TIERS, CLUB_LIMIT, CAPACITY, forgetPlan, memberRoom } = require('../services/plan');
const billing = require('../services/billing');
const owner = require('../services/owner');
const S = require('../services/ownerStats');
const { notifyFeedback } = require('../services/feedback');

const router = express.Router();
const MIGRATION = '20261026090000_owner_console.sql';
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

router.use((req, res, next) => (owner.isOwner(req.hostEmail) ? next() : res.status(404).json({ error: 'Not found.' })));

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    // A table/column from the owner migration is missing.
    if (/owner_|suspended_|does not exist|schema cache/i.test(err.message || '')) {
      return res.status(409).json({ error: `Run migration ${MIGRATION} first.`, code: 'migration_required' });
    }
    dbError(res, err);
  }
};

router.get('/me', (req, res) => res.json({ owner: true, email: req.hostEmail }));

// ---- Data loading ----------------------------------------------------------------

async function loadAll() {
  const [users, subs, clubs, xeve, profiles, usage] = await Promise.all([
    fetchAll(() => supabase.from('users').select('id, email, full_name, created_at, suspended_at, suspended_reason').order('created_at')),
    fetchAll(() => supabase.from('host_subscriptions').select('*').order('host_id')),
    fetchAll(() => supabase.from('clubs').select('id, host_id, name, sport, created_at').order('created_at')),
    fetchAll(() => supabase.from('events').select('id, host_id, created_at').is('club_id', null).neq('kind', 'meeting').order('created_at')),
    fetchAll(() => supabase.from('player_profiles').select('user_id, phone, full_name').order('user_id')),
    fetchAll(() => supabase.from('v_host_capacity_usage').select('host_id, used').order('host_id')),
  ]);
  return { users, subs, clubs, xeve, profiles, usage };
}

async function lastSignIns(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc('owner_last_sign_in', { ids });
  if (error) return new Map(); // not available (e.g. local stand-in): just leave it blank
  return new Map((data || []).map((r) => [r.id, r.last_sign_in_at]));
}

// One row of the host list.
function hostRow(u, ctx) {
  const sub = ctx.subOf.get(u.id) || { tier: 'free' };
  const tier = sub.tier || 'free';
  const prof = ctx.profOf.get(u.id);
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name || prof?.full_name || null,
    phone: prof?.phone || null,
    created_at: u.created_at,
    tier,
    tier_paid_until: sub.tier_paid_until || null,
    social_manager: !!sub.social_manager,
    social_manager_paid_until: sub.social_manager_paid_until || null,
    suspended_at: u.suspended_at || null,
    suspended_reason: u.suspended_reason || null,
    clubs_owned: ctx.clubCount.get(u.id) || 0,
    club_limit: CLUB_LIMIT[tier] ?? null,
    people_used: ctx.usedOf.get(u.id) || 0,
    people_limit: CAPACITY[tier],
    xeve_games: ctx.xeveCount.get(u.id) || 0,
    is_host: ctx.hostIds.has(u.id) || tier !== 'free' || !!sub.social_manager,
    is_owner: owner.isOwner(u.email),
  };
}

function context(all) {
  const count = (rows) => rows.reduce((m, r) => m.set(r.host_id, (m.get(r.host_id) || 0) + 1), new Map());
  const starts = S.hostStarts(all.clubs, all.xeve);
  return {
    subOf: new Map(all.subs.map((s) => [s.host_id, s])),
    profOf: new Map(all.profiles.map((p) => [p.user_id, p])),
    usedOf: new Map(all.usage.map((u) => [u.host_id, u.used])),
    clubCount: count(all.clubs),
    xeveCount: count(all.xeve),
    hostIds: new Set(starts.keys()),
    starts,
  };
}

// ---- Overview --------------------------------------------------------------------

router.get('/overview', wrap(async (req, res) => {
  const today = S.vnYmd(new Date());
  const all = await loadAll();
  const ctx = context(all);
  const [orders, tournaments] = await Promise.all([
    fetchAll(() => supabase.from('plan_payments').select('host_id, kind, tier, months, amount, status, created_at, confirmed_at').order('created_at')),
    fetchAll(() => supabase.from('tournaments').select('id, created_at').order('created_at')),
  ]);
  const paid = orders.filter((o) => o.status === 'paid');
  const playerIds = new Set(all.profiles.map((p) => p.user_id));
  const emailOf = new Map(all.users.map((u) => [u.id, u.email]));
  const month = today.slice(0, 7);
  const prevMonth = S.shiftYmd(`${month}-01`, -1).slice(0, 7);
  const todayCount = (rows) => rows.filter((r) => S.vnYmd(new Date(r.created_at)) === today).length;

  res.json({
    today,
    growth: {
      hosts: S.weekly([...ctx.starts.values()], today),
      clubs: S.weekly(all.clubs.map((c) => c.created_at), today),
      players: S.weekly(all.users.filter((u) => playerIds.has(u.id)).map((u) => u.created_at), today),
      accounts: S.weekly(all.users.map((u) => u.created_at), today),
    },
    totals: { accounts: all.users.length, hosts: ctx.hostIds.size, clubs: all.clubs.length, players: playerIds.size },
    conversion: S.conversion([...ctx.hostIds], all.subs),
    usage: {
      xeve: { today: todayCount(all.xeve), ...S.weekly(all.xeve.map((e) => e.created_at), today) },
      tournaments: { today: todayCount(tournaments), ...S.weekly(tournaments.map((t) => t.created_at), today) },
    },
    revenue: {
      month,
      cash_this_month: S.cashIn(paid, month),
      cash_last_month: S.cashIn(paid, prevMonth),
      mrr: S.mrr(all.subs, paid, today),
      pending_orders: orders.filter((o) => o.status === 'pending').length,
      renewal: S.renewal(all.subs, paid, today),
    },
    expiring: S.expiring(all.subs, today, 7).map((x) => ({ ...x, email: emailOf.get(x.host_id) || null })),
    daily: {
      accounts: S.daily(all.users.map((u) => u.created_at), today),
      clubs: S.daily(all.clubs.map((c) => c.created_at), today),
    },
    suspended: all.users.filter((u) => u.suspended_at).length,
  });
}));

// ---- Hosts -----------------------------------------------------------------------

const FILTERS = ['hosts', 'all', 'paying', 'free', 'suspended', 'expiring'];

router.get('/hosts', wrap(async (req, res) => {
  const today = S.vnYmd(new Date());
  const all = await loadAll();
  const ctx = context(all);
  const filter = FILTERS.includes(req.query.filter) ? req.query.filter : 'hosts';
  const q = String(req.query.q || '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const soon = S.shiftYmd(today, 7);
  let rows = all.users.map((u) => hostRow(u, ctx));
  rows = rows.filter((r) => {
    if (filter === 'hosts' && !r.is_host) return false;
    if (filter === 'paying' && !S.isPaying({ tier: r.tier, social_manager: r.social_manager, social_manager_paid_until: r.social_manager_paid_until })) return false;
    if (filter === 'free' && (r.tier !== 'free' || !r.is_host)) return false;
    if (filter === 'suspended' && !r.suspended_at) return false;
    if (filter === 'expiring') {
      const ends = [r.tier !== 'free' && r.tier_paid_until, r.social_manager && r.social_manager_paid_until].filter(Boolean);
      if (!ends.some((d) => d >= today && d <= soon)) return false;
    }
    if (!q) return true;
    return (
      (r.email || '').toLowerCase().includes(q) ||
      (r.full_name || '').toLowerCase().includes(q) ||
      (digits.length >= 3 && (r.phone || '').replace(/\D/g, '').includes(digits))
    );
  });
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const per = Math.min(100, Math.max(10, parseInt(req.query.per, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const slice = rows.slice((page - 1) * per, page * per);
  const seen = await lastSignIns(slice.map((r) => r.id));
  res.json({ total: rows.length, page, per, rows: slice.map((r) => ({ ...r, last_sign_in_at: seen.get(r.id) || null })) });
}));

async function loadHost(id) {
  if (!isUuid(id)) throw fail(404, 'Host not found.');
  const { data: u, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!u) throw fail(404, 'Host not found.');
  return u;
}

async function loadSub(id) {
  const { data, error } = await supabase.from('host_subscriptions').select('*').eq('host_id', id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: made, error: e2 } = await supabase.from('host_subscriptions').insert({ host_id: id }).select().single();
  if (e2) throw e2;
  return made;
}

router.get('/hosts/:id', wrap(async (req, res) => {
  const u = await loadHost(req.params.id);
  const [{ data: clubs }, { data: xeve }, { data: sub }, { data: prof }, { data: usage }, { data: notes }, { data: orders }, { data: log }] = await Promise.all([
    supabase.from('clubs').select('*').eq('host_id', u.id).order('created_at'),
    supabase.from('events').select('id').eq('host_id', u.id).is('club_id', null).neq('kind', 'meeting'),
    supabase.from('host_subscriptions').select('*').eq('host_id', u.id).maybeSingle(),
    supabase.from('player_profiles').select('user_id, phone, full_name').eq('user_id', u.id).maybeSingle(),
    supabase.from('v_host_capacity_usage').select('host_id, used').eq('host_id', u.id).maybeSingle(),
    supabase.from('owner_notes').select('*').eq('host_id', u.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('plan_payments').select('*').eq('host_id', u.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('owner_audit_logs').select('*').eq('target_host_id', u.id).order('created_at', { ascending: false }).limit(50),
  ]);
  // Member counts per club (a number only — no member details here).
  // Member counts and places per club (numbers only — no member details here).
  const counts = await Promise.all((clubs || []).map((c) => memberRoom(c).catch(() => null)));
  const ctx = {
    subOf: new Map(sub ? [[u.id, sub]] : []),
    profOf: new Map(prof ? [[u.id, prof]] : []),
    usedOf: new Map(usage ? [[u.id, usage.used]] : []),
    clubCount: new Map([[u.id, (clubs || []).length]]),
    xeveCount: new Map([[u.id, (xeve || []).length]]),
    hostIds: new Set((clubs || []).length || (xeve || []).length ? [u.id] : []),
  };
  const seen = await lastSignIns([u.id]);
  res.json({
    host: { ...hostRow(u, ctx), last_sign_in_at: seen.get(u.id) || null },
    clubs: (clubs || []).map((c, i) => ({ id: c.id, name: c.name, sport: c.sport, created_at: c.created_at, members: counts[i] ? counts[i].fixed.used + counts[i].guest.used : 0, room: counts[i] })),
    notes: notes || [],
    orders: (orders || []).map((o) => ({ ...billing.present(o), confirmed_at: o.confirmed_at, confirmed_by: o.confirmed_by })),
    audit: log || [],
    tiers: TIERS,
  });
}));

const SUB_FIELDS = ['tier', 'tier_paid_until', 'social_manager', 'social_manager_paid_until'];
const pickSub = (s) => Object.fromEntries(SUB_FIELDS.map((k) => [k, s[k] ?? null]));

// Change plan / end dates / Social Manager, or give extra months (customer care).
// Body: { tier?, tier_paid_until?: 'YYYY-MM-DD' | null, add_months?, social_manager?,
//         social_manager_paid_until?, sm_add_months?, note? }
router.patch('/hosts/:id/subscription', wrap(async (req, res) => {
  const u = await loadHost(req.params.id);
  const before = await loadSub(u.id);
  const b = req.body || {};
  const today = S.vnYmd(new Date());
  const patch = {};
  const date = (v, name) => {
    if (v === null || v === '') return null;
    if (!YMD.test(String(v))) throw fail(400, `${name} must be YYYY-MM-DD or null.`);
    return v;
  };
  const months = (v, name) => {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1 || n > 36) throw fail(400, `${name} must be 1–36.`);
    return n;
  };
  if ('tier' in b) {
    if (!TIERS.includes(b.tier)) throw fail(400, `tier must be one of ${TIERS.join(', ')}`);
    patch.tier = b.tier;
    if (b.tier === 'free') patch.tier_paid_until = null;
  }
  if ('tier_paid_until' in b) patch.tier_paid_until = date(b.tier_paid_until, 'tier_paid_until');
  if (b.add_months != null && b.add_months !== '') {
    const tier = patch.tier || before.tier;
    if (tier === 'free') throw fail(400, 'Pick a paid tier before adding months.');
    const cur = 'tier_paid_until' in patch ? patch.tier_paid_until : before.tier_paid_until;
    patch.tier_paid_until = billing.addMonths(cur && cur >= today ? cur : today, months(b.add_months, 'add_months'));
  }
  if ('social_manager' in b) {
    patch.social_manager = b.social_manager === true;
    if (!patch.social_manager) patch.social_manager_paid_until = null;
  }
  if ('social_manager_paid_until' in b) patch.social_manager_paid_until = date(b.social_manager_paid_until, 'social_manager_paid_until');
  if (b.sm_add_months != null && b.sm_add_months !== '') {
    const cur = 'social_manager_paid_until' in patch ? patch.social_manager_paid_until : before.social_manager_paid_until;
    patch.social_manager = true;
    patch.social_manager_paid_until = billing.addMonths(cur && cur >= today ? cur : today, months(b.sm_add_months, 'sm_add_months'));
  }
  if (!Object.keys(patch).length) throw fail(400, 'Nothing to change.');
  // The owner switched it on by hand: any request the host left waiting is settled.
  if (patch.tier && patch.tier !== 'free') Object.assign(patch, { upgrade_requested_at: null, upgrade_requested_tier: null });
  if (patch.social_manager) patch.social_manager_requested_at = null;
  const { data: after, error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', u.id).select().single();
  if (error) throw error;
  forgetPlan(u.id);
  const entry = await owner.audit(req, { action: 'subscription.update', host: u, oldValue: pickSub(before), newValue: pickSub(after), note: String(b.note || '').trim() || null });
  res.json({ subscription: pickSub(after), audit_id: entry?.id || null });
}));

router.post('/hosts/:id/suspend', wrap(async (req, res) => {
  const u = await loadHost(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw fail(400, 'A reason is required.', 'reason_required');
  if (owner.isOwner(u.email)) throw fail(400, 'An owner account cannot be suspended.', 'owner_account');
  if (u.suspended_at) throw fail(409, 'Already suspended.');
  const patch = { suspended_at: new Date().toISOString(), suspended_reason: reason.slice(0, 500) };
  const { error } = await supabase.from('users').update(patch).eq('id', u.id);
  if (error) throw error;
  owner.forgetSuspension(u.id);
  const entry = await owner.audit(req, { action: 'account.suspend', host: u, oldValue: { suspended_at: null, suspended_reason: null }, newValue: patch, note: reason });
  res.json({ ...patch, audit_id: entry?.id || null });
}));

router.post('/hosts/:id/unsuspend', wrap(async (req, res) => {
  const u = await loadHost(req.params.id);
  if (!u.suspended_at) throw fail(409, 'Not suspended.');
  const before = { suspended_at: u.suspended_at, suspended_reason: u.suspended_reason };
  const patch = { suspended_at: null, suspended_reason: null };
  const { error } = await supabase.from('users').update(patch).eq('id', u.id);
  if (error) throw error;
  owner.forgetSuspension(u.id);
  const entry = await owner.audit(req, { action: 'account.unsuspend', host: u, oldValue: before, newValue: patch, note: String(req.body?.note || '').trim() || null });
  res.json({ ...patch, audit_id: entry?.id || null });
}));

router.post('/hosts/:id/notes', wrap(async (req, res) => {
  const u = await loadHost(req.params.id);
  const body = String(req.body?.body || '').trim();
  if (!body) throw fail(400, 'Note is empty.');
  if (body.length > 2000) throw fail(400, 'Note is too long (max 2000).');
  const { data, error } = await supabase.from('owner_notes').insert({ host_id: u.id, body, author_email: req.hostEmail }).select().single();
  if (error) throw error;
  await owner.audit(req, { action: 'note.add', host: u, newValue: { body } });
  res.status(201).json(data);
}));

// ---- Clubs: extra member places, change of owner -----------------------------------

async function loadClub(id) {
  if (!isUuid(id)) throw fail(404, 'Club not found.');
  const { data, error } = await supabase.from('clubs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(404, 'Club not found.');
  return data;
}
const placesOf = (c) => ({ extra_fixed_members: Number(c.extra_fixed_members) || 0, extra_guest_members: Number(c.extra_guest_members) || 0 });

// A member licence: extra official / guest places for one club on top of its plan.
// Body: { extra_fixed_members, extra_guest_members, note }
router.patch('/clubs/:id/member-addon', wrap(async (req, res) => {
  const club = await loadClub(req.params.id);
  const patch = {};
  for (const k of ['extra_fixed_members', 'extra_guest_members']) {
    if (!(k in (req.body || {}))) continue;
    const n = Number(req.body[k]);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw fail(400, `${k} must be a whole number ≥ 0.`);
    patch[k] = n;
  }
  if (!Object.keys(patch).length) throw fail(400, 'Nothing to change.');
  const { data, error } = await supabase.from('clubs').update(patch).eq('id', club.id).select('*').single();
  if (error) throw error;
  const host = await loadHost(club.host_id).catch(() => ({ id: club.host_id }));
  const entry = await owner.audit(req, { action: 'club.member_addon', host, oldValue: { club_id: club.id, club_name: club.name, ...placesOf(club) }, newValue: { club_id: club.id, club_name: club.name, ...placesOf(data) }, note: String(req.body.note || '').trim() || null });
  res.json({ ...placesOf(data), room: await memberRoom(data), audit_id: entry?.id || null });
}));

// Hand the club to another account (by email). Its sessions, money, tournaments, ball
// store and staff grants move with it. Body: { email, note }
router.post('/clubs/:id/transfer', wrap(async (req, res) => {
  const club = await loadClub(req.params.id);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) throw fail(400, 'Email of the new owner is required.', 'email_required');
  const { data: next } = await supabase.from('users').select('id, email').ilike('email', email).maybeSingle();
  if (!next) throw fail(404, 'No account with that email. The new owner must sign up first.', 'no_account');
  if (next.id === club.host_id) throw fail(400, 'That account already owns this club.', 'same_owner');
  const prev = await loadHost(club.host_id).catch(() => ({ id: club.host_id, email: null }));
  const { error } = await supabase.rpc('owner_transfer_club', { p_club: club.id, p_new_host: next.id });
  if (error) throw error;
  forgetPlan(prev.id);
  forgetPlan(next.id);
  const entry = await owner.audit(req, {
    action: 'club.transfer',
    host: prev,
    oldValue: { club_id: club.id, club_name: club.name, owner_email: prev.email },
    newValue: { club_id: club.id, club_name: club.name, owner_email: next.email, owner_id: next.id },
    note: String(req.body?.note || '').trim() || null,
  });
  res.json({ club_id: club.id, from: prev.email, to: next.email, audit_id: entry?.id || null });
}));

// ---- Plan payments ---------------------------------------------------------------

// ?status=pending|paid|cancelled|all &from=&to= (YYYY-MM-DD, by order date)
router.get('/payments', wrap(async (req, res) => {
  const status = ['pending', 'paid', 'cancelled', 'all'].includes(req.query.status) ? req.query.status : 'pending';
  const build = () => {
    let q = supabase.from('plan_payments').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    if (YMD.test(req.query.from || '')) q = q.gte('created_at', `${req.query.from}T00:00:00+07:00`);
    if (YMD.test(req.query.to || '')) q = q.lt('created_at', `${S.shiftYmd(req.query.to, 1)}T00:00:00+07:00`);
    return q;
  };
  const data = await fetchAll(build);
  const ids = [...new Set(data.map((o) => o.host_id))];
  const [{ data: users }, { data: subs }] = await Promise.all([
    ids.length ? supabase.from('users').select('id, email, full_name').in('id', ids) : { data: [] },
    ids.length ? supabase.from('host_subscriptions').select('host_id, tier, tier_paid_until, social_manager, social_manager_paid_until').in('host_id', ids) : { data: [] },
  ]);
  const byId = new Map((users || []).map((u) => [u.id, u]));
  const subOf = new Map((subs || []).map((s) => [s.host_id, s]));
  const orders = data.map((o) => ({
    ...billing.present(o),
    confirmed_at: o.confirmed_at,
    confirmed_by: o.confirmed_by,
    host: byId.get(o.host_id) || { id: o.host_id },
    current: subOf.get(o.host_id) || null,
  }));
  res.json({ orders, total_paid: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0) });
}));

router.post('/payments/:id/confirm', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Order not found.');
  const { data: order } = await supabase.from('plan_payments').select('host_id').eq('id', req.params.id).maybeSingle();
  if (!order) throw fail(404, 'Order not found.');
  const u = await loadHost(order.host_id);
  const before = pickSub(await loadSub(u.id));
  const r = await billing.confirmOrder(req.params.id, req.hostEmail);
  const after = pickSub(await loadSub(u.id));
  await owner.audit(req, { action: 'payment.confirm', host: u, oldValue: before, newValue: after, note: `${r.order.ref} · ${Number(r.order.amount).toLocaleString('vi-VN')}đ · ${r.order.months} tháng` });
  const what = r.order.kind === 'tier' ? r.order.tier : 'Social Manager';
  await notifyFeedback({ message: `[Gói] Đã xác nhận thanh toán ${r.order.ref} (${what}, ${r.order.months} tháng)`, contact: req.hostEmail, page: '/owner/payments', userEmail: req.hostEmail }).catch(() => {});
  res.json(r);
}));

// Never paid: drop the order (and the host's "waiting" badge).
router.post('/payments/:id/cancel', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Order not found.');
  const { data: order, error } = await supabase.from('plan_payments').update({ status: 'cancelled' }).eq('id', req.params.id).eq('status', 'pending').select().maybeSingle();
  if (error) throw error;
  if (!order) throw fail(409, 'Order is not pending.');
  const clear = order.kind === 'tier' ? { upgrade_requested_at: null, upgrade_requested_tier: null } : { social_manager_requested_at: null };
  await supabase.from('host_subscriptions').update(clear).eq('host_id', order.host_id);
  const u = await loadHost(order.host_id).catch(() => null);
  await owner.audit(req, { action: 'payment.cancel', host: u, oldValue: { status: 'pending' }, newValue: { status: 'cancelled' }, note: order.ref });
  res.json({ order });
}));

// ---- Audit log -------------------------------------------------------------------

router.get('/audit', wrap(async (req, res) => {
  const per = 50;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  let q = supabase.from('owner_audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * per, page * per - 1);
  if (isUuid(req.query.host_id)) q = q.eq('target_host_id', req.query.host_id);
  if (/^[a-z_.]+$/.test(req.query.action || '')) q = q.eq('action', req.query.action);
  const { data, error, count } = await q;
  if (error) throw error;
  res.json({ rows: data, total: count || 0, page, per });
}));

// What each undoable action restores, and how to read the current state to make sure
// nothing changed since (so an undo never overwrites a newer change).
const UNDO = {
  'subscription.update': {
    current: async (id) => pickSub(await loadSub(id)),
    restore: async (id, v) => {
      const { error } = await supabase.from('host_subscriptions').update(pickSub(v)).eq('host_id', id);
      if (error) throw error;
    },
  },
  'payment.confirm': null, // money changed hands: change the plan by hand instead
  'club.member_addon': 'club_places',
  'account.suspend': 'suspension',
  'account.unsuspend': 'suspension',
};
const SUSPENSION = {
  current: async (id) => {
    const { data } = await supabase.from('users').select('suspended_at, suspended_reason').eq('id', id).single();
    return { suspended_at: data.suspended_at, suspended_reason: data.suspended_reason };
  },
  restore: async (id, v) => {
    const { error } = await supabase.from('users').update({ suspended_at: v.suspended_at, suspended_reason: v.suspended_reason }).eq('id', id);
    if (error) throw error;
    owner.forgetSuspension(id);
  },
};
// Extra member places of the club named in the entry.
const clubPlaces = (entry) => ({
  current: async () => ({ club_id: entry.new_value.club_id, club_name: entry.new_value.club_name, ...placesOf(await loadClub(entry.new_value.club_id)) }),
  restore: async (_id, v) => {
    const { error } = await supabase.from('clubs').update(placesOf(v)).eq('id', v.club_id);
    if (error) throw error;
  },
});
const same = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k] ?? null])) === JSON.stringify(Object.keys(a).sort().map((k) => [k, b?.[k] ?? null]));
const sameTime = (a, b) => (a == null && b == null) || (a && b && Date.parse(a) === Date.parse(b));

router.post('/audit/:id/undo', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Entry not found.');
  const { data: entry } = await supabase.from('owner_audit_logs').select('*').eq('id', req.params.id).maybeSingle();
  if (!entry) throw fail(404, 'Entry not found.');
  const how = UNDO[entry.action] === 'suspension' ? SUSPENSION : UNDO[entry.action] === 'club_places' ? clubPlaces(entry) : UNDO[entry.action];
  if (!how || !entry.target_host_id) throw fail(400, 'This change cannot be undone here.', 'not_undoable');
  if (entry.undone_at) throw fail(409, 'Already undone.', 'already_undone');
  const now = await how.current(entry.target_host_id);
  const unchanged = how === SUSPENSION
    ? sameTime(now.suspended_at, entry.new_value?.suspended_at) && (now.suspended_reason ?? null) === (entry.new_value?.suspended_reason ?? null)
    : same(now, entry.new_value);
  if (!unchanged) throw fail(409, 'Changed again since — undo the newer change first, or edit by hand.', 'changed_since');
  await how.restore(entry.target_host_id, entry.old_value);
  forgetPlan(entry.target_host_id);
  const { error } = await supabase.from('owner_audit_logs').update({ undone_at: new Date().toISOString() }).eq('id', entry.id);
  if (error) throw error;
  const u = await loadHost(entry.target_host_id).catch(() => ({ id: entry.target_host_id, email: entry.target_email }));
  const back = await owner.audit(req, { action: 'undo', host: u, oldValue: entry.new_value, newValue: entry.old_value, note: entry.action, undoOf: entry.id });
  res.json({ restored: entry.old_value, audit_id: back?.id || null });
}));

module.exports = router;
