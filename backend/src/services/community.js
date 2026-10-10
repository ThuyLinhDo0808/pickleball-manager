// Numbers for a Social Manager community ("cộng đồng xé vé", a club of kind 'community'):
// members (all, per series, active / inactive), money (in, out, balance, still owed) and
// how regularly members come. Also a day-by-day money view for the finance overview.
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');

const ACTIVE_DAYS = 30; // inactive = no activity in the community for a month or more
const REGULAR_MIN = 4; // "thường xuyên" = at least this many sessions in those 30 days
const PLAYED = ['registered', 'checked_in'];
const OWES = ['registered', 'checked_in', 'pending'];

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Sign-ups not paid yet (guests' fees; members use their pass, organizers don't pay).
function unpaidOf(events, parts) {
  const byId = new Map(events.map((e) => [e.id, e]));
  let amount = 0;
  let count = 0;
  for (const p of parts) {
    if (!OWES.includes(p.status) || p.fee_paid || p.is_organizer || p.kind === 'member') continue;
    const fee = Number(p.fee_amount ?? byId.get(p.event_id)?.fee_amount ?? 0);
    if (fee > 0) {
      amount += fee;
      count += 1;
    }
  }
  return { amount, count };
}

async function moneyOf(clubId, eventIds) {
  const filters = [`and(owner_type.eq.club,club_id.eq.${clubId})`];
  if (eventIds.length) filters.push(`and(owner_type.eq.event,event_id.in.(${eventIds.join(',')}))`);
  return all(() => supabase.from('transactions').select('type, amount, occurred_on, event_id').eq('is_voided', false).or(filters.join(',')).order('id'));
}

async function overview(club) {
  const today = todayYmd();
  const since = addDays(today, -ACTIVE_DAYS);
  const [events, members] = await Promise.all([
    all(() => supabase.from('events').select('id, event_date, series_label, fee_amount, status').eq('club_id', club.id).order('id')),
    all(() => supabase.from('club_members').select('id, member_type, is_active, join_requested').eq('club_id', club.id).order('id')),
  ]);
  const ids = events.map((e) => e.id);
  let parts = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    parts.push(...(await all(() => supabase.from('event_participants').select('event_id, status, kind, fee_paid, fee_amount, is_organizer, source_club_member_id, guest_member_id').in('event_id', chunk).order('id'))));
  }
  const evById = new Map(events.map((e) => [e.id, e]));
  const roster = members.filter((m) => !m.join_requested);
  const known = new Set(roster.map((m) => m.id));

  // Who came when: member id -> sessions in the last 30 days; per series, everyone ever.
  const recent = new Map();
  const series = new Map();
  for (const p of parts) {
    const mid = p.source_club_member_id || p.guest_member_id;
    const e = evById.get(p.event_id);
    if (!mid || !known.has(mid) || !e || !PLAYED.includes(p.status) || e.status === 'cancelled') continue;
    const past = e.event_date <= today;
    if (past && e.event_date >= since) recent.set(mid, (recent.get(mid) || 0) + 1);
    if (e.series_label) {
      const s = series.get(e.series_label) || { label: e.series_label, members: new Set(), active: new Set(), sessions: new Set() };
      s.members.add(mid);
      s.sessions.add(e.id);
      if (past && e.event_date >= since) s.active.add(mid);
      series.set(e.series_label, s);
    }
  }
  const active = roster.filter((m) => recent.has(m.id)).length;
  const regular = roster.filter((m) => (recent.get(m.id) || 0) >= REGULAR_MIN).length;

  const txns = await moneyOf(club.id, ids);
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const fees = unpaidOf(events.filter((e) => e.status !== 'cancelled'), parts);
  const { data: ms, error } = await supabase.from('memberships').select('amount, status, club_members!inner(club_id)').eq('club_members.club_id', club.id).neq('status', 'paid');
  if (error) throw error;
  const plans = (ms || []).reduce((s, m) => s + Number(m.amount || 0), 0);

  return {
    club: { id: club.id, name: club.name, kind: club.kind || 'club' },
    rules: { active_days: ACTIVE_DAYS, regular_min: REGULAR_MIN },
    members: {
      total: roster.length,
      fixed: roster.filter((m) => m.member_type === 'fixed').length,
      guest: roster.filter((m) => m.member_type === 'guest').length,
      active,
      inactive: roster.length - active,
      by_series: [...series.values()]
        .map((s) => ({ label: s.label, members: s.members.size, active: s.active.size, inactive: s.members.size - s.active.size, sessions: s.sessions.size }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    },
    finance: {
      income,
      expense,
      balance: income - expense,
      unpaid: fees.amount + plans,
      unpaid_fees: fees.amount,
      unpaid_fee_count: fees.count,
      unpaid_plans: plans,
    },
    regularity: { regular, irregular: active - regular, inactive: roster.length - active },
  };
}

// Day by day for one month (YYYY-MM): money in / out, profit, sessions, players, still owed.
async function daily(scope, month) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  let q = supabase.from('events').select('id, event_date, fee_amount, status').eq('host_id', scope.hostId).gte('event_date', first).lte('event_date', last);
  q = scope.clubId ? q.eq('club_id', scope.clubId) : q.is('club_id', null);
  const { data: events, error } = await q;
  if (error) throw error;
  const live = events.filter((e) => e.status !== 'cancelled');
  const ids = live.map((e) => e.id);
  const parts = ids.length ? await all(() => supabase.from('event_participants').select('event_id, status, kind, fee_paid, fee_amount, is_organizer').in('event_id', ids).order('id')) : [];
  // A kèo's money counts on the kèo's day (fees often arrive days before); the
  // community's own entries (fund, plans…) on the day they were written.
  const evTx = events.length
    ? await all(() => supabase.from('transactions').select('type, amount, event_id').eq('is_voided', false).in('event_id', events.map((e) => e.id)).order('id'))
    : [];
  const dateOf = new Map(events.map((e) => [e.id, e.event_date]));
  const clubTx = scope.clubId
    ? await all(() => supabase.from('transactions').select('type, amount, occurred_on').eq('is_voided', false).eq('owner_type', 'club').eq('club_id', scope.clubId).gte('occurred_on', first).lte('occurred_on', last).order('id'))
    : [];
  const txns = [...evTx.map((t) => ({ ...t, occurred_on: dateOf.get(t.event_id) })), ...clubTx];
  const days = new Map();
  const day = (d) => days.get(d) || days.set(d, { date: d, income: 0, expense: 0, sessions: 0, players: 0, unpaid: 0 }).get(d);
  for (const t of txns) day(t.occurred_on)[t.type === 'income' ? 'income' : 'expense'] += Number(t.amount);
  for (const e of live) {
    const d = day(e.event_date);
    d.sessions += 1;
    const mine = parts.filter((p) => p.event_id === e.id);
    d.players += mine.filter((p) => PLAYED.includes(p.status) && !p.is_organizer).length;
    d.unpaid += unpaidOf([e], mine).amount;
  }
  const rows = [...days.values()].map((d) => ({ ...d, profit: d.income - d.expense })).sort((a, b) => a.date.localeCompare(b.date));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { month, days: rows, totals: { income: sum('income'), expense: sum('expense'), profit: sum('income') - sum('expense'), unpaid: sum('unpaid'), sessions: sum('sessions'), players: sum('players') } };
}

module.exports = { overview, daily, ACTIVE_DAYS, REGULAR_MIN };
