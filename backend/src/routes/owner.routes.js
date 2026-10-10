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
const appSettings = require('../services/appSettings');
const { schemaStatus, PROBES } = require('../services/schemaCheck');
const announcements = require('./announcements.routes');
const promo = require('../services/promo');
const support = require('../services/support');

const router = express.Router();
const MIGRATION = '20261026090000_owner_console.sql';
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

// Owners (OWNER_EMAILS) get everything; support staff only the parts their permissions
// open (services/support.js); anyone else gets "not found".
router.use(async (req, res, next) => {
  try {
    const access = await support.consoleAccess(req.hostEmail);
    if (!access) return res.status(404).json({ error: 'Not found.' });
    if (access.support) {
      // A suspended support account can't use the console.
      if (await owner.suspensionOf(req.userId)) return res.status(404).json({ error: 'Not found.' });
      const path = req.path.replace(/\/+$/, '') || '/';
      const perm = path === '/me' ? 'me' : support.permissionFor(req.method, path);
      if (perm !== 'me' && !support.can(access, perm)) return res.status(403).json({ error: 'Your support role does not include this.', code: 'support_forbidden' });
    }
    req.console = access;
    next();
  } catch (err) {
    dbError(res, err);
  }
});

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

router.get('/me', (req, res) => res.json({ owner: !!req.console.owner, support: !!req.console.support, permissions: req.console.permissions, email: req.hostEmail }));

// ---- Support staff (owners only) ----------------------------------------------------

const cleanStaffPerms = (v) => {
  if (!Array.isArray(v) || v.some((p) => !support.PERMISSIONS.includes(p))) throw fail(400, `permissions: any of ${support.PERMISSIONS.join(', ')}.`, 'bad_permissions');
  return [...new Set(v)];
};
const staffEmail = (v) => {
  const e = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail(400, 'A valid email is required.', 'bad_email');
  return e;
};

router.get('/support', wrap(async (req, res) => {
  const { data, error } = await supabase.from('support_staff').select('*').order('created_at');
  if (error) throw error;
  const emails = data.map((s) => s.email);
  const { data: users } = emails.length ? await supabase.from('users').select('id, email').in('email', emails) : { data: [] };
  const known = new Map((users || []).map((u) => [String(u.email).toLowerCase(), u.id]));
  const ids = [...known.values()];
  const seen = await lastSignIns(ids);
  res.json({ permissions: support.PERMISSIONS, staff: data.map((s) => ({ ...s, has_account: known.has(s.email), last_sign_in_at: seen.get(known.get(s.email)) || null })) });
}));

router.post('/support', wrap(async (req, res) => {
  const email = staffEmail(req.body?.email);
  if (owner.isOwner(email)) throw fail(400, 'This email is already an owner.', 'already_owner');
  const row = { email, full_name: String(req.body?.full_name || '').trim().slice(0, 80) || null, permissions: cleanStaffPerms(req.body?.permissions || []), created_by: req.hostEmail };
  const { data, error } = await supabase.from('support_staff').insert(row).select().single();
  if (error?.code === '23505') throw fail(409, 'This person is already on the support staff.', 'already_staff');
  if (error) throw error;
  support.forget(email);
  await owner.audit(req, { action: 'support.add', newValue: { email, permissions: data.permissions }, note: data.full_name });
  res.status(201).json(data);
}));

router.patch('/support/:email', wrap(async (req, res) => {
  const email = staffEmail(req.params.email);
  const { data: before } = await supabase.from('support_staff').select('*').eq('email', email).maybeSingle();
  if (!before) throw fail(404, 'Not on the support staff.');
  const patch = { updated_at: new Date().toISOString() };
  if ('permissions' in (req.body || {})) patch.permissions = cleanStaffPerms(req.body.permissions);
  if ('active' in (req.body || {})) patch.active = req.body.active === true;
  if ('full_name' in (req.body || {})) patch.full_name = String(req.body.full_name || '').trim().slice(0, 80) || null;
  const { data, error } = await supabase.from('support_staff').update(patch).eq('email', email).select().single();
  if (error) throw error;
  support.forget(email);
  const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
  await owner.audit(req, { action: 'support.update', oldValue: Object.fromEntries(keys.map((k) => [k, before[k]])), newValue: Object.fromEntries(keys.map((k) => [k, data[k]])), note: email });
  res.json(data);
}));

router.delete('/support/:email', wrap(async (req, res) => {
  const email = staffEmail(req.params.email);
  const { data, error } = await supabase.from('support_staff').delete().eq('email', email).select();
  if (error) throw error;
  if (!data.length) throw fail(404, 'Not on the support staff.');
  support.forget(email);
  await owner.audit(req, { action: 'support.remove', oldValue: { email, permissions: data[0].permissions }, note: email });
  res.status(204).end();
}));

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
    trial_ends_on: sub.trial_ends_on || null,
    on_trial: S.onTrial(sub, S.vnYmd(new Date())),
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
    // Plans: hosts on each, average a paying host pays per month (ARPU), trials.
    tiers: S.tierMix(all.subs, [...ctx.hostIds]),
    arpu: (() => {
      const paying = all.subs.filter((x) => S.isPaying(x)).length;
      return paying ? Math.round(S.mrr(all.subs, paid, today) / paying) : 0;
    })(),
    trials: (() => {
      const t = S.trials(all.subs, paid, today);
      return { ...t, active: t.active.map((x) => ({ ...x, email: emailOf.get(x.host_id) || null })) };
    })(),
  });
}));

// ---- Hosts -----------------------------------------------------------------------

const FILTERS = ['hosts', 'all', 'paying', 'trial', 'free', 'suspended', 'expiring'];

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
    if (filter === 'paying' && !S.isPaying({ tier: r.tier, tier_paid_until: r.tier_paid_until, trial_ends_on: r.trial_ends_on, social_manager: r.social_manager, social_manager_paid_until: r.social_manager_paid_until })) return false;
    if (filter === 'trial' && !r.on_trial) return false;
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
  // Who works on the host's clubs (role and email only).
  const { data: staff } = await supabase.from('staff_grants').select('id, email, full_name, role, club_id, event_id, valid_from, valid_until, clubs(name)').eq('host_id', u.id).order('created_at');
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
    staff: (staff || []).map((g) => ({ ...g, club_name: g.clubs?.name || null, clubs: undefined })),
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

// ---- System activity (read-only) ---------------------------------------------------

const paging = (req, total) => {
  const per = Math.min(100, Math.max(10, parseInt(req.query.per, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  return { per, page, from: (page - 1) * per, to: page * per, pages: Math.max(1, Math.ceil(total / per)) };
};

// Every club: name, owner, plan, member counts (numbers only — no member details).
router.get('/activity/clubs', wrap(async (req, res) => {
  const [clubs, members, users, subs] = await Promise.all([
    fetchAll(() => supabase.from('clubs').select('id, name, sport, host_id, created_at, extra_fixed_members, extra_guest_members').order('created_at', { ascending: false })),
    fetchAll(() => supabase.from('club_members').select('club_id, member_type').eq('is_active', true).order('club_id')),
    fetchAll(() => supabase.from('users').select('id, email').order('id')),
    fetchAll(() => supabase.from('host_subscriptions').select('host_id, tier').order('host_id')),
  ]);
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const tierOf = new Map(subs.map((x) => [x.host_id, x.tier]));
  const count = new Map();
  for (const m of members) {
    const c = count.get(m.club_id) || { fixed: 0, guest: 0 };
    c[m.member_type === 'guest' ? 'guest' : 'fixed'] += 1;
    count.set(m.club_id, c);
  }
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = clubs.map((c) => ({ ...c, owner_email: emailOf.get(c.host_id) || null, tier: tierOf.get(c.host_id) || 'free', members: count.get(c.id) || { fixed: 0, guest: 0 } }));
  if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.owner_email || '').toLowerCase().includes(q));
  if (req.query.sort === 'members') rows.sort((a, b) => b.members.fixed + b.members.guest - (a.members.fixed + a.members.guest));
  const pg = paging(req, rows.length);
  res.json({ total: rows.length, page: pg.page, pages: pg.pages, rows: rows.slice(pg.from, pg.to) });
}));

// Xé Vé games: title, when, status, fill rate. ?when=upcoming|past|all &from&to
router.get('/activity/xeve', wrap(async (req, res) => {
  const today = S.vnYmd(new Date());
  const build = () => {
    let q = supabase.from('v_event_summary').select('id, host_id, title, event_date, start_time, status, slots, main_count, waitlist_count, fee_amount').is('club_id', null).neq('kind', 'meeting');
    if (req.query.when === 'upcoming') q = q.gte('event_date', today);
    if (req.query.when === 'past') q = q.lt('event_date', today);
    if (YMD.test(req.query.from || '')) q = q.gte('event_date', req.query.from);
    if (YMD.test(req.query.to || '')) q = q.lte('event_date', req.query.to);
    return q.order('event_date', { ascending: req.query.when === 'upcoming' }).order('start_time');
  };
  const [events, users] = await Promise.all([fetchAll(build), fetchAll(() => supabase.from('users').select('id, email').order('id'))]);
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const rows = events.map((e) => ({ ...e, host_email: emailOf.get(e.host_id) || null, fill: e.slots ? Math.round((Number(e.main_count || 0) / e.slots) * 100) : null }));
  const pg = paging(req, rows.length);
  const todayRows = events.filter((e) => e.event_date === today);
  res.json({ total: rows.length, page: pg.page, pages: pg.pages, rows: rows.slice(pg.from, pg.to), today: { games: todayRows.length, players: todayRows.reduce((n, e) => n + Number(e.main_count || 0), 0) } });
}));

// ---- Club requests: approve (the club is created) or reject ---------------------------

const clubRequests = require('../services/clubRequests');
const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'all'];
const requestsGuard = async () => {
  if (!(await clubRequests.ready())) throw fail(409, `Run migration ${clubRequests.MIGRATION} first.`, 'migration_required');
};

router.get('/club-requests', wrap(async (req, res) => {
  await requestsGuard();
  const status = REQUEST_STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  res.json(await clubRequests.list({ status, page: Math.max(1, parseInt(req.query.page, 10) || 1) }));
}));

router.get('/club-requests/:id', wrap(async (req, res) => {
  await requestsGuard();
  if (!isUuid(req.params.id)) throw fail(404, 'Request not found.');
  res.json(await clubRequests.detail(req.params.id));
}));

router.post('/club-requests/:id/:decision(approve|reject)', wrap(async (req, res) => {
  await requestsGuard();
  if (!isUuid(req.params.id)) throw fail(404, 'Request not found.');
  const decision = req.params.decision;
  const out = await clubRequests.decide(req.params.id, decision, { actor: req.hostEmail, note: req.body?.note });
  const { data: r } = await supabase.from('club_requests').select('user_id, name, users(email)').eq('id', req.params.id).single();
  await owner.audit(req, {
    action: decision === 'approve' ? 'club_request.approve' : 'club_request.reject',
    host: r ? { id: r.user_id, email: r.users?.email || null } : null,
    newValue: { status: out.request.status, club_id: out.club?.id || null },
    note: [r?.name, req.body?.note].filter(Boolean).join(' — ') || null,
  });
  res.json(out);
}));

// ---- Feedback inbox -----------------------------------------------------------------

const FEEDBACK_STATUSES = ['new', 'in_progress', 'closed'];

router.get('/feedback', wrap(async (req, res) => {
  const status = FEEDBACK_STATUSES.includes(req.query.status) ? req.query.status : null;
  const per = 50;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  let q = supabase.from('feedback').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * per, page * per - 1);
  if (status) q = q.eq('status', status);
  const { data, error, count } = await q;
  if (error) throw error;
  const ids = [...new Set(data.map((f) => f.host_id).filter(Boolean))];
  const { data: users } = ids.length ? await supabase.from('users').select('id, email').in('id', ids) : { data: [] };
  const emailOf = new Map((users || []).map((u) => [u.id, u.email]));
  const counts = {};
  for (const st of FEEDBACK_STATUSES) {
    const { count: c } = await supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', st);
    counts[st] = c || 0;
  }
  res.json({ rows: data.map((f) => ({ ...f, host_email: emailOf.get(f.host_id) || null })), total: count || 0, page, pages: Math.max(1, Math.ceil((count || 0) / per)), counts });
}));

router.patch('/feedback/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Feedback not found.');
  const status = req.body?.status;
  if (!FEEDBACK_STATUSES.includes(status)) throw fail(400, `status must be one of ${FEEDBACK_STATUSES.join(', ')}.`);
  const { data: before } = await supabase.from('feedback').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) throw fail(404, 'Feedback not found.');
  const { data, error } = await supabase.from('feedback').update({ status, status_changed_at: new Date().toISOString() }).eq('id', before.id).select().single();
  if (error) throw error;
  const host = before.host_id ? await loadHost(before.host_id).catch(() => null) : null;
  await owner.audit(req, { action: 'feedback.status', host, oldValue: { status: before.status }, newValue: { status }, note: String(before.message || '').slice(0, 120) });
  res.json(data);
}));

// ---- Announcements (banner for everyone) -------------------------------------------

const cleanAnnouncement = (b, partial = false) => {
  const out = {};
  if (!partial || 'message' in b) {
    const m = String(b.message || '').trim();
    if (!m || m.length > 500) throw fail(400, 'Message is 1-500 characters.');
    out.message = m;
  }
  if ('level' in b) {
    if (!['info', 'warning'].includes(b.level)) throw fail(400, 'level must be info or warning.');
    out.level = b.level;
  }
  for (const k of ['starts_at', 'ends_at']) {
    if (!(k in b)) continue;
    if (b[k] === null || b[k] === '') out[k] = k === 'starts_at' ? new Date().toISOString() : null;
    else if (Number.isNaN(Date.parse(b[k]))) throw fail(400, `${k} must be a date-time.`);
    else out[k] = new Date(b[k]).toISOString();
  }
  if ('show_public' in b) out.show_public = b.show_public === true;
  if ('active' in b) out.active = b.active !== false;
  if (out.ends_at && out.starts_at && out.ends_at <= out.starts_at) throw fail(400, 'The end must be after the start.');
  return out;
};

router.get('/announcements', wrap(async (req, res) => {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  res.json(data);
}));

router.post('/announcements', wrap(async (req, res) => {
  const row = cleanAnnouncement(req.body || {});
  const { data, error } = await supabase.from('announcements').insert({ ...row, created_by: req.hostEmail }).select().single();
  if (error) throw error;
  announcements.forget();
  await owner.audit(req, { action: 'announcement.create', newValue: { message: data.message, level: data.level, starts_at: data.starts_at, ends_at: data.ends_at, show_public: data.show_public } });
  res.status(201).json(data);
}));

router.patch('/announcements/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Announcement not found.');
  const { data: before } = await supabase.from('announcements').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) throw fail(404, 'Announcement not found.');
  const patch = cleanAnnouncement(req.body || {}, true);
  const { data, error } = await supabase.from('announcements').update(patch).eq('id', before.id).select().single();
  if (error) throw error;
  const keys = Object.keys(patch);
  announcements.forget();
  await owner.audit(req, { action: 'announcement.update', oldValue: Object.fromEntries(keys.map((k) => [k, before[k]])), newValue: Object.fromEntries(keys.map((k) => [k, data[k]])), note: data.message.slice(0, 120) });
  res.json(data);
}));

// ---- System health & settings -------------------------------------------------------

router.get('/system', wrap(async (req, res) => {
  const schema = await schemaStatus();
  const { emailReady } = require('../services/notify');
  const has = (k) => !!process.env[k];
  const bank = billing.operatorBank();
  res.json({
    // Configured or not — key values are never sent.
    integrations: [
      { key: 'resend', ok: has('RESEND_API_KEY') },
      { key: 'feedback_email', ok: has('RESEND_API_KEY') && has('FEEDBACK_TO_EMAIL') },
      { key: 'player_email', ok: emailReady() },
      { key: 'feedback_webhook', ok: has('FEEDBACK_WEBHOOK_URL') },
      { key: 'plan_bank', ok: !!(bank.bank_code && bank.bank_account) },
      { key: 'cors', ok: has('CORS_ORIGIN') },
    ],
    migrations: { ok: schema.ok, missing: schema.missing_migrations, all: [...new Set(PROBES.map((p) => p.migration))].sort() },
    settings: await appSettings.all(),
    owners: owner.ownerEmails().length,
  });
}));

// Send a test email to the signed-in owner (Resend).
router.post('/system/test-email', wrap(async (req, res) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw fail(409, 'RESEND_API_KEY is not set on the server.', 'not_configured');
  const from = process.env.FEEDBACK_FROM_EMAIL || process.env.NOTIFY_FROM_EMAIL || 'Pickleball Manager <onboarding@resend.dev>';
  const r = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [req.hostEmail], subject: 'Pickleball Manager — email thử', text: 'Email gửi thử từ Trang Owner. Nếu bạn nhận được thư này, cấu hình Resend đang hoạt động.' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw fail(502, `Resend answered ${r.status}.`, 'send_failed');
  res.json({ sent: true, to: req.hostEmail });
}));

router.patch('/settings/:key', wrap(async (req, res) => {
  const key = req.params.key;
  if (!(key in appSettings.KEYS)) throw fail(404, 'Unknown setting.');
  const before = (await appSettings.all())[key]?.value;
  await appSettings.set(key, req.body?.value, req.hostEmail);
  await owner.audit(req, { action: 'setting.update', oldValue: { [key]: before }, newValue: { [key]: req.body.value } });
  res.json((await appSettings.all())[key]);
}));

// ---- Promo codes ------------------------------------------------------------------

const PROMO_KINDS = ['percent', 'trial'];
const PROMO_APPLIES = ['any', 'tier', 'social_manager'];

function cleanPromo(b, partial = false) {
  const out = {};
  if (!partial) {
    out.code = promo.normalize(b.code);
    if (!/^[A-Z0-9_-]{3,32}$/.test(out.code)) throw fail(400, 'Code: 3–32 letters, digits, - or _.', 'bad_code');
    if (!PROMO_KINDS.includes(b.kind)) throw fail(400, 'kind must be percent or trial.');
    out.kind = b.kind;
    if (b.kind === 'percent') {
      const pct = Number(b.percent);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw fail(400, 'percent must be 1–100.');
      out.percent = pct;
      out.applies_to = PROMO_APPLIES.includes(b.applies_to) ? b.applies_to : 'any';
      out.first_order_only = b.first_order_only === true;
    } else {
      if (!TIERS.includes(b.trial_tier) || b.trial_tier === 'free') throw fail(400, 'trial_tier must be a paid plan.');
      const days = Number(b.trial_days);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw fail(400, 'trial_days must be 1–365.');
      Object.assign(out, { trial_tier: b.trial_tier, trial_days: days });
    }
  }
  if ('expires_on' in b) {
    if (b.expires_on && !YMD.test(String(b.expires_on))) throw fail(400, 'expires_on must be YYYY-MM-DD.');
    out.expires_on = b.expires_on || null;
  }
  if ('max_uses' in b) {
    const n = b.max_uses === null || b.max_uses === '' ? null : Number(b.max_uses);
    if (n !== null && (!Number.isInteger(n) || n < 1)) throw fail(400, 'max_uses must be a positive number or empty.');
    out.max_uses = n;
  }
  if ('note' in b) out.note = String(b.note || '').trim().slice(0, 300) || null;
  if (partial && 'active' in b) out.active = b.active === true;
  return out;
}

router.get('/promos', wrap(async (req, res) => {
  const [codes, uses] = await Promise.all([
    fetchAll(() => supabase.from('promo_codes').select('*').order('created_at', { ascending: false })),
    fetchAll(() => supabase.from('promo_redemptions').select('code_id, discount_amount, payment_id').order('code_id')),
  ]);
  const paidIds = new Set();
  const withPay = uses.filter((u) => u.payment_id).map((u) => u.payment_id);
  if (withPay.length) {
    const { data } = await supabase.from('plan_payments').select('id').in('id', withPay).eq('status', 'paid');
    for (const o of data || []) paidIds.add(o.id);
  }
  const today = S.vnYmd(new Date());
  res.json(codes.map((c) => {
    const mine = uses.filter((u) => u.code_id === c.id);
    return {
      ...c,
      uses: mine.length,
      paid_uses: mine.filter((u) => u.payment_id && paidIds.has(u.payment_id)).length,
      discount_given: mine.filter((u) => paidIds.has(u.payment_id)).reduce((n, u) => n + Number(u.discount_amount || 0), 0),
      state: !c.active ? 'off' : c.expires_on && c.expires_on < today ? 'expired' : c.max_uses && mine.length >= c.max_uses ? 'used_up' : 'live',
    };
  }));
}));

router.get('/promos/:id/redemptions', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Code not found.');
  const { data, error } = await supabase.from('promo_redemptions').select('id, host_id, payment_id, discount_amount, created_at').eq('code_id', req.params.id).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const ids = [...new Set(data.map((r) => r.host_id))];
  const pays = data.filter((r) => r.payment_id).map((r) => r.payment_id);
  const [{ data: users }, { data: orders }] = await Promise.all([
    ids.length ? supabase.from('users').select('id, email').in('id', ids) : { data: [] },
    pays.length ? supabase.from('plan_payments').select('id, ref, status, amount').in('id', pays) : { data: [] },
  ]);
  const emailOf = new Map((users || []).map((u) => [u.id, u.email]));
  const orderOf = new Map((orders || []).map((o) => [o.id, o]));
  res.json(data.map((r) => ({ ...r, email: emailOf.get(r.host_id) || null, order: orderOf.get(r.payment_id) || null })));
}));

router.post('/promos', wrap(async (req, res) => {
  const row = cleanPromo(req.body || {});
  const { data, error } = await supabase.from('promo_codes').insert({ ...row, created_by: req.hostEmail }).select().single();
  if (error) {
    if (error.code === '23505') throw fail(409, 'This code already exists.', 'code_taken');
    throw error;
  }
  await owner.audit(req, { action: 'promo.create', newValue: { code: data.code, kind: data.kind, percent: data.percent, trial_tier: data.trial_tier, trial_days: data.trial_days, expires_on: data.expires_on, max_uses: data.max_uses, first_order_only: data.first_order_only }, note: data.note });
  res.status(201).json(data);
}));

router.patch('/promos/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'Code not found.');
  const { data: before } = await supabase.from('promo_codes').select('*').eq('id', req.params.id).maybeSingle();
  if (!before) throw fail(404, 'Code not found.');
  const patch = cleanPromo(req.body || {}, true);
  if (!Object.keys(patch).length) throw fail(400, 'Nothing to change.');
  const { data, error } = await supabase.from('promo_codes').update(patch).eq('id', before.id).select().single();
  if (error) throw error;
  const keys = Object.keys(patch);
  await owner.audit(req, { action: 'promo.update', oldValue: Object.fromEntries(keys.map((k) => [k, before[k]])), newValue: Object.fromEntries(keys.map((k) => [k, data[k]])), note: data.code });
  res.json(data);
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
  if (order.promo_code_id) await require('../services/promo').release([order.id]).catch(() => {});
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
