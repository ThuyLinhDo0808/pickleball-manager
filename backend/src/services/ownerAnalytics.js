// Business analytics for the owner console (/owner/analytics): revenue, unit economics,
// customer segments, sign-up cohorts and the funnel. Pure functions over plain rows so
// they are easy to test; the route loads the rows.
const S = require('./ownerStats');

const DAY = 86400000;
const ym = (ymd) => String(ymd || '').slice(0, 7);
const dayOf = (ts) => (ts ? S.vnYmd(new Date(ts)) : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const sum = (rows, f) => rows.reduce((n, r) => n + (Number(f(r)) || 0), 0);
const TIERS = ['basic', 'standard', 'advanced', 'pro'];

// 'YYYY-MM' list ending at `month`, `n` long, oldest first.
function lastMonths(month, n) {
  let [y, m] = month.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// A paid order covers [start, start + months × 30 days). Paying on day d = covered.
function coverage(order) {
  const start = dayOf(order.confirmed_at || order.created_at);
  return { start, end: S.shiftYmd(start, (Number(order.months) || 1) * 30) };
}
const covers = (order, ymd) => {
  const c = coverage(order);
  return c.start <= ymd && ymd < c.end;
};

// What kind of sale each paid order was: first purchase of that product by the host,
// an upgrade (bought mid-period from a lower plan), or a renewal.
function classify(paid) {
  const seen = new Set();
  const out = new Map();
  for (const o of [...paid].sort((a, b) => String(a.confirmed_at).localeCompare(String(b.confirmed_at)))) {
    const k = `${o.host_id}|${o.kind}`;
    out.set(o.id, o.upgrade_from ? 'upgrade' : seen.has(k) ? 'renewal' : 'new');
    seen.add(k);
  }
  return out;
}

function revenue(d, months) {
  const paid = d.orders.filter((o) => o.status === 'paid' && o.confirmed_at);
  const sale = classify(paid);
  const byMonth = months.map((m) => {
    const rows = paid.filter((o) => ym(dayOf(o.confirmed_at)) === m);
    const end = monthEnd(m);
    // MRR at the end of the month: each covering order's price per month, newest per host+product.
    const live = new Map();
    for (const o of paid) {
      if (!covers(o, end)) continue;
      const k = `${o.host_id}|${o.kind}`;
      const prev = live.get(k);
      if (!prev || String(o.confirmed_at) > String(prev.confirmed_at)) live.set(k, o);
    }
    const mrr = Math.round(sum([...live.values()], (o) => Number(o.amount) / (Number(o.months) || 1)));
    const payingHosts = new Set([...live.values()].map((o) => o.host_id)).size;
    return {
      month: m,
      cash: sum(rows, (o) => o.amount),
      plans: sum(rows.filter((o) => o.kind === 'tier'), (o) => o.amount),
      social_manager: sum(rows.filter((o) => o.kind === 'social_manager'), (o) => o.amount),
      new: sum(rows.filter((o) => sale.get(o.id) === 'new'), (o) => o.amount),
      renewal: sum(rows.filter((o) => sale.get(o.id) === 'renewal'), (o) => o.amount),
      upgrade: sum(rows.filter((o) => sale.get(o.id) === 'upgrade'), (o) => o.amount),
      discounts: sum(rows, (o) => o.discount_amount),
      orders: rows.length,
      mrr,
      paying_hosts: payingHosts,
    };
  });
  const inWindow = paid.filter((o) => months.includes(ym(dayOf(o.confirmed_at))));
  const year = String(d.today).slice(0, 4);
  const byTier = TIERS.map((t) => {
    const rows = inWindow.filter((o) => o.kind === 'tier' && o.tier === t);
    return { tier: t, cash: sum(rows, (o) => o.amount), orders: rows.length };
  });
  // Social Manager is its own product with its own four plans (old orders without a tier
  // were the single add-on: counted as Basic).
  const bySmTier = TIERS.map((t) => {
    const rows = inWindow.filter((o) => o.kind === 'social_manager' && (TIERS.includes(o.tier) ? o.tier : 'basic') === t);
    return { tier: t, cash: sum(rows, (o) => o.amount), orders: rows.length };
  });
  const byLength = [1, 3, 6, 12].map((n) => {
    const rows = inWindow.filter((o) => Number(o.months) === n);
    return { months: n, cash: sum(rows, (o) => o.amount), orders: rows.length };
  });
  const other = inWindow.filter((o) => ![1, 3, 6, 12].includes(Number(o.months)));
  if (other.length) byLength.push({ months: 'other', cash: sum(other, (o) => o.amount), orders: other.length });
  const promoRows = inWindow.filter((o) => o.promo_code_id || Number(o.discount_amount) > 0);
  const lifetime = new Map();
  for (const o of paid) lifetime.set(o.host_id, (lifetime.get(o.host_id) || 0) + Number(o.amount));
  const emailOf = new Map(d.users.map((u) => [u.id, u.email]));
  return {
    by_month: byMonth,
    totals: {
      window: sum(inWindow, (o) => o.amount),
      lifetime: sum(paid, (o) => o.amount),
      ytd: sum(paid.filter((o) => String(dayOf(o.confirmed_at)).startsWith(year)), (o) => o.amount),
      orders: inWindow.length,
      avg_order: inWindow.length ? Math.round(sum(inWindow, (o) => o.amount) / inWindow.length) : 0,
      discounts: sum(inWindow, (o) => o.discount_amount),
      pending: { count: d.orders.filter((o) => o.status === 'pending').length, amount: sum(d.orders.filter((o) => o.status === 'pending'), (o) => o.amount) },
      cancelled: {
        count: d.orders.filter((o) => o.status === 'cancelled' && months.includes(ym(dayOf(o.created_at)))).length,
        amount: sum(d.orders.filter((o) => o.status === 'cancelled' && months.includes(ym(dayOf(o.created_at)))), (o) => o.amount),
      },
    },
    by_sale: ['new', 'renewal', 'upgrade'].map((k) => ({ kind: k, cash: sum(inWindow.filter((o) => sale.get(o.id) === k), (o) => o.amount), orders: inWindow.filter((o) => sale.get(o.id) === k).length })),
    by_tier: byTier,
    by_sm_tier: bySmTier,
    by_length: byLength,
    promos: { orders: promoRows.length, discounts: sum(promoRows, (o) => o.discount_amount), cash: sum(promoRows, (o) => o.amount), redemptions: d.redemptions.length },
    top_hosts: [...lifetime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, cash]) => ({ host_id: id, email: emailOf.get(id) || null, cash, orders: paid.filter((o) => o.host_id === id).length })),
  };
}

// Unit economics from the month series: ARPU, churn, LTV.
function finance(rev, d) {
  const series = rev.by_month;
  const last = series[series.length - 1] || { mrr: 0, paying_hosts: 0 };
  // Monthly churn: hosts paying at the end of one month and not at the end of the next.
  const paid = d.orders.filter((o) => o.status === 'paid' && o.confirmed_at);
  const payingAt = (ymd) => new Set(paid.filter((o) => covers(o, ymd)).map((o) => o.host_id));
  const churn = series.slice(1).map((m, i) => {
    const before = payingAt(monthEnd(series[i].month));
    const after = payingAt(monthEnd(m.month));
    const lost = [...before].filter((h) => !after.has(h)).length;
    return { month: m.month, start: before.size, lost, rate: pct(lost, before.size) };
  });
  const rates = churn.filter((c) => c.start > 0).map((c) => c.rate);
  const avgChurn = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
  // "Now" uses the subscriptions, the same way as the overview page.
  const mrrNow = S.mrr(d.subs.filter((s) => d.payingIds.has(s.host_id)), paid, d.today);
  // Hosts on a plan the owner gave for free (no paid order covering today) bring no money:
  // they are counted apart so ARPU is the average of hosts who really pay.
  const payingNow = d.payingIds.size;
  const arpu = payingNow ? Math.round(mrrNow / payingNow) : 0;
  const hosts = d.hostIds.length;
  return {
    mrr: mrrNow,
    arr: mrrNow * 12,
    paying_hosts: payingNow,
    gifted_hosts: d.giftedIds.size,
    arpu,
    arpa: hosts ? Math.round(last.mrr / hosts) : 0,
    churn: { by_month: churn, avg: avgChurn },
    // Lifetime value ≈ ARPU ÷ monthly churn (capped at 5 years when churn is ~0).
    ltv: arpu && avgChurn ? Math.round(arpu * Math.min(60, 100 / avgChurn)) : null,
    lifetime_months: avgChurn ? Math.min(60, Math.round((100 / avgChurn) * 10) / 10) : null,
    mrr_growth: series.length >= 2 && series[series.length - 2].mrr ? pct(last.mrr - series[series.length - 2].mrr, series[series.length - 2].mrr) : null,
  };
}

// Customer segments (organisers = accounts that run a club, a community or Xé Vé kèo).
function segments(d) {
  const today = d.today;
  const subOf = new Map(d.subs.map((s) => [s.host_id, s]));
  const paid = d.orders.filter((o) => o.status === 'paid' && o.confirmed_at);
  const cashOf = new Map();
  for (const o of paid) cashOf.set(o.host_id, (cashOf.get(o.host_id) || 0) + Number(o.amount));
  const clubsOf = new Map();
  for (const c of d.clubs) clubsOf.set(c.host_id, [...(clubsOf.get(c.host_id) || []), c]);
  const membersOf = new Map(); // host -> active members across their clubs
  const clubHost = new Map(d.clubs.map((c) => [c.id, c.host_id]));
  for (const m of d.members) {
    const h = clubHost.get(m.club_id);
    if (h) membersOf.set(h, (membersOf.get(h) || 0) + 1);
  }
  const lastActive = new Map(); // host -> last session date
  for (const e of d.events) if (!lastActive.get(e.host_id) || e.event_date > lastActive.get(e.host_id)) lastActive.set(e.host_id, e.event_date);
  const created = new Map(d.users.map((u) => [u.id, dayOf(u.created_at)]));
  const xeveHosts = new Set(d.events.filter((e) => !e.club_id).map((e) => e.host_id));

  const rows = d.hostIds.map((id) => {
    const sub = subOf.get(id) || { tier: 'free' };
    const clubs = clubsOf.get(id) || [];
    const last = lastActive.get(id) || null;
    const since = last ? Math.round((Date.parse(today) - Date.parse(last)) / DAY) : null;
    const ageDays = created.get(id) ? Math.round((Date.parse(today) - Date.parse(created.get(id))) / DAY) : 0;
    const orders = paid.filter((o) => o.host_id === id);
    const paying = d.payingIds.has(id);
    const firstPaid = orders.length ? orders.map((o) => dayOf(o.confirmed_at)).sort()[0] : null;
    const ends = [sub.tier_paid_until, sub.social_manager_paid_until].filter((x) => x && x >= today).sort()[0];
    return {
      id,
      tier: S.onTrial(sub, today) ? 'trial' : sub.tier || 'free',
      sm_tier: sub.social_manager ? (TIERS.includes(sub.sm_tier) ? sub.sm_tier : 'basic') : 'none',
      paying,
      gifted: d.giftedIds.has(id),
      cash: cashOf.get(id) || 0,
      orders: orders.length,
      members: membersOf.get(id) || 0,
      clubs: clubs.filter((c) => (c.kind || 'club') === 'club').length,
      communities: clubs.filter((c) => c.kind === 'community').length,
      xeve: xeveHosts.has(id),
      sports: new Set(clubs.map((c) => c.sport || 'pickleball')),
      provinces: new Set(clubs.map((c) => c.province).filter(Boolean)),
      since,
      age_days: ageDays,
      first_paid: firstPaid,
      ends_in: ends ? Math.round((Date.parse(ends) - Date.parse(today)) / DAY) : null,
    };
  });
  const group = (keyOf, order) => {
    const m = new Map();
    for (const r of rows) for (const k of [].concat(keyOf(r))) {
      const g = m.get(k) || { key: k, hosts: 0, paying: 0, cash: 0, members: 0 };
      g.hosts += 1;
      if (r.paying) g.paying += 1;
      g.cash += r.cash;
      g.members += r.members;
      m.set(k, g);
    }
    const list = [...m.values()].map((g) => ({ ...g, paying_rate: pct(g.paying, g.hosts), arpa: g.hosts ? Math.round(g.cash / g.hosts) : 0 }));
    return order ? order.map((k) => list.find((g) => g.key === k) || { key: k, hosts: 0, paying: 0, cash: 0, members: 0, paying_rate: null, arpa: 0 }) : list.sort((a, b) => b.hosts - a.hosts);
  };
  const size = (n) => (n === 0 ? '0' : n <= 20 ? '1-20' : n <= 50 ? '21-50' : n <= 100 ? '51-100' : n <= 300 ? '101-300' : '300+');
  const product = (r) => (r.clubs && r.communities ? 'both' : r.communities ? 'community' : r.clubs ? 'club' : r.xeve ? 'xeve' : 'none');
  const activity = (r) => (r.since == null ? 'never' : r.since <= 30 ? 'active' : r.since <= 90 ? 'cooling' : 'dormant');
  const tenure = (r) => (r.age_days < 30 ? 'lt1' : r.age_days < 90 ? '1_3' : r.age_days < 180 ? '3_6' : r.age_days < 365 ? '6_12' : 'gt12');
  const sport = (r) => (r.sports.size > 1 ? 'both' : r.sports.has('badminton') ? 'badminton' : r.sports.size ? 'pickleball' : 'none');
  // Value segments (RFM-style): what to do with each group.
  const value = (r) => {
    if (r.gifted) return 'gifted';
    if (r.paying && r.ends_in != null && r.ends_in <= 14) return 'expiring';
    if (r.paying && (r.since == null || r.since > 30)) return 'at_risk';
    if (r.paying && r.orders >= 2) return 'loyal';
    if (r.paying && r.first_paid && Date.parse(today) - Date.parse(r.first_paid) <= 30 * DAY) return 'new_paying';
    if (r.paying) return 'paying';
    if (r.orders > 0) return 'churned';
    if (r.tier === 'trial') return 'trial';
    return activity(r) === 'active' ? 'free_active' : 'free_idle';
  };
  return {
    hosts: rows.length,
    by_plan: group((r) => r.tier, ['free', 'trial', 'basic', 'standard', 'advanced', 'pro']),
    by_sm_plan: group((r) => r.sm_tier, ['none', 'basic', 'standard', 'advanced', 'pro']),
    by_size: group((r) => size(r.members), ['0', '1-20', '21-50', '51-100', '101-300', '300+']),
    by_product: group(product, ['club', 'community', 'both', 'xeve', 'none']),
    by_sport: group(sport, ['pickleball', 'badminton', 'both', 'none']),
    by_region: group((r) => (r.provinces.size ? [...r.provinces] : ['—'])).slice(0, 12),
    by_activity: group(activity, ['active', 'cooling', 'dormant', 'never']),
    by_tenure: group(tenure, ['lt1', '1_3', '3_6', '6_12', 'gt12']),
    by_value: group(value, ['loyal', 'new_paying', 'paying', 'expiring', 'at_risk', 'gifted', 'churned', 'trial', 'free_active', 'free_idle']),
  };
}

// Sign-up cohorts (organisers by the month their account was made) and the funnel.
function cohorts(d, months) {
  const hostSet = new Set(d.hostIds);
  const paid = d.orders.filter((o) => o.status === 'paid' && o.confirmed_at);
  const everPaid = new Set(paid.map((o) => o.host_id));
  const recent = S.shiftYmd(d.today, -30);
  const activeHosts = new Set(d.events.filter((e) => e.event_date >= recent && e.event_date <= d.today).map((e) => e.host_id));
  const rows = months.slice(-6).map((m) => {
    const accounts = d.users.filter((u) => ym(dayOf(u.created_at)) === m);
    const hosts = accounts.filter((u) => hostSet.has(u.id));
    const ids = hosts.map((u) => u.id);
    const paying = ids.filter((id) => d.payingIds.has(id)).length;
    return {
      month: m,
      accounts: accounts.length,
      hosts: ids.length,
      host_rate: pct(ids.length, accounts.length),
      ever_paid: pct(ids.filter((id) => everPaid.has(id)).length, ids.length),
      paying_now: pct(paying, ids.length),
      active_now: pct(ids.filter((id) => activeHosts.has(id)).length, ids.length),
    };
  });
  // Each step keeps only the accounts of the step before, so the funnel narrows.
  const payingIds = d.payingIds;
  const requested = new Set(d.requests.map((r) => r.user_id));
  const all = d.users.map((u) => u.id);
  const onboarded = d.users.filter((u) => u.onboarded_at || hostSet.has(u.id)).map((u) => u.id);
  const managerOf = new Map(d.users.map((u) => [u.id, u.account_role === 'manager']));
  const intent = onboarded.filter((id) => managerOf.get(id) || requested.has(id) || hostSet.has(id));
  const hosts = intent.filter((id) => hostSet.has(id));
  const paidOnce = hosts.filter((id) => everPaid.has(id) || payingIds.has(id));
  const payingNow = paidOnce.filter((id) => payingIds.has(id));
  const steps = [['accounts', all.length], ['onboarded', onboarded.length], ['managers', intent.length], ['hosts', hosts.length], ['ever_paid', paidOnce.length], ['paying', payingNow.length]];
  const funnel = steps.map(([key, n], i) => ({ key, count: n, of_first: pct(n, steps[0][1]), of_prev: i ? pct(n, steps[i - 1][1]) : null }));
  return { cohorts: rows, funnel };
}

/**
 * @param {object} d  { today, months: 6|12|24, users, subs, orders, redemptions, clubs,
 *                      members: [{club_id}], events: [{host_id, club_id, event_date}],
 *                      requests: [{user_id}], hostIds: [] }
 */
function analytics(input) {
  const d = { ...input, ...S.payingSplit(input.hostIds, input.subs, input.orders.filter((o) => o.status === 'paid' && o.confirmed_at), input.today) };
  const months = lastMonths(ym(d.today), d.months || 12);
  const rev = revenue(d, months);
  const fin = finance(rev, d);
  // The current month shows today's MRR / paying hosts, the same numbers as the overview.
  const cur = rev.by_month[rev.by_month.length - 1];
  if (cur) Object.assign(cur, { mrr: fin.mrr, paying_hosts: fin.paying_hosts });
  const prev = rev.by_month[rev.by_month.length - 2];
  fin.mrr_growth = prev && prev.mrr ? pct(fin.mrr - prev.mrr, prev.mrr) : null;
  return { months, revenue: rev, finance: fin, segments: segments(d), ...cohorts(d, months) };
}

module.exports = { analytics, lastMonths, classify, coverage };
