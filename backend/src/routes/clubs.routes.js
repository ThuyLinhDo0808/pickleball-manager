const crypto = require('crypto');
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { todayYmd, periodRange, summarize, syncMembershipTxn } = require('../services/memberships');
const {
  PERIODS: PERIODS_STATS,
  DEFAULT_MIN_MATCHES,
  localDate,
  periodBounds,
  aggregate,
  awards,
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
  const fields = pick(req.body, ['name', 'description', 'allow_join', 'join_note', 'bank_code', 'bank_account', 'bank_holder']);
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

router.delete('/:clubId', async (req, res) => {
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
  res.json(
    data.map(({ users, ...m }) => ({ ...m, account_email: users?.email || null, ...summarize(passes.filter((p) => p.club_member_id === m.id), today) }))
  );
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
      gender: cleanGender(req.body.gender),
      birth_year: cleanBirthYear(req.body.birth_year),
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
    gender: cleanGender(r.gender),
    birth_year: cleanBirthYear(r.birth_year),
    notes: r.notes || null,
  }));
  const { data, error } = await supabase.from('club_members').insert(payload).select();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

router.patch('/:clubId/members/:memberId', async (req, res) => {
  const fields = pick(req.body, ['full_name', 'phone', 'dupr_level', 'member_type', 'is_active', 'tier', 'notes', 'gender', 'birth_year', 'flags']);
  if ('flags' in fields) fields.flags = (Array.isArray(fields.flags) ? fields.flags : []).filter((f) => FLAGS.includes(f));
  if ('gender' in fields) fields.gender = cleanGender(fields.gender);
  if ('birth_year' in fields) fields.birth_year = cleanBirthYear(fields.birth_year);

  if (fields.tier && !TIERS.includes(fields.tier)) {
    return res.status(400).json({ error: 'tier must be vip or standard.' });
  }
  const effectiveType = fields.member_type || req.member.member_type;
  if (fields.tier && effectiveType !== 'fixed') {
    return res.status(400).json({ error: 'tier can only be set on fixed members.' });
  }
  if (fields.member_type === 'guest') fields.tier = null; // clear tier if downgraded to guest
  if (req.body.unlink_account === true) fields.user_id = null; // detach the player's login

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

router.patch('/:clubId/plans/:planId', async (req, res) => {
  const fields = pick(req.body, ['name', 'price', 'sessions_included', 'is_active']);
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

  try {
    const members = await fetchAll(() =>
      supabase.from('club_members').select('id, full_name, gender').eq('club_id', req.club.id).order('id')
    );

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
          .select('id, played_at, team1_score, team2_score, events!inner(club_id), match_players(team, event_participants(source_club_member_id))')
          .eq('events.club_id', req.club.id)
          .order('id');
        if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
        return q;
      })
    )
      .filter((m) => inRange(localDate(m.played_at)))
      .map((m) => ({
        ...m,
        match_players: m.match_players.map((p) => ({ team: p.team, club_member_id: p.event_participants?.source_club_member_id })),
      }));
    matches.push(...sessionMatches);

    const checkIns = await fetchAll(() => {
      let q = supabase
        .from('event_participants')
        .select('source_club_member_id, event_id, events!inner(club_id, event_date)')
        .eq('status', 'checked_in')
        .not('source_club_member_id', 'is', null)
        .eq('events.club_id', req.club.id)
        .order('id');
      if (bounds) q = q.gte('events.event_date', bounds.from).lte('events.event_date', bounds.to);
      return q;
    });
    const attendance = {};
    const seen = new Set();
    for (const c of checkIns) {
      const key = `${c.source_club_member_id}:${c.event_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attendance[c.source_club_member_id] = (attendance[c.source_club_member_id] || 0) + 1;
    }

    const rankings = aggregate(matches, members);
    res.json({
      period,
      date,
      range: bounds,
      match_count: matches.length,
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
    res.json({ ok: true, confirmed: rows.length });
  } catch (err) {
    dbError(res, err);
  }
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
