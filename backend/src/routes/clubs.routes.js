const crypto = require('crypto');
const express = require('express');
const { assertCanCreateClub, requireFeature, assertMemberRoom, forgetPlan, getPlan, memberRoom, planView, kindOf } = require('../services/plan');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { todayYmd, rangeFor, summarize, syncMembershipTxn } = require('../services/memberships');
const inventoryStore = require('../services/inventoryStore');
const { clubStats } = require('../services/clubStats');
const birthdays = require('../services/birthdays');
const { guestsReady, discountReady, guestStats, PERKS } = require('../services/guests');
const { extrasReady, cleanExtras } = require('../services/memberExtras');
const { phoneLinkReady } = require('../services/phoneLink');
const { completeFinished } = require('../services/eventStatus');
const { setAttendance } = require('../services/attendance');
const { SPORTS, sportReady, cleanLevel } = require('../services/sport');
const { clubAccess, coAdminClubs, ownerOnly, ROLE_FORBIDDEN } = require('../services/clubAccess');
const {
  localDate,
  winnerTeam,
  isScored,
} = require('../services/stats');

const { dedupe } = require('../services/memberDedupe');
const router = express.Router();
const moderation = require('../services/moderation');
const TIERS = ['vip', 'standard'];

// 402 from the plan checks (member_limit / feature_locked), else a normal error.
function planError(res, err) {
  if (err.status === 402) return res.status(402).json({ error: err.message, code: err.code, limit: err.limit, used: err.used, member_type: err.member_type, feature: err.feature, min_tier: err.min_tier, kind: err.kind });
  return res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong.' });
}
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
    if (!access) return req.roleForbidden ? res.status(403).json(ROLE_FORBIDDEN) : notFound(res, 'Club');
    req.club = access.club;
    req.clubRole = access.role; // owner / co_admin / finance / operator
    req.clubGroups = access.groups ?? null; // permission groups (null = everything)
    if (access.role !== 'owner') {
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
    const all = [...data.map((c) => ({ ...c, role: 'owner' })), ...shared.filter((c) => c.host_id !== req.hostId)];
    // Each club carries its owner's plan features, so the menu locks the right pages.
    // A community carries its owner's Social Manager plan, a club the Club plan.
    const plans = {};
    for (const h of [...new Set(all.map((c) => c.host_id))]) plans[h] = await getPlan(h);
    const pick = (v) => ({ kind: v.kind, tier: v.tier, no_plan: v.no_plan, paid_until: v.paid_until, features: v.features, limits: v.limits, features_enforced: v.features_enforced, addons: v.addons });
    res.json(all.map((c) => ({ ...c, plan: pick(planView(plans[c.host_id], kindOf(c))) })));
  } catch (err) {
    dbError(res, err);
  }
});

router.post('/', async (req, res) => {
  // New clubs go through a request the app owner approves (POST /api/host/club-requests),
  // so nobody can open a club to scam players. The owner can switch this off.
  if (await require('../services/appSettings').clubApproval()) {
    return res.status(403).json({ error: 'New clubs are created by sending a club request for approval.', code: 'club_request_required' });
  }
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  // The sport is picked once, when the club is created.
  const sport = req.body.sport || 'pickleball';
  if (!SPORTS.includes(sport)) return res.status(400).json({ error: `sport must be one of ${SPORTS.join(', ')}.` });
  if (sport !== 'pickleball' && !(await sportReady())) return res.status(409).json({ error: 'Run migration 20261012090000_multi_sport_badminton.sql first.' });
  try {
    await assertCanCreateClub(req.hostId, req.body.kind === 'community' ? 'community' : 'club');
  } catch (err) {
    return res.status(err.status).json({ error: err.message, code: err.code, plan: err.plan });
  }
  const { data, error } = await supabase
    .from('clubs')
    .insert({ host_id: req.hostId, name, description: description || null, ...(sport !== 'pickleball' ? { sport } : {}), ...(req.body.kind === 'community' ? { kind: 'community' } : {}) })
    .select()
    .single();
  if (error) return dbError(res, error);
  forgetPlan(req.hostId); // a first club starts the trial
  res.status(201).json(data);
});

// The club, with what its owner's plan allows (a co-admin works under the owner's plan)
// and how many official / guest places are left.
router.get('/:clubId', async (req, res) => {
  try {
    const plan = planView(await getPlan(req.club.host_id), kindOf(req.club));
    res.json({
      ...req.club,
      role: req.clubRole || 'owner',
      groups: req.clubGroups ?? null,
      plan: { kind: plan.kind, tier: plan.tier, no_plan: plan.no_plan, paid_until: plan.paid_until, features: plan.features, limits: plan.limits, features_enforced: plan.features_enforced, addons: plan.addons },
      member_room: await memberRoom(req.club),
    });
  } catch (err) {
    dbError(res, err);
  }
});

// The monthly fund worksheet: known numbers only (whole, >= 0), a few guest price rows.
const CALC_NUMBERS = ['rate_per_hour', 'hours_per_session', 'sessions_per_month', 'discount_pct', 'water', 'members', 'round_to', 'carry_sessions', 'balls_per_session', 'ball_price'];
function cleanFundCalc(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw Object.assign(new Error('fund_calc must be an object.'), { status: 400 });
  const out = {};
  for (const k of CALC_NUMBERS) {
    if (v[k] === '' || v[k] == null) continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1e10) throw Object.assign(new Error(`fund_calc.${k} must be a number, 0 or more.`), { status: 400 });
    out[k] = k === 'hours_per_session' ? Math.round(n * 100) / 100 : Math.round(n);
  }
  if (out.discount_pct > 100) throw Object.assign(new Error('fund_calc.discount_pct is at most 100.'), { status: 400 });
  out.guest_slots = (Array.isArray(v.guest_slots) ? v.guest_slots : []).slice(0, 10).map((g) => ({
    label: String(g?.label ?? '').trim().slice(0, 40),
    price: Math.max(0, Math.min(1e9, Math.round(Number(g?.price) || 0))),
  }));
  return out;
}

router.patch('/:clubId', async (req, res) => {
  const fields = pick(req.body, ['name', 'description', 'allow_join', 'join_note', 'bank_code', 'bank_account', 'bank_holder', 'guest_vip_discount', 'fund_calc', 'invite_enabled']);
  if ('invite_enabled' in fields) fields.invite_enabled = !!fields.invite_enabled;
  // The club's profile in the club search (where, when, how big, listed or not).
  const PROFILE = ['country', 'province', 'district', 'address', 'map_url', 'schedule', 'contact_email', 'member_count', 'is_listed'];
  if (PROFILE.some((k) => k in (req.body || {}))) {
    const CR = require('../services/clubRequests');
    if (!(await CR.ready())) return res.status(409).json({ error: `Run migration ${CR.MIGRATION} first.` });
    try {
      const p = CR.cleanProfile(req.body, { partial: true });
      delete p.description;
      if ('map_url' in p && !(await CR.mapReady())) delete p.map_url;
      if ('member_count' in p) {
        p.member_count_hint = p.member_count;
        delete p.member_count;
      }
      Object.assign(fields, p);
      if ('is_listed' in req.body) fields.is_listed = !!req.body.is_listed;
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  }
  if ('name' in fields) {
    fields.name = String(fields.name ?? '').trim().slice(0, 80);
    if (!fields.name) return res.status(400).json({ error: 'name is required.' });
  }
  if ('fund_calc' in fields) {
    try {
      fields.fund_calc = cleanFundCalc(fields.fund_calc);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }
    const { error: probe } = await supabase.from('clubs').select('fund_calc').limit(1);
    if (probe) return res.status(409).json({ error: 'Run migration 20261022090000_club_fund_calculator.sql first.' });
  }
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

// The club's avatar / cover picture (small data URLs; null removes one). Shown in the
// club search and on the club's page.
router.put('/:clubId/images', ownerOnly, async (req, res) => {
  const CR = require('../services/clubRequests');
  try {
    if (!(await CR.ready())) return res.status(409).json({ error: `Run migration ${CR.MIGRATION} first.` });
    const patch = {};
    if ('avatar' in req.body) patch.avatar = CR.cleanImage(req.body.avatar, CR.MAX_AVATAR, 'The avatar');
    if ('cover' in req.body) patch.cover = CR.cleanImage(req.body.cover, CR.MAX_COVER, 'The cover picture');
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Send avatar and/or cover.' });
    const { error } = await supabase.from('club_images').upsert({ club_id: req.club.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'club_id' });
    if (error) throw error;
    const bump = (k) => (patch[k] ? (Number(req.club[`${k}_version`]) || 0) + 1 : null);
    const versions = {};
    if ('avatar' in patch) versions.avatar_version = bump('avatar');
    if ('cover' in patch) versions.cover_version = bump('cover');
    const { data, error: uErr } = await supabase.from('clubs').update(versions).eq('id', req.club.id).select().single();
    if (uErr) throw uErr;
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    dbError(res, err);
  }
});

// What deleting the club would remove (shown to the Host before they confirm).
// Clubs and communities are deleted only by the app owner (Trang Owner → Host → 🗑 Xoá,
// routes/owner.routes.js). Hosts and co-admins get a clear refusal.
const OWNER_DELETES = { error: 'Only the app owner can delete a club or community. Contact the developer.', code: 'owner_only_delete' };
router.get('/:clubId/delete-preview', (req, res) => res.status(403).json(OWNER_DELETES));
router.delete('/:clubId', (req, res) => res.status(403).json(OWNER_DELETES));

// ---- One-off kèo (made before communities) -> into this community -------------------
// The Host's old Xé Vé kèo (no club) move into one of their communities: the kèo, its
// players, money (linked by event), matches and staff grants all follow the event.
// Meetings / round robin don't exist in communities, so those stay where they are.
const NOT_IN_COMMUNITY = ['meeting', 'challenge'];
async function standaloneOf(hostId) {
  const { data, error } = await supabase.from('events').select('id, title, event_date, start_time, kind, status').eq('host_id', hostId).is('club_id', null).order('event_date', { ascending: false });
  if (error) throw error;
  return data;
}
router.get('/:clubId/standalone-events', ownerOnly, async (req, res) => {
  try {
    const all = await standaloneOf(req.club.host_id);
    const movable = (req.club.kind || 'club') === 'community' ? all.filter((e) => !NOT_IN_COMMUNITY.includes(e.kind)) : [];
    res.json({ events: movable, count: movable.length, kept: all.length - movable.length });
  } catch (err) {
    dbError(res, err);
  }
});
// Body: { event_ids?: [...] } — none = all of them.
router.post('/:clubId/standalone-events/adopt', ownerOnly, async (req, res) => {
  if ((req.club.kind || 'club') !== 'community') return res.status(400).json({ error: 'One-off kèo can only move into a community.', code: 'not_community' });
  const ids = Array.isArray(req.body?.event_ids) ? req.body.event_ids.filter(isUuid) : null;
  if (ids && !ids.length) return res.status(400).json({ error: 'Pick at least one kèo.', code: 'nothing_picked' });
  try {
    let q = supabase.from('events').update({ club_id: req.club.id }).eq('host_id', req.club.host_id).is('club_id', null).not('kind', 'in', `(${NOT_IN_COMMUNITY.join(',')})`);
    if (ids) q = q.in('id', ids);
    const { data, error } = await q.select('id');
    if (error) throw error;
    res.json({ moved: data.length });
  } catch (err) {
    dbError(res, err);
  }
});

// ---- Members CRUD -------------------------------------------------------------
router.get('/:clubId/members', async (req, res) => {
  // A community moves members between regular and drop-in by its own rule (at most every
  // 10 minutes); its level (trình độ) is worked out from the Host's settings.
  const CS = require('../services/communitySettings');
  const community = (req.club.kind || 'club') === 'community';
  // One person, one row: same-name duplicates are merged first (at most once a minute).
  await dedupe(req.club);
  if (community) await CS.reclassify(req.club).catch((err) => console.error('reclassify failed', err));
  const settings = community ? await CS.forClub(req.club.id).catch(() => null) : null;
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
  // Two DUPR columns: the rating DUPR gave (linked, with its date) and the one the player typed
  // themselves (their profile; without an account, the level on the record while not linked).
  const userIds = [...new Set(data.map((m) => m.user_id).filter(Boolean))];
  const { data: profs } = userIds.length ? await supabase.from('player_profiles').select('user_id, dupr_level').in('user_id', userIds) : { data: [] };
  const selfOf = new Map((profs || []).map((p) => [p.user_id, p.dupr_level]));
  const rows = data.map(({ users, ...m }) => ({
    ...m,
    dupr_linked: m.dupr_synced_at && m.dupr_doubles != null ? Number(m.dupr_doubles) : null,
    dupr_linked_at: m.dupr_synced_at && m.dupr_doubles != null ? m.dupr_synced_at : null,
    dupr_manual: !m.dupr_synced_at && m.dupr_doubles != null ? Number(m.dupr_doubles) : null, // typed by the Host from the DUPR app
    dupr_self: m.user_id && selfOf.get(m.user_id) != null ? Number(selfOf.get(m.user_id)) : !m.dupr_synced_at && m.dupr_doubles == null && m.dupr_level != null ? Number(m.dupr_level) : null,
    account_email: users?.email || null,
    ...summarize(passes.filter((p) => p.club_member_id === m.id), today),
    ...(m.member_type === 'guest' ? { guest_stats: stats[m.id] || { played: 0, last_played: null, paid_cancels: 0, last_cancel: null } } : {}),
    ...(settings && settings.levels.mode !== 'none' ? { level: CS.levelOf(m, settings) } : {}),
  }));
  // Operations staff see basic info only: no phone, email, birthday, notes or money.
  if (['finance', 'operator'].includes(req.clubRole) && !(req.clubGroups || []).includes('finance_view')) {
    const BASIC = ['id', 'club_id', 'full_name', 'member_type', 'tier', 'dupr_level', 'gender', 'is_active', 'joined_on', 'user_id', 'account_verified', 'guest_perk', 'created_at', 'dupr_linked', 'dupr_linked_at', 'dupr_manual', 'dupr_self', 'membership_state', 'vip_stars', 'current_period', 'sessions_unlimited', 'sessions_remaining', 'level', 'level_key', 'skill_score', 'newcomer_until'];
    return res.json(rows.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => BASIC.includes(k)))));
  }
  res.json(rows);
});

// Members join with their own account only (invite link, join request, event sign-up), so
// one person is one record: the Host cannot type people in or import them. Seed / test
// data can still be added with ALLOW_MANUAL_MEMBERS=true.
const ACCOUNT_ONLY = { error: 'Members join with their own account (invite link or join request); they cannot be added by hand.', code: 'account_only' };
function accountOnly(req, res, next) {
  if (process.env.ALLOW_MANUAL_MEMBERS === 'true') return next();
  return res.status(403).json(ACCOUNT_ONLY);
}

router.post('/:clubId/members', accountOnly, checkCapacity(), async (req, res) => {
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
  // "---" (not decided yet): the person goes to the waiting list; the type is picked
  // when they are approved (and only then takes a place in the plan).
  const waiting = member_type === 'waiting';
  // "---": straight into "Xem xét thêm" until the Host decides (needs the moderation migration).
  const undecided = member_type === 'review' && (await moderation.ready());
  const nextType = member_type === 'guest' || undecided ? 'guest' : 'fixed';
  if (tier && (nextType !== 'fixed' || waiting)) tier = null; // guests are never tiered
  try {
    if (!waiting && !undecided) await assertMemberRoom(req.club, nextType);
  } catch (err) {
    return planError(res, err);
  }
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
      ...(waiting ? { join_requested: true, account_verified: false, join_requested_at: new Date().toISOString(), ...((await moderation.ready()) ? { join_source: 'manual' } : {}) } : {}),
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  if (undecided) {
    try {
      return res.status(201).json(await moderation.hold(req.club, data, req.hostEmail));
    } catch (err) {
      return dbError(res, err);
    }
  }
  res.status(201).json(data);
});

// ---- To review (Xem xét thêm), removal, blocks and their history ------------------------
const moderationGuard = async (res) => {
  if (await moderation.ready()) return true;
  res.status(409).json({ error: `Run migration ${moderation.MIGRATION} first.`, code: 'migration_required' });
  return false;
};
const modFail = (res, err) => (err.status ? res.status(err.status).json({ error: err.message, code: err.code, ...(err.limit != null ? { limit: err.limit } : {}) }) : dbError(res, err));

router.post('/:clubId/members/:memberId/review', async (req, res) => {
  try {
    if (!(await moderationGuard(res))) return;
    res.json(await moderation.review(req.club, req.member, req.body || {}, req.hostEmail));
  } catch (err) {
    modFail(res, err);
  }
});

router.post('/:clubId/members/:memberId/restore', async (req, res) => {
  try {
    if (!(await moderationGuard(res))) return;
    res.json(await moderation.restore(req.club, req.member, req.body || {}, req.hostEmail));
  } catch (err) {
    if (err.status === 402) return planError(res, err);
    modFail(res, err);
  }
});

router.post('/:clubId/members/:memberId/remove', async (req, res) => {
  try {
    if (!(await moderationGuard(res))) return;
    res.json(await moderation.remove(req.club, req.member, req.body || {}, req.hostEmail));
  } catch (err) {
    modFail(res, err);
  }
});

// The club's moderation history (kept across owners) and who is blocked now.
router.get('/:clubId/moderation', async (req, res) => {
  try {
    if (!(await moderationGuard(res))) return;
    const [log, blocks] = await Promise.all([moderation.history(req.club, { page: parseInt(req.query.page, 10) || 1 }), moderation.blocksOf(req.club)]);
    res.json({ ...log, blocks });
  } catch (err) {
    modFail(res, err);
  }
});

router.delete('/:clubId/blocks/:blockId', async (req, res) => {
  if (!isUuid(req.params.blockId)) return notFound(res, 'Block');
  try {
    if (!(await moderationGuard(res))) return;
    res.json(await moderation.unblock(req.club, req.params.blockId, req.hostEmail));
  } catch (err) {
    modFail(res, err);
  }
});

// Bulk import (used by "Import from Club" on the event side, or CSV-style add)
router.post('/:clubId/members/bulk', accountOnly, async (req, res) => {
  const rows = Array.isArray(req.body.members) ? req.body.members : [];
  if (!rows.length) return res.status(400).json({ error: 'members[] is required.' });

  const { willExceed, allowed, usage } = await limitBody(req.hostId, rows.length);
  if (willExceed) {
    return res.status(403).json({
      error: `Only ${allowed} more people fit on the ${usage.tier} plan (${usage.used}/${usage.capacity_limit} used).`,
      usage,
    });
  }

  try {
    const n = (type) => rows.filter((r) => (r.member_type === 'guest' ? 'guest' : 'fixed') === type).length;
    await assertMemberRoom(req.club, 'fixed', n('fixed'));
    await assertMemberRoom(req.club, 'guest', n('guest'));
  } catch (err) {
    return planError(res, err);
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
    // Clubs: perks are for guests. Communities: any player can be a "khách ưu tiên".
    if (fields.guest_perk && (fields.member_type || req.member.member_type) !== 'guest' && (req.club.kind || 'club') !== 'community') {
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
  // Level picked by hand (communities whose levels are named by the Host).
  if ('level_key' in req.body) {
    const CS = require('../services/communitySettings');
    if (await CS.ready()) {
      const key = req.body.level_key || null;
      const settings = await CS.forClub(req.club.id);
      if (key && !(settings.levels.mode === 'manual' && settings.levels.items.some((i) => i.key === key))) {
        return res.status(400).json({ error: 'Unknown level.', code: 'bad_level' });
      }
      fields.level_key = key;
    }
  }
  // Điểm trình: the Host's own score for the player (not DUPR). Empty clears it.
  if ('skill_score' in req.body) {
    const { schemaStatus } = require('../services/schemaCheck');
    if ((await schemaStatus()).missing_migrations.includes('20261204090000_skill_score.sql')) {
      delete fields.skill_score;
    } else {
      const raw = req.body.skill_score;
      const n = raw === '' || raw == null ? null : Number(raw);
      if (n != null && !(Number.isFinite(n) && n >= 1 && n <= 8)) return res.status(400).json({ error: 'Điểm trình must be 1.00–8.00.', code: 'bad_skill_score' });
      fields.skill_score = n == null ? null : Math.round(n * 100) / 100;
    }
  }
  // The Host moved the person to another type by hand: no longer "Người mới".
  if (fields.member_type && fields.member_type !== req.member.member_type && req.member.newcomer_until) fields.newcomer_until = null;
  // Reactivating a member, or moving one to the other type, takes a place on the plan.
  {
    const nextType = fields.member_type === 'guest' ? 'guest' : fields.member_type === 'fixed' ? 'fixed' : req.member.member_type;
    const nextActive = 'is_active' in fields ? fields.is_active !== false : req.member.is_active;
    const takesPlace = nextActive && (!req.member.is_active || nextType !== req.member.member_type);
    if (takesPlace) {
      try {
        await assertMemberRoom(req.club, nextType);
      } catch (err) {
        return planError(res, err);
      }
    }
  }
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
  if (fields.member_type === 'fixed' && req.member.guest_perk && (req.club.kind || 'club') !== 'community' && !('guest_perk' in req.body)) fields.guest_perk = null; // club perks are for guests
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
  // The player's own profile follows what the Host corrects here (confirmed accounts only;
  // an emptied field never wipes the player's own data).
  if (data.user_id && data.account_verified) {
    try {
      await syncProfile(data, fields, req.club.sport);
    } catch (err) {
      console.error('[members] profile sync failed:', err.message);
    }
  }
  res.json(data);
});

async function syncProfile(member, fields, sport) {
  const patch = {};
  if (fields.full_name && String(fields.full_name).trim()) patch.full_name = String(fields.full_name).trim().slice(0, 120);
  if (fields.phone && String(fields.phone).replace(/\D/g, '').length >= 9) patch.phone = String(fields.phone).trim();
  if (fields.gender) patch.gender = fields.gender;
  if (fields.birth_date) Object.assign(patch, { birth_date: fields.birth_date, birth_year: Number(String(fields.birth_date).slice(0, 4)) });
  else if (fields.birth_year) patch.birth_year = fields.birth_year;
  if (fields.dupr_level != null) {
    if ((sport || 'pickleball') === 'badminton') {
      if (await sportReady()) patch.badminton_level = fields.dupr_level;
    } else patch.dupr_level = fields.dupr_level;
  }
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('player_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', member.user_id);
  if (error) throw error;
}

// Waiting list (Danh sách chờ): accounts linked to a member by phone, join requests from the
// event page, and guests who asked to join the fixed team in the after-session survey.
// Players who paid, cancelled with a refund due (100% or 50% under the cancel policy) and still
// wait for their money back (all sessions of the club / community): the overview's "to do" list links to each session.
router.get('/:clubId/refunds-due', async (req, res) => {
  try {
    const { data: evs, error } = await supabase.from('events').select('id, title, event_date, fee_amount').eq('club_id', req.club.id);
    if (error) throw error;
    const ids = (evs || []).map((e) => e.id);
    if (!ids.length) return res.json([]);
    const { refundShare, tiersReady } = require('../services/attendance');
    const { data: rows, error: pErr } = await supabase
      .from('event_participants')
      .select(`id, event_id, full_name, fee_amount, late_cancel, refunded_at${(await tiersReady()) ? ', refund_percent' : ''}`)
      .in('event_id', ids)
      .eq('status', 'cancelled')
      .eq('fee_paid', true)
      .is('refunded_at', null);
    if (pErr) throw pErr;
    const byId = new Map(evs.map((e) => [e.id, e]));
    res.json(
      (rows || [])
        .filter((p) => refundShare(p) > 0) // 100% or 50% back under the cancel policy
        .map((p) => ({ id: p.id, event_id: p.event_id, title: byId.get(p.event_id)?.title, event_date: byId.get(p.event_id)?.event_date, full_name: p.full_name, refund_percent: refundShare(p), amount: Math.round((Number(p.fee_amount ?? byId.get(p.event_id)?.fee_amount ?? 0) * refundShare(p)) / 100) }))
        .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))),
    );
  } catch (err) {
    dbError(res, err);
  }
});

router.get('/:clubId/member-requests', async (req, res) => {
  const ready = await guestsReady();
  const v3 = await require('../services/clubRequests').ready();
  const { data, error } = await supabase
    .from('club_members')
    .select(
      `id, full_name, phone, gender, birth_year, birth_date, dupr_level, member_type, join_requested, account_verified, user_id, created_at, users(email)${ready ? ', join_requested_at, join_note' : ''}${v3 ? ', join_source' : ''}${(await moderation.ready()) ? ', review_started_at' : ''}`
    )
    .eq('club_id', req.club.id)
    .or('and(account_verified.eq.false,user_id.not.is.null),join_requested.eq.true')
    .order('created_at', { ascending: true });
  if (error) return dbError(res, error);
  const { data: profiles } = data.length
    ? await supabase.from('player_profiles').select('user_id, full_name, phone').in('user_id', data.map((m) => m.user_id))
    : { data: [] };
  // Their past here (removed / reviewed before, blocked now): so a new manager knows.
  const visible = data.filter((m) => !m.review_started_at);
  const past = await moderation
    .pastOf(req.club, visible.map((m) => {
      const p = (profiles || []).find((x) => x.user_id === m.user_id);
      return { key: m.id, user_id: m.user_id, phone: p?.phone || m.phone };
    }))
    .catch(() => ({}));
  // Waiting requests that look like a member the Host typed in: offered for merging.
  const accountNames = visible.map((m) => ({ ...m, account_name: (profiles || []).find((x) => x.user_id === m.user_id)?.full_name || null }));
  const matches = (await require('../services/memberLink').ready()) ? await require('../services/memberLink').matchesFor(req.club.id, accountNames).catch(() => ({})) : {};
  res.json(
    visible.map(({ users, ...m }) => {
      const p = (profiles || []).find((x) => x.user_id === m.user_id);
      // search = asked from the club search; invite = through the invite link; manual = added
      // by the Host with type "---"; survey = guest asked in the after-session survey;
      // request = "I'm a member" with no match; link = phone matched
      const source = ['search', 'manual', 'invite'].includes(m.join_source) ? m.join_source : m.join_requested_at ? 'survey' : m.join_requested ? 'request' : 'link';
      return { ...m, source, account_email: users?.email || null, account_name: p?.full_name || null, account_phone: p?.phone || null, past: past[m.id] || null, matches: matches[m.id] || [] };
    })
  );
});

// Approve: the Host also picks the membership type (fixed by default for join requests).
router.post('/:clubId/members/:memberId/approve', async (req, res) => {
  const m = req.member;
  if (!m.user_id && !m.join_requested) return res.status(400).json({ error: 'No player account is linked to this member.' });
  const patch = { join_requested: false };
  if (m.user_id) patch.account_verified = true;
  // Not decided yet ("---"): the person stays in the waiting list until the Host picks a type.
  // Communities also have "new" (Người mới): a drop-in for their first 30 days.
  const CS = require('../services/communitySettings');
  const asNew = req.body?.member_type === 'new' && (req.club.kind || 'club') === 'community' && (await CS.newcomersReady());
  if (m.join_requested && !['fixed', 'guest'].includes(req.body?.member_type) && !asNew) {
    return res.status(400).json({ error: 'Pick a type (fixed, guest or new) to approve; until then they stay in the waiting list.', code: 'type_required' });
  }
  if (m.join_requested) {
    const type = req.body?.member_type === 'fixed' ? 'fixed' : 'guest';
    if (asNew) patch.newcomer_until = CS.newcomerUntil();
    else if (await CS.newcomersReady()) patch.newcomer_until = null;
    // Joining (or moving to another type) takes a place within the plan's limits.
    try {
      await assertMemberRoom(req.club, type, m.is_active && m.member_type === type ? 0 : 1);
    } catch (err) {
      return planError(res, err);
    }
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
  // Accepted: if this is someone the club already has (same name, nothing telling them
  // apart), the two rows become one.
  const merged = (await dedupe(req.club, { force: true })).find((d) => d.merged === data.id);
  if (merged) {
    const { data: kept } = await supabase.from('club_members').select('*').eq('id', merged.into).maybeSingle();
    return res.json({ ...(kept || data), merged_from: data.id });
  }
  res.json(data);
});

// Not our member: a new join request is removed; a link to an existing member is undone.
router.post('/:clubId/members/:memberId/reject', async (req, res) => {
  const m = req.member;
  // Asked from the club search and never played here: the record made for the request goes.
  if (m.join_requested && m.join_source === 'search' && m.member_type === 'guest') {
    const { count } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('guest_member_id', m.id);
    if (!count) {
      const { error } = await supabase.from('club_members').delete().eq('id', m.id);
      if (error) return dbError(res, error);
      return res.json({ removed: true });
    }
  }
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

// ---- Link a player account to a member the Host typed in (phone did not match) -------------
const memberLink = require('../services/memberLink');
const linkFail = (res, err) => (err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err));
router.get('/:clubId/members/:memberId/link', async (req, res) => {
  try {
    res.json(await memberLink.status(req.member));
  } catch (err) {
    linkFail(res, err);
  }
});
// A personal link for this member (shown once; a new one replaces the old).
router.post('/:clubId/members/:memberId/link', async (req, res) => {
  try {
    res.status(201).json(await memberLink.createLink(req.club, req.member, req.userId));
  } catch (err) {
    linkFail(res, err);
  }
});
// Name the player's account (username or email); they confirm it on their side.
router.post('/:clubId/members/:memberId/link-request', async (req, res) => {
  try {
    res.status(201).json(await memberLink.requestByLogin(req.club, req.member, req.body?.login, req.userId));
  } catch (err) {
    linkFail(res, err);
  }
});
router.delete('/:clubId/members/:memberId/link', async (req, res) => {
  try {
    res.json(await memberLink.cancel(req.member));
  } catch (err) {
    linkFail(res, err);
  }
});
// Merge a waiting join request into the member the Host already had (one person, one row).
router.post('/:clubId/members/:memberId/merge', async (req, res) => {
  try {
    res.json(await memberLink.mergeInto(req.club, req.member, req.body?.into, { any: req.body?.any === true }));
  } catch (err) {
    linkFail(res, err);
  }
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

// A session pack: N sessions valid for M months from the day it starts (validity_months);
// otherwise a month / quarter / year period plan.
function cleanValidity(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!(Number.isInteger(n) && n >= 1 && n <= 36)) throw Object.assign(new Error('validity_months must be a whole number of months from 1 to 36.'), { status: 400, code: 'bad_validity' });
  return n;
}

router.post('/:clubId/plans', requireFeature('membership_plans'), async (req, res) => {
  const { name, price, sessions_included } = req.body;
  let validity;
  try {
    validity = cleanValidity(req.body.validity_months);
  } catch (err) {
    return res.status(400).json({ error: err.message, code: err.code });
  }
  const period = validity ? req.body.period || 'month' : req.body.period; // a pack has no period; the column needs a value
  if (!name || !period || price == null) {
    return res.status(400).json({ error: 'name, period, and price are required.' });
  }
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: 'period must be month, quarter, or year.' });
  }
  if (!(Number(price) >= 0) || !(Number(sessions_included || 0) >= 0)) {
    return res.status(400).json({ error: 'price and sessions_included must be >= 0.' });
  }
  if (validity && !(Math.floor(Number(sessions_included)) >= 1)) {
    return res.status(400).json({ error: 'A session pack needs at least 1 session.', code: 'sessions_required' });
  }
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({ club_id: req.club.id, name, period, price: Number(price), sessions_included: Math.floor(Number(sessions_included || 0)), ...(validity ? { validity_months: validity } : {}) })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// Edit a plan. Periods already registered keep their dates and amounts; the new
// period / price apply to the next registrations.
router.patch('/:clubId/plans/:planId', requireFeature('membership_plans'), async (req, res) => {
  const fields = pick(req.body, ['name', 'period', 'price', 'sessions_included', 'is_active', 'validity_months']);
  if ('validity_months' in fields) {
    try {
      fields.validity_months = cleanValidity(fields.validity_months);
    } catch (err) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
  }
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
  const pack = 'validity_months' in fields ? fields.validity_months : req.plan.validity_months;
  if (pack && !((('sessions_included' in fields) ? fields.sessions_included : req.plan.sessions_included) >= 1)) {
    return res.status(400).json({ error: 'A session pack needs at least 1 session.', code: 'sessions_required' });
  }
  const { data, error } = await supabase.from('membership_plans').update(fields).eq('id', req.plan.id).select().single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Register a member for `count` consecutive periods of a plan, starting at `start_month` (YYYY-MM).
// e.g. monthly plan, start 2026-08, count 3 -> Aug, Sep, Oct.
router.post('/:clubId/members/:memberId/memberships', requireFeature('membership_plans'), async (req, res) => {
  const { plan_id, status } = req.body;
  let count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 12);
  if (!isUuid(plan_id)) return res.status(400).json({ error: 'plan_id is required.' });
  const { data: plan, error: planErr } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('id', plan_id)
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (planErr) return dbError(res, planErr);
  if (!plan) return notFound(res, 'Plan');
  // Clubs: guests buy single tickets; plans are for the fixed team. Communities: anyone can
  // hold a pack ("khách VIP").
  if (req.member.member_type !== 'fixed' && (req.club.kind || 'club') !== 'community') {
    return res.status(400).json({ error: 'Membership plans are for fixed members only.', code: 'fixed_only' });
  }

  const amount = req.body.amount != null && req.body.amount !== '' ? Number(req.body.amount) : Number(plan.price);
  if (plan.validity_months) count = 1; // a pack is bought once (from a day, for N months)
  let ranges;
  try {
    ranges = Array.from({ length: count }, (_, i) => rangeFor(plan, req.body, i));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const rows = ranges.map((range) => ({
    club_member_id: req.member.id,
    plan_id: plan.id,
    ...range,
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
router.get('/:clubId/stats', requireFeature('rankings'), async (req, res) => {
  try {
    res.json(await clubStats(req.club, req.query));
  } catch (err) {
    dbError(res, err);
  }
});

// ---- Player self-service: join link + payments to confirm -------------------
// Invite link (/invite/<token>): people who open it ask to join; they land in the waiting list.
router.post('/:clubId/invite-token/rotate', async (req, res) => {
  const { data, error } = await supabase.from('clubs').update({ invite_token: crypto.randomUUID() }).eq('id', req.club.id).select().single();
  if (error) return dbError(res, error);
  res.json(data);
});

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

// ---- Inventory (balls & supplies) — shared with the Xé Vé store ----------------
inventoryStore.mount(router, '/:clubId/inventory', (req) => ({ club_id: req.club.id }), requireFeature('ball_inventory'));

// ---- Rankings / fund ------------------------------------------------------
router.get('/:clubId/rankings', requireFeature('rankings'), async (req, res) => {
  const view = req.query.period === 'monthly' ? 'v_club_rankings_monthly' : 'v_club_rankings_all_time';
  const { data, error } = await supabase.from(view).select('*').eq('club_id', req.club.id);
  if (error) return dbError(res, error);
  res.json(data);
});

// Social Manager overview of a community (also works for a club): members per series,
// active / inactive, regular / irregular, money in / out / balance / still owed.
router.get('/:clubId/community-overview', async (req, res) => {
  try {
    res.json(await require('../services/community').overview(req.club));
  } catch (err) {
    dbError(res, err);
  }
});

// ---- Community control panel: regular / drop-in rule, inactive days, levels ----------------
// Top 10 cộng đồng uy tín (services/featured.js): the community pays to be shown, the Owner
// checks it first. Owner of the community only for asking / cancelling.
router.get('/:clubId/featured', async (req, res) => {
  try {
    res.json(await require('../services/featured').forClub(req.club));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});
router.post('/:clubId/featured', ownerOnly, async (req, res) => {
  try {
    await require('../services/featured').request(req.club, req.hostId, req.body?.months, { note: req.body?.note, info: req.body?.info });
    res.status(201).json(await require('../services/featured').forClub(req.club));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code, failing: err.failing, reputation: err.reputation }) : dbError(res, err);
  }
});
router.delete('/:clubId/featured', ownerOnly, async (req, res) => {
  try {
    await require('../services/featured').cancelByHost(req.club);
    res.json(await require('../services/featured').forClub(req.club));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});

const communitySettings = require('../services/communitySettings');
const settingsFail = (res, err) => (err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err));
router.get('/:clubId/community-settings', async (req, res) => {
  try {
    res.json({ ready: await communitySettings.ready(), settings: await communitySettings.forClub(req.club.id), defaults: communitySettings.DEFAULTS, durations: communitySettings.DURATIONS, sport: req.club.sport || 'pickleball', kind: req.club.kind || 'club' });
  } catch (err) {
    settingsFail(res, err);
  }
});
router.put('/:clubId/community-settings', async (req, res) => {
  try {
    const settings = await communitySettings.save(req.club, req.body || {});
    const moved = await communitySettings.reclassify(req.club, { force: settings.regular.auto });
    res.json({ settings, moved });
  } catch (err) {
    settingsFail(res, err);
  }
});
// "Update now": apply the regular / drop-in rule at once (even with auto off).
router.post('/:clubId/community-settings/reclassify', async (req, res) => {
  try {
    if ((req.club.kind || 'club') !== 'community') return res.status(400).json({ error: 'Only communities have this.', code: 'not_community' });
    res.json(await communitySettings.reclassify(req.club, { force: true }));
  } catch (err) {
    settingsFail(res, err);
  }
});

// Thách thức: who wins the challenge matches the Host started from a kèo's rankings —
// matches (scored, not a draw), won, lost, win rate per player across the club's kèo.
router.get('/:clubId/challenge-rankings', async (req, res) => {
  try {
    const { schemaStatus } = require('../services/schemaCheck');
    if ((await schemaStatus()).missing_migrations.includes('20261208090000_event_extras.sql')) return res.json({ ready: false, rows: [] });
    const { data: evs, error: eErr } = await supabase.from('events').select('id').eq('club_id', req.club.id).limit(5000);
    if (eErr) throw eErr;
    const ids = (evs || []).map((e) => e.id);
    const matches = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from('matches')
        .select('id, event_id, team1_score, team2_score, challenge_reward, match_players(team, event_participant_id, event_participants(full_name, source_club_member_id, guest_member_id, user_id))')
        .eq('is_challenge', true)
        .in('event_id', ids.slice(i, i + 150));
      if (error) throw error;
      matches.push(...(data || []));
    }
    const rows = new Map();
    for (const m of matches) {
      if (m.team1_score == null || m.team2_score == null || m.team1_score === m.team2_score) continue;
      const win = m.team1_score > m.team2_score ? 1 : 2;
      for (const mp of m.match_players || []) {
        const ep = mp.event_participants || {};
        const key = ep.source_club_member_id || ep.guest_member_id || (ep.user_id && `u:${ep.user_id}`) || `n:${String(ep.full_name || '').trim().toLowerCase()}`;
        const r = rows.get(key) || { key, name: ep.full_name || '?', played: 0, won: 0, lost: 0, kevs: new Set() };
        r.played += 1;
        if (mp.team === win) r.won += 1;
        else r.lost += 1;
        r.kevs.add(m.event_id);
        rows.set(key, r);
      }
    }
    const out = [...rows.values()]
      .map(({ kevs, ...r }) => ({ ...r, sessions: kevs.size, win_rate: r.played ? Math.round((1000 * r.won) / r.played) / 10 : 0 }))
      .sort((a, b) => b.win_rate - a.win_rate || b.won - a.won || b.played - a.played || a.name.localeCompare(b.name, 'vi'))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    res.json({ ready: true, matches: matches.length, rows: out });
  } catch (err) {
    dbError(res, err);
  }
});

// Social Manager → Thống kê: business numbers of the community (players + money).
router.get('/:clubId/business', async (req, res) => {
  if ((req.club.kind || 'club') !== 'community') return res.status(400).json({ error: 'Communities only.', code: 'not_community' });
  if (!['owner', 'co_admin'].includes(req.clubRole)) return res.status(403).json(ROLE_FORBIDDEN);
  try {
    const biz = require('../services/communityBusiness');
    const [b, reputation] = await Promise.all([biz.business(req.club, req.query.period), biz.reputation(req.club)]);
    res.json({ ...b, reputation });
  } catch (err) {
    dbError(res, err);
  }
});

// Suggestions for the Host: who played more than the rule (→ thường xuyên) or not enough
// (→ vãng lai) in the last 30 days. Nothing moves until the Host says so.
router.get('/:clubId/community-settings/suggestions', async (req, res) => {
  try {
    if ((req.club.kind || 'club') !== 'community' || !(await communitySettings.ready())) return res.json({ up: [], down: [], min: null });
    const { settings, up, down } = await communitySettings.proposals(req.club);
    res.json({ up, down, min: settings.regular.min, auto: settings.regular.auto });
  } catch (err) {
    settingsFail(res, err);
  }
});

router.get('/:clubId/fund', async (req, res) => {
  const { data: balanceRow, error: balErr } = await supabase
    .from('v_club_fund_balance')
    .select('*')
    .eq('club_id', req.club.id)
    .maybeSingle();
  if (balErr) return dbError(res, balErr);

  // The ledger is everything the Host takes in and pays out: the club fund's own entries
  // and the money of every session (fees players paid, court hire…), with the session.
  const [{ data: txns, error: txnErr }, { data: evTxns, error: evErr }] = await Promise.all([
    supabase.from('transactions').select('*').eq('owner_type', 'club').eq('club_id', req.club.id).order('occurred_on', { ascending: false }),
    supabase
      .from('transactions')
      .select('*, events!inner(title, event_date, start_time, kind, club_id)')
      .eq('owner_type', 'event')
      .eq('events.club_id', req.club.id)
      .order('occurred_on', { ascending: false })
      .limit(5000),
  ]);
  if (txnErr) return dbError(res, txnErr);
  if (evErr) return dbError(res, evErr);
  const all = [...txns, ...evTxns.map(({ events, ...t }) => ({ ...t, events: { title: events.title, event_date: events.event_date, start_time: events.start_time, kind: events.kind } }))]
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ balance: balanceRow?.balance || 0, transactions: all });
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
      .neq('kind', 'meeting') // get-togethers are voted on, not play sessions
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
    // Cancelled in time doesn't count at all (they told us). A late cancel or a no-show
    // (didn't tell) counts as a session — red — and uses a pass session.
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
  // Sessions = checked in + cancelled too late + no-show (all count).
  for (const g of guestRows.values()) g.sessions = Object.values(g.events).filter((s) => s === 'attended' || s === 'late' || s === 'absent').length;

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
    gender: genderBreakdown(members, people),
  });
});

// Men / women among the club's active members (by type), and among the people who came in
// the period (one count per person). No gender on record = "unknown".
function genderBreakdown(members, people) {
  const blank = () => ({ male: 0, female: 0, unknown: 0 });
  const g = (v) => (v === 'male' || v === 'female' ? v : 'unknown');
  const out = { members: blank(), fixed: blank(), guest: blank(), came: blank() };
  for (const m of members) {
    if (!m.is_active || m.join_requested) continue;
    out.members[g(m.gender)] += 1;
    out[m.member_type === 'fixed' ? 'fixed' : 'guest'][g(m.gender)] += 1;
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const byUser = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id, m]));
  const seen = new Set();
  for (const p of people) {
    if (p.status !== 'checked_in') continue;
    const m = byId.get(p.source_club_member_id || p.guest_member_id) || (p.user_id && byUser.get(p.user_id)) || null;
    const key = m ? `m:${m.id}` : `p:${String(p.phone || '').replace(/\D/g, '').slice(-9) || String(p.full_name).trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.came[g(m?.gender)] += 1;
  }
  return out;
}

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

// Cuộc đua Top tháng (communities): this month's / a past month's table, settings, vouchers.
const race = require('../services/race');
const raceManager = (req) => ['owner', 'co_admin'].includes(req.clubRole || 'owner');

// Rankings: matches a player needs in the period to get a place (owner / co-admin).
router.put('/:clubId/rank-settings', async (req, res) => {
  if (!raceManager(req)) return res.status(403).json(ROLE_FORBIDDEN);
  const n = Number(req.body?.rank_min_matches);
  if (!Number.isInteger(n) || n < 1 || n > 50) return res.status(400).json({ error: 'rank_min_matches must be 1–50.', code: 'bad_min_matches' });
  const { error } = await supabase.from('clubs').update({ rank_min_matches: n }).eq('id', req.club.id);
  if (error) {
    if (/rank_min_matches|schema cache|does not exist/i.test(error.message || '')) return res.status(409).json({ error: 'Run migration 20261125090000_rank_settings.sql first.', code: 'migration_required' });
    return dbError(res, error);
  }
  res.json({ rank_min_matches: n });
});
router.get('/:clubId/race', async (req, res) => {
  try {
    if (!(await race.ready())) return res.status(409).json({ error: `Run migration ${race.MIGRATION} first.`, code: 'migration_required' });
    res.json(await race.hostView(req.club, req.query.month));
  } catch (err) {
    dbError(res, err);
  }
});
router.patch('/:clubId/race', async (req, res) => {
  try {
    if (!raceManager(req)) return res.status(403).json(ROLE_FORBIDDEN);
    res.json(await race.updateSettings(req.club, req.body || {}));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    dbError(res, err);
  }
});
router.post('/:clubId/race/vouchers/:voucherId', async (req, res) => {
  try {
    if (!raceManager(req)) return res.status(403).json(ROLE_FORBIDDEN);
    if (!isUuid(req.params.voucherId)) return notFound(res, 'Voucher');
    res.json(await race.voucherAction(req.club, req.params.voucherId, req.body || {}));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    dbError(res, err);
  }
});

// ---- DUPR (no partner API): member list import, members' DUPR IDs, match export --------
const dupr = require('../services/dupr');
const duprErr = (res, err) => (err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err));
async function duprGate(req, res) {
  if (!(await dupr.ready())) {
    res.status(409).json({ error: `Run migration ${dupr.MIGRATION} first.`, code: 'migration_required' });
    return false;
  }
  if ((req.club.sport || 'pickleball') !== 'pickleball') {
    res.status(400).json({ error: 'DUPR is for pickleball clubs.', code: 'not_pickleball' });
    return false;
  }
  return true;
}
const ymd = (v, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : fallback);

// Overview: club DUPR ID, members linked, the club's DUPR list size, last import.
router.get('/:clubId/dupr', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    const { data, error } = await supabase.from('club_members').select('dupr_id, dupr_synced_at').eq('club_id', req.club.id);
    if (error) throw error;
    const { count } = await supabase.from('club_dupr_roster').select('dupr_id', { count: 'exact', head: true }).eq('club_id', req.club.id);
    const { data: last } = await supabase.from('club_dupr_imports').select('created_at').eq('club_id', req.club.id).order('created_at', { ascending: false }).limit(1);
    res.json({
      dupr_club_id: req.club.dupr_club_id || null,
      members: (data || []).length,
      linked: (data || []).filter((m) => m.dupr_id && m.dupr_synced_at).length,
      roster_size: count || 0,
      last_sync: last?.[0]?.created_at || null,
    });
  } catch (err) {
    duprErr(res, err);
  }
});
router.patch('/:clubId/dupr', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    if (!['owner', 'co_admin'].includes(req.clubRole || 'owner')) return res.status(403).json(ROLE_FORBIDDEN);
    const v = String(req.body?.dupr_club_id ?? '').trim().slice(0, 40) || null;
    const { error } = await supabase.from('clubs').update({ dupr_club_id: v }).eq('id', req.club.id);
    if (error) throw error;
    res.json({ dupr_club_id: v });
  } catch (err) {
    duprErr(res, err);
  }
});
// The DUPR tab of the members page.
router.get('/:clubId/dupr/members', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    await dedupe(req.club);
    res.json(await dupr.memberBoard(req.club));
  } catch (err) {
    duprErr(res, err);
  }
});
// Import the DUPR Club member export: links members automatically by DUPR ID.
router.post('/:clubId/dupr/import', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    res.json(await dupr.importRoster(req.club, req.body?.csv, req.hostId));
  } catch (err) {
    duprErr(res, err);
  }
});
router.patch('/:clubId/members/:memberId/dupr', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    if (!isUuid(req.params.memberId)) return notFound(res, 'Member');
    res.json(await dupr.setMemberId(req.club, req.params.memberId, req.body?.dupr_id));
  } catch (err) {
    duprErr(res, err);
  }
});
router.patch('/:clubId/members/:memberId/dupr-score', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    if (!isUuid(req.params.memberId)) return notFound(res, 'Member');
    res.json(await dupr.setMemberScore(req.club, req.params.memberId, req.body || {}));
  } catch (err) {
    duprErr(res, err);
  }
});
// DUPR statistics (Thống kê → DUPR): ratings up / down, matches sent or not.
router.get('/:clubId/dupr/stats', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    const months = [1, 3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 3;
    res.json(await dupr.stats(req.club, { months }));
  } catch (err) {
    duprErr(res, err);
  }
});
// Matches of one event (kèo / session) or one tournament — or of a period — ready for DUPR or
// not (and why).
const duprScope = (src) => {
  const o = { all: src.all === '1' || src.all === true };
  if (isUuid(src.event)) o.event = src.event;
  else if (isUuid(src.tournament)) o.tournament = src.tournament;
  else if (src.scope === 'club') o.clubOnly = true;
  else {
    o.from = ymd(src.from, '2000-01-01');
    o.to = ymd(src.to, '2999-12-31');
  }
  return o;
};
router.get('/:clubId/dupr/matches', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    res.json({ matches: await dupr.clubMatches(req.club, duprScope(req.query)) });
  } catch (err) {
    duprErr(res, err);
  }
});
// The CSV in DUPR's import template (ready matches only), optionally limited to `items`.
router.post('/:clubId/dupr/matches/csv', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    const b = req.body || {};
    let list = await dupr.clubMatches(req.club, duprScope(b));
    if (Array.isArray(b.items) && b.items.length) {
      const want = new Set(b.items.map((i) => `${i?.kind}:${i?.id}`));
      list = list.filter((m) => want.has(`${m.kind}:${m.id}`));
    }
    const ready = list.filter((m) => m.ready);
    res.json({ csv: dupr.matchesCsv(req.club, ready, b.score_type === 'RALLY' ? 'RALLY' : 'SIDEOUT'), count: ready.length, items: ready.map((m) => ({ kind: m.kind, id: m.id })) });
  } catch (err) {
    duprErr(res, err);
  }
});
router.post('/:clubId/dupr/matches/mark', async (req, res) => {
  try {
    if (!(await duprGate(req, res))) return;
    res.json(await dupr.markExported(req.club, req.body?.items, req.body?.exported !== false));
  } catch (err) {
    duprErr(res, err);
  }
});

// After-session reviews of this club over the last 3 / 6 / 12 months (every plan).
router.get('/:clubId/surveys', async (req, res) => {
  try {
    const months = [3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 6;
    res.json(await require('../services/survey').clubSurveys(req.club.id, { months, today: todayYmd() }));
  } catch (err) {
    dbError(res, err);
  }
});

// Pro tools: activity log, duty roster, advanced analytics.
require('./clubPro').mount(router);

module.exports = router;
