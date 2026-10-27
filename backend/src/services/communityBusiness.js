// Social Manager → Thống kê: the business numbers of a community.
//   players: members to date, new per month, regulars, drop-ins, how often regulars play
//            (sessions played / kèo held), return rate (played once → came back)
//   money:   revenue (received + still owed), received, paid out (by category), profit,
//            what players still owe (list), ball durability per ball type
// `period`: 'YYYY-MM', 'YYYY' or 'all'.
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');
const inventoryStore = require('./inventoryStore');
const { counted, excludedCol } = require('./ledgerFilter');

const PLAYED = ['registered', 'checked_in'];
const OWES = ['registered', 'checked_in', 'no_show'];
const EXPENSES = ['court', 'water', 'balls'];

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

function inPeriod(day, period) {
  if (!day) return false;
  if (!period || period === 'all') return true;
  return String(day).startsWith(period);
}

function cleanPeriod(p) {
  const s = String(p || '');
  return /^\d{4}(-\d{2})?$/.test(s) ? s : 'all';
}

// Who a participation belongs to: the community record, else the account, else the phone.
const personOf = (p) => p.source_club_member_id || p.guest_member_id || (p.user_id && `u:${p.user_id}`) || (p.phone && `t:${String(p.phone).replace(/\D/g, '').slice(-9)}`) || null;

async function business(club, rawPeriod) {
  const period = cleanPeriod(rawPeriod);
  const today = todayYmd();
  const [members, events] = await Promise.all([
    all(() => supabase.from('club_members').select('id, member_type, is_active, join_requested, review_started_at, created_at').eq('club_id', club.id).order('id')),
    all(() => supabase.from('events').select('id, title, event_date, fee_amount, status, kind').eq('club_id', club.id).neq('kind', 'meeting').order('id')),
  ]);
  const live = events.filter((e) => e.status !== 'cancelled');
  const held = live.filter((e) => e.event_date <= today);
  const evById = new Map(events.map((e) => [e.id, e]));
  const parts = [];
  const ids = live.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 150) {
    parts.push(...(await all(() => supabase.from('event_participants').select('id, event_id, full_name, phone, status, fee_amount, fee_paid, is_organizer, source_club_member_id, guest_member_id, user_id').in('event_id', ids.slice(i, i + 150)).order('id'))));
  }

  // ---- Players
  const roster = members.filter((m) => m.is_active && !m.join_requested && !m.review_started_at);
  const months = [];
  {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    for (let k = 5; k >= 0; k--) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
      months.push(x.toISOString().slice(0, 7));
    }
  }
  const newByMonth = months.map((m) => ({ month: m, n: members.filter((x) => String(x.created_at).slice(0, 7) === m && !x.join_requested).length }));

  // Sessions each person played (held kèo of the period), and all-time for the return rate.
  const heldInPeriod = held.filter((e) => inPeriod(e.event_date, period));
  const heldIds = new Set(heldInPeriod.map((e) => e.id));
  const heldAll = new Set(held.map((e) => e.id));
  const perPerson = new Map(); // in the period
  const allTime = new Map();
  for (const p of parts) {
    if (!PLAYED.includes(p.status) || p.is_organizer) continue;
    const who = personOf(p);
    if (!who) continue;
    if (heldAll.has(p.event_id)) {
      if (!allTime.has(who)) allTime.set(who, new Set());
      allTime.get(who).add(p.event_id);
    }
    if (heldIds.has(p.event_id)) {
      if (!perPerson.has(who)) perPerson.set(who, new Set());
      perPerson.get(who).add(p.event_id);
    }
  }
  const regularIds = new Set(roster.filter((m) => m.member_type === 'fixed').map((m) => m.id));
  const regularPlays = [...regularIds].map((id) => perPerson.get(id)?.size || 0);
  const kevHeld = heldInPeriod.length;
  const avgRegular = regularPlays.length ? regularPlays.reduce((a, b) => a + b, 0) / regularPlays.length : null;
  const players = [...allTime.values()];
  const playedOnce = players.length;
  const cameBack = players.filter((s) => s.size >= 2).length;

  // ---- Money (transactions of the community and of its kèo)
  const exCol = await excludedCol();
  const [clubTx, evTx] = await Promise.all([
    all(() => supabase.from('transactions').select(`id, type, category, amount, occurred_on, is_voided, event_id${exCol}`).eq('owner_type', 'club').eq('club_id', club.id).order('id')),
    all(() => supabase.from('transactions').select(`id, type, category, amount, occurred_on, is_voided, event_id${exCol}, events!inner(club_id, event_date)`).eq('owner_type', 'event').eq('events.club_id', club.id).order('id')),
  ]);
  const tx = [...clubTx, ...evTx.map(({ events: ev, ...t }) => ({ ...t, day: ev?.event_date }))].filter((t) => counted(t) && inPeriod(t.day || t.occurred_on, period));
  const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const byCat = { court: 0, water: 0, balls: 0, other: 0 };
  for (const t of tx.filter((x) => x.type === 'expense')) byCat[EXPENSES.includes(t.category) ? t.category : 'other'] += Number(t.amount);
  const expense = Object.values(byCat).reduce((a, b) => a + b, 0);

  // Still owed: on the list of a kèo of the period, a fee, not paid, no pass used for it.
  const owing = parts.filter((p) => OWES.includes(p.status) && !p.fee_paid && !p.is_organizer && inPeriod(evById.get(p.event_id)?.event_date, period));
  const passUsed = new Set();
  if (owing.length) {
    const evIds = [...new Set(owing.map((p) => p.event_id))];
    for (let i = 0; i < evIds.length; i += 150) {
      const { data } = await supabase.from('membership_sessions').select('event_id, memberships(club_member_id)').in('event_id', evIds.slice(i, i + 150));
      for (const r of data || []) if (r.memberships?.club_member_id) passUsed.add(`${r.event_id}:${r.memberships.club_member_id}`);
    }
  }
  const debts = owing
    .map((p) => {
      const ev = evById.get(p.event_id);
      const amount = Number(p.fee_amount ?? ev?.fee_amount ?? 0);
      const mid = p.source_club_member_id || p.guest_member_id;
      return { id: p.id, full_name: p.full_name, event_id: p.event_id, title: ev?.title || '', event_date: ev?.event_date || null, amount, pass: mid && passUsed.has(`${p.event_id}:${mid}`) };
    })
    .filter((d) => d.amount > 0 && !d.pass)
    .map(({ pass, ...d }) => d)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  const owed = debts.reduce((s, d) => s + d.amount, 0);

  let balls = [];
  try {
    balls = (await inventoryStore.list({ club_id: club.id })).map((i) => ({
      id: i.id,
      name: i.name,
      holes: i.holes,
      play_durability: i.play_durability ?? null,
      avg_played: i.avg_played ?? null,
      ball_cost_per_session: i.ball_cost_per_session ?? null,
      sessions_logged: i.sessions_logged || 0,
      broken: i.broken || 0,
      stock: i.stock,
    }));
  } catch {
    balls = [];
  }

  return {
    period,
    players: {
      total: roster.length,
      regular: roster.filter((m) => m.member_type === 'fixed').length,
      dropin: roster.filter((m) => m.member_type !== 'fixed').length,
      new_by_month: newByMonth,
      sessions_held: kevHeld,
      regular_avg_sessions: avgRegular == null ? null : Math.round(avgRegular * 10) / 10,
      regular_frequency: avgRegular == null || !kevHeld ? null : Math.round((1000 * avgRegular) / kevHeld) / 10,
      played_once: playedOnce,
      came_back: cameBack,
      return_rate: playedOnce ? Math.round((1000 * cameBack) / playedOnce) / 10 : null,
    },
    money: { revenue: income + owed, income, expense, by_category: byCat, profit: income - expense, owed, debts: debts.slice(0, 200), debt_count: debts.length },
    balls,
  };
}

// ---- Top 10 cộng đồng uy tín: the numbers that show a community is trustworthy, each with
// the bar it must reach. All of them reached -> it may register (services/featured.js).
const TOP10 = { members: 200, regular_pct: 30, new_pct: 20, sessions_month: 12, tier: 'pro' };
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);

async function reputation(club) {
  const today = todayYmd();
  const months = [];
  {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    for (let k = 5; k >= 0; k--) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
  }
  // Months the community has existed in (of the last 6), at least the current one.
  const born = String(club.created_at || '').slice(0, 7);
  const live = months.filter((m) => !born || m >= born);
  const span = live.length ? live : [today.slice(0, 7)];
  const [members, events] = await Promise.all([
    all(() => supabase.from('club_members').select('id, member_type, is_active, join_requested, review_started_at, created_at').eq('club_id', club.id).order('id')),
    all(() => supabase.from('events').select('id, event_date, status, kind').eq('club_id', club.id).neq('kind', 'meeting').gte('event_date', `${span[0]}-01`).lte('event_date', today).order('id')),
  ]);
  const roster = members.filter((m) => m.is_active && !m.join_requested && !m.review_started_at);
  const total = roster.length;
  const regular = roster.filter((m) => m.member_type === 'fixed').length;
  const newIn = (m) => members.filter((x) => String(x.created_at).slice(0, 7) === m && !x.join_requested).length;
  const newThisMonth = newIn(today.slice(0, 7));
  const newAvg = span.reduce((a, m) => a + newIn(m), 0) / span.length;
  const held = events.filter((e) => e.status !== 'cancelled');
  const sessionsAvg = Math.round((10 * held.length) / span.length) / 10;
  // Active = played at least one kèo in the last 30 days.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const recent = held.filter((e) => e.event_date >= since).map((e) => e.id);
  const rosterIds = new Set(roster.map((m) => m.id));
  const active = new Set();
  for (let i = 0; i < recent.length; i += 150) {
    const rows = await all(() => supabase.from('event_participants').select('id, source_club_member_id, guest_member_id, status').in('event_id', recent.slice(i, i + 150)).order('id'));
    for (const r of rows) {
      const mid = r.source_club_member_id || r.guest_member_id;
      if (PLAYED.includes(r.status) && mid && rosterIds.has(mid)) active.add(mid);
    }
  }
  let tier = 'free';
  try {
    tier = (await require('./plan').clubPlan(club)).tier;
  } catch {}
  const { TIERS } = require('./planFeatures');
  const regularPct = pct(regular, total);
  const newPct = pct(newAvg, total);
  const checks = [
    { key: 'members', value: total, target: TOP10.members, ok: total >= TOP10.members, progress: Math.min(100, pct(total, TOP10.members)) },
    { key: 'regular', value: regularPct, count: regular, target: TOP10.regular_pct, ok: total > 0 && regularPct >= TOP10.regular_pct, progress: Math.min(100, pct(regularPct, TOP10.regular_pct)) },
    { key: 'plan', value: tier, target: TOP10.tier, ok: TIERS.indexOf(tier) >= TIERS.indexOf(TOP10.tier), progress: Math.min(100, pct(Math.max(TIERS.indexOf(tier), 0), TIERS.indexOf(TOP10.tier))) },
    { key: 'newcomers', value: newPct, count: Math.round(newAvg * 10) / 10, target: TOP10.new_pct, ok: total > 0 && newPct >= TOP10.new_pct, progress: Math.min(100, pct(newPct, TOP10.new_pct)) },
    { key: 'sessions', value: sessionsAvg, target: TOP10.sessions_month, ok: sessionsAvg >= TOP10.sessions_month, progress: Math.min(100, pct(sessionsAvg, TOP10.sessions_month)) },
  ];
  return {
    thresholds: TOP10,
    months: span.length,
    // What the registration form fills in by itself.
    info: {
      name: club.name,
      members: total,
      sessions_held: held.length,
      sessions_month: sessionsAvg,
      active_pct: pct(active.size, total),
      new_month: newThisMonth,
      new_month_avg: Math.round(newAvg * 10) / 10,
      regular,
    },
    checks,
    failing: checks.filter((c) => !c.ok).map((c) => c.key),
    eligible: checks.every((c) => c.ok),
  };
}

module.exports = { business, reputation, TOP10 };
