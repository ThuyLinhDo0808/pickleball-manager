// Advanced analytics for a club (Pro): how often members play, who is active or
// drifting away, month-to-month retention, membership renewals, revenue per member,
// and how each kind of activity performs — by month, by membership plan, by activity.
// Pure functions over plain rows so they are easy to test; the route loads the rows.

const DAY = 86400000;
const ym = (ymd) => String(ymd).slice(0, 7);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const shiftYmd = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

// The months from `from` to `to` (YYYY-MM), oldest first.
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// A participant "played" when checked in, or still registered for a session already held
// (many clubs don't check people in). No-shows and cancellations don't count.
const played = (p, eventDate, today) => p.status === 'checked_in' || (p.status === 'registered' && eventDate < today);

/**
 * @param {object} d
 *   members:      [{ id, full_name, member_type, is_active, joined_on, created_at, user_id }]
 *   events:       [{ id, title, event_date, kind, slots }]            (not cancelled, no meetings)
 *   participants: [{ event_id, member_id, status }]                    (member_id resolved, may be null)
 *   memberships:  [{ id, club_member_id, plan_id, starts_on, ends_on, status, amount }]
 *   plans:        [{ id, name, period }]
 *   money:        [{ type, amount, occurred_on, event_id }]             (not voided; club + its events)
 *   from, to, today: YYYY-MM-DD
 */
function insights(d) {
  const { from, to, today } = d;
  const months = monthsBetween(from, to);
  const eventById = new Map(d.events.map((e) => [e.id, e]));
  const fixed = d.members.filter((m) => m.member_type === 'fixed' && m.is_active);

  // ---- who played when ----
  const plays = []; // { member_id, event_id, date }
  const perEvent = new Map(); // event id -> players
  for (const p of d.participants) {
    const e = eventById.get(p.event_id);
    if (!e || !played(p, e.event_date, today)) continue;
    perEvent.set(e.id, (perEvent.get(e.id) || 0) + 1);
    if (p.member_id) plays.push({ member_id: p.member_id, event_id: e.id, date: e.event_date });
  }
  const byMember = new Map();
  for (const x of plays) {
    const r = byMember.get(x.member_id) || { sessions: 0, last: null, months: new Set() };
    r.sessions += 1;
    if (!r.last || x.date > r.last) r.last = x.date;
    r.months.add(ym(x.date));
    byMember.set(x.member_id, r);
  }

  // ---- frequency + active / inactive (official members) ----
  const span = Math.max(1, months.length);
  const recent = shiftYmd(today, -30);
  const status = { active: 0, at_risk: 0, inactive: 0 };
  const buckets = { none: 0, low: 0, mid: 0, high: 0 }; // per month: 0, <2, 2-4, 4+
  const frequency = fixed.map((m) => {
    const r = byMember.get(m.id);
    const sessions = r?.sessions || 0;
    const perMonth = Math.round((sessions / span) * 10) / 10;
    const state = r?.last && r.last >= recent ? 'active' : sessions ? 'at_risk' : 'inactive';
    status[state] += 1;
    buckets[perMonth === 0 ? 'none' : perMonth < 2 ? 'low' : perMonth < 4 ? 'mid' : 'high'] += 1;
    return { member_id: m.id, full_name: m.full_name, sessions, per_month: perMonth, last_played: r?.last || null, state };
  }).sort((a, b) => b.sessions - a.sessions || a.full_name.localeCompare(b.full_name));

  // ---- retention: of last month's players, how many came back this month ----
  const playersIn = new Map(months.map((m) => [m, new Set()]));
  for (const x of plays) playersIn.get(ym(x.date))?.add(x.member_id);
  const firstSeen = new Map();
  for (const x of plays) if (!firstSeen.has(x.member_id) || x.date < firstSeen.get(x.member_id)) firstSeen.set(x.member_id, x.date);

  // ---- money ----
  const incomeIn = new Map(months.map((m) => [m, 0]));
  const expenseIn = new Map(months.map((m) => [m, 0]));
  const eventMoney = new Map(); // event id -> { income, expense }
  for (const t of d.money) {
    const m = ym(t.occurred_on);
    const amt = Number(t.amount) || 0;
    if (incomeIn.has(m)) (t.type === 'income' ? incomeIn : expenseIn).set(m, (t.type === 'income' ? incomeIn : expenseIn).get(m) + amt);
    if (t.event_id) {
      const em = eventMoney.get(t.event_id) || { income: 0, expense: 0 };
      em[t.type] += amt;
      eventMoney.set(t.event_id, em);
    }
  }
  const paidMemberships = d.memberships.filter((x) => x.status === 'paid');
  for (const x of paidMemberships) {
    const m = ym(x.starts_on);
    if (incomeIn.has(m)) incomeIn.set(m, incomeIn.get(m) + (Number(x.amount) || 0));
  }

  const byMonth = months.map((m, i) => {
    const now = playersIn.get(m);
    const prev = i > 0 ? playersIn.get(months[i - 1]) : null;
    const back = prev ? [...prev].filter((id) => now.has(id)).length : null;
    const sessions = d.events.filter((e) => ym(e.event_date) === m && e.event_date < today).length;
    const income = incomeIn.get(m);
    return {
      month: m,
      sessions,
      plays: plays.filter((x) => ym(x.date) === m).length,
      players: now.size,
      new_players: [...firstSeen.values()].filter((dt) => ym(dt) === m).length,
      retention: prev ? pct(back, prev.size) : null,
      income,
      expense: expenseIn.get(m),
      revenue_per_member: now.size ? Math.round(income / now.size) : null,
      new_members: d.members.filter((x) => ym(x.joined_on || x.created_at) === m).length,
      memberships_sold: paidMemberships.filter((x) => ym(x.starts_on) === m).length,
    };
  });

  // ---- renewals: memberships that ended — did the member buy another within a month? ----
  const ended = d.memberships.filter((x) => x.ends_on >= from && x.ends_on < today && x.status === 'paid');
  const renewedOf = (x) => d.memberships.some((y) => y.id !== x.id && y.club_member_id === x.club_member_id && y.starts_on > x.starts_on && y.starts_on <= shiftYmd(x.ends_on, 31) && y.status !== 'overdue');
  const renewedCount = ended.filter(renewedOf).length;

  const byPlan = d.plans.map((p) => {
    const sold = paidMemberships.filter((x) => x.plan_id === p.id && x.starts_on >= from && x.starts_on <= to);
    const endedP = ended.filter((x) => x.plan_id === p.id);
    return {
      plan_id: p.id,
      name: p.name,
      period: p.period,
      sold: sold.length,
      revenue: sold.reduce((n, x) => n + (Number(x.amount) || 0), 0),
      members: new Set(sold.map((x) => x.club_member_id)).size,
      ended: endedP.length,
      renewal: pct(endedP.filter(renewedOf).length, endedP.length),
    };
  }).filter((p) => p.sold || p.ended);

  // ---- activities: per session and per kind ----
  const held = d.events.filter((e) => e.event_date < today);
  const sessionsList = held.map((e) => {
    const n = perEvent.get(e.id) || 0;
    const m = eventMoney.get(e.id) || { income: 0, expense: 0 };
    return { event_id: e.id, title: e.title, date: e.event_date, kind: e.kind, players: n, slots: e.slots || null, fill: e.slots ? pct(n, e.slots) : null, income: m.income, expense: m.expense, profit: m.income - m.expense };
  });
  const kinds = new Map();
  for (const s of sessionsList) {
    const k = kinds.get(s.kind) || { kind: s.kind, sessions: 0, players: 0, fills: [], profit: 0, income: 0 };
    k.sessions += 1;
    k.players += s.players;
    if (s.fill != null) k.fills.push(s.fill);
    k.profit += s.profit;
    k.income += s.income;
    kinds.set(s.kind, k);
  }
  const byActivity = [...kinds.values()].map((k) => ({
    kind: k.kind,
    sessions: k.sessions,
    avg_players: Math.round((k.players / k.sessions) * 10) / 10,
    avg_fill: k.fills.length ? Math.round(k.fills.reduce((a, b) => a + b, 0) / k.fills.length) : null,
    income: k.income,
    profit: k.profit,
    profit_per_session: Math.round(k.profit / k.sessions),
  })).sort((a, b) => b.sessions - a.sessions);

  const totalIncome = byMonth.reduce((n, m) => n + m.income, 0);
  const playersInWindow = new Set(plays.map((x) => x.member_id)).size;
  const retentions = byMonth.map((m) => m.retention).filter((v) => v != null);

  return {
    from,
    to,
    months,
    summary: {
      official: fixed.length,
      ...status,
      avg_per_month: fixed.length ? Math.round((frequency.reduce((n, f) => n + f.per_month, 0) / fixed.length) * 10) / 10 : 0,
      retention: retentions.length ? Math.round(retentions.reduce((a, b) => a + b, 0) / retentions.length) : null,
      renewal: pct(renewedCount, ended.length),
      renewal_counts: { renewed: renewedCount, ended: ended.length },
      income: totalIncome,
      players: playersInWindow,
      revenue_per_member: playersInWindow ? Math.round(totalIncome / playersInWindow) : null,
      sessions: held.length,
    },
    frequency: { buckets, members: frequency },
    by_month: byMonth,
    by_plan: byPlan,
    by_activity: byActivity,
    sessions: sessionsList.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60),
  };
}

module.exports = { insights, monthsBetween, played };
