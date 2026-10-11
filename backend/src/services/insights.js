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
    patterns: patterns(d, sessionsList, months),
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

// ---- when and how people play: weekday × hour heatmap, best / worst slots, series,
// who comes (new, returning, one-off, regulars), no-shows and late cancels ----
const hourOf = (time) => (time ? Number(String(time).slice(0, 2)) : null);
// Monday = 0 … Sunday = 6
const weekdayOf = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
// The hours a session covers: [start, end), at most 6; no end time = the start hour only.
function hoursOf(e) {
  const a = hourOf(e.start_time);
  if (a == null || Number.isNaN(a)) return [];
  let b = hourOf(e.end_time);
  if (b == null || Number.isNaN(b) || b <= a) b = a + 1;
  if (String(e.end_time || '').slice(3, 5) > '00' && b > a) b += 1; // 18:00–19:30 covers 18 and 19
  return Array.from({ length: Math.min(6, b - a) }, (_, i) => a + i).filter((h) => h < 24);
}
const avg = (sum, n, digits = 1) => (n ? Math.round((sum / n) * 10 ** digits) / 10 ** digits : null);

function patterns(d, sessionsList, months) {
  const { today } = d;
  const eventById = new Map(d.events.map((e) => [e.id, e]));
  const memberById = new Map(d.members.map((m) => [m.id, m]));
  const sess = sessionsList.map((s) => ({ ...s, e: eventById.get(s.event_id) }));

  // Heatmap: each cell = one weekday at one hour. A session counts in every hour it covers.
  const cells = new Map();
  for (const s of sess) {
    const dow = weekdayOf(s.date);
    for (const h of hoursOf(s.e)) {
      const c = cells.get(`${dow}-${h}`) || { dow, hour: h, sessions: 0, plays: 0, slots: 0, slotted: 0 };
      c.sessions += 1;
      c.plays += s.players;
      if (s.slots) { c.slots += s.slots; c.slotted += s.players; }
      cells.set(`${dow}-${h}`, c);
    }
  }
  const heat = [...cells.values()].map((c) => ({ dow: c.dow, hour: c.hour, sessions: c.sessions, plays: c.plays, avg_players: avg(c.plays, c.sessions), fill: c.slots ? Math.round((c.slotted / c.slots) * 100) : null }));
  const hours = heat.map((c) => c.hour);
  const ranked = heat.filter((c) => c.sessions > 0).sort((a, b) => b.avg_players - a.avg_players || b.sessions - a.sessions);

  // Per weekday and per start hour.
  const group = (keyOf) => {
    const m = new Map();
    for (const s of sess) {
      const k = keyOf(s);
      if (k == null) continue;
      const r = m.get(k) || { key: k, sessions: 0, plays: 0, fills: [], profit: 0 };
      r.sessions += 1;
      r.plays += s.players;
      if (s.fill != null) r.fills.push(s.fill);
      r.profit += s.profit;
      m.set(k, r);
    }
    return [...m.values()].map((r) => ({ key: r.key, sessions: r.sessions, plays: r.plays, avg_players: avg(r.plays, r.sessions), avg_fill: r.fills.length ? Math.round(r.fills.reduce((a, b) => a + b, 0) / r.fills.length) : null, profit: r.profit, profit_per_session: Math.round(r.profit / r.sessions) }));
  };
  const byWeekday = group((s) => weekdayOf(s.date)).sort((a, b) => a.key - b.key);
  const byStartHour = group((s) => hourOf(s.e?.start_time)).sort((a, b) => a.key - b.key);

  // How full sessions get.
  const fill = { full: 0, high: 0, mid: 0, low: 0, open: 0 };
  for (const s of sess) fill[s.fill == null ? 'open' : s.fill >= 100 ? 'full' : s.fill >= 75 ? 'high' : s.fill >= 50 ? 'mid' : 'low'] += 1;

  // People: everyone who played, members or not (account / phone / name for walk-ins).
  const heldIds = new Set(sess.map((s) => s.event_id));
  const byWho = new Map();
  const reg = new Map(months.map((m) => [m, { month: m, signups: 0, no_show: 0, cancelled: 0 }]));
  for (const p of d.participants) {
    const e = eventById.get(p.event_id);
    if (!e || !heldIds.has(e.id)) continue;
    const r = reg.get(ym(e.event_date));
    if (r && ['registered', 'checked_in', 'no_show', 'cancelled', 'pending'].includes(p.status)) {
      r.signups += 1;
      if (p.status === 'no_show') r.no_show += 1;
      if (p.status === 'cancelled') r.cancelled += 1;
    }
    if (!p.who || !played(p, e.event_date, today)) continue;
    const w = byWho.get(p.who) || { who: p.who, name: p.member_id ? memberById.get(p.member_id)?.full_name : p.name, type: p.member_id ? memberById.get(p.member_id)?.member_type || 'guest' : 'walk_in', sessions: 0, first: e.event_date, last: e.event_date, series: new Set() };
    w.sessions += 1;
    if (e.event_date < w.first) w.first = e.event_date;
    if (e.event_date > w.last) w.last = e.event_date;
    if (e.series_label) w.series.add(e.series_label);
    byWho.set(p.who, w);
  }
  const people = [...byWho.values()];
  const perMonth = months.map((m) => {
    const firsts = people.filter((w) => ym(w.first) === m).length;
    const r = reg.get(m);
    return { month: m, new_players: firsts, signups: r.signups, no_show: r.no_show, cancelled: r.cancelled, no_show_rate: pct(r.no_show, r.signups), cancel_rate: pct(r.cancelled, r.signups) };
  });
  const totals = perMonth.reduce((a, r) => ({ signups: a.signups + r.signups, no_show: a.no_show + r.no_show, cancelled: a.cancelled + r.cancelled }), { signups: 0, no_show: 0, cancelled: 0 });
  const span = Math.max(1, months.length);
  const playsBy = { fixed: 0, guest: 0, walk_in: 0 };
  for (const w of people) playsBy[w.type === 'fixed' ? 'fixed' : w.type === 'walk_in' ? 'walk_in' : 'guest'] += w.sessions;

  // Series (Social Manager communities): sessions, players, fill, money, loyal players.
  const series = new Map();
  for (const s of sess) {
    const label = s.e?.series_label;
    if (!label) continue;
    const r = series.get(label) || { label, sessions: 0, plays: 0, fills: [], income: 0, profit: 0, people: new Set() };
    r.sessions += 1;
    r.plays += s.players;
    if (s.fill != null) r.fills.push(s.fill);
    r.income += s.income;
    r.profit += s.profit;
    series.set(label, r);
  }
  for (const w of people) for (const l of w.series) series.get(l)?.people.add(w.who);
  const bySeries = [...series.values()].map((r) => {
    const ppl = [...r.people].map((id) => byWho.get(id));
    return {
      label: r.label,
      sessions: r.sessions,
      players: r.people.size,
      avg_players: avg(r.plays, r.sessions),
      avg_fill: r.fills.length ? Math.round(r.fills.reduce((a, b) => a + b, 0) / r.fills.length) : null,
      income: r.income,
      profit: r.profit,
      profit_per_session: Math.round(r.profit / r.sessions),
      returning: pct(ppl.filter((w) => w.sessions >= 2).length, ppl.length),
    };
  }).sort((a, b) => b.sessions - a.sessions);

  return {
    heatmap: { cells: heat, min_hour: hours.length ? Math.min(...hours) : null, max_hour: hours.length ? Math.max(...hours) : null },
    best_slots: ranked.slice(0, 3),
    worst_slots: ranked.length > 3 ? ranked.slice(-3).reverse() : [],
    by_weekday: byWeekday,
    by_start_hour: byStartHour,
    fill,
    people: {
      unique: people.length,
      one_off: people.filter((w) => w.sessions === 1).length,
      returning: people.filter((w) => w.sessions >= 2).length,
      regulars: people.filter((w) => w.sessions / span >= 4).length,
      avg_sessions: avg(people.reduce((n, w) => n + w.sessions, 0), people.length),
      plays_by: playsBy,
      top: people.sort((a, b) => b.sessions - a.sessions || String(a.name).localeCompare(String(b.name))).slice(0, 10).map((w) => ({ name: w.name || '—', type: w.type, sessions: w.sessions, last: w.last })),
    },
    reliability: { ...totals, no_show_rate: pct(totals.no_show, totals.signups), cancel_rate: pct(totals.cancelled, totals.signups), by_month: perMonth },
    by_series: bySeries,
  };
}

module.exports = { insights, monthsBetween, played, patterns, hoursOf, weekdayOf };
