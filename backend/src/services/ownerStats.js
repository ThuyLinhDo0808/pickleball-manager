// Platform numbers for the owner dashboard. Pure functions (rows in, numbers out) so
// they can be tested without a database.

const DAY = 86400000;
const vnYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

function shiftYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday of the week (Vietnam time) for a YYYY-MM-DD.
function mondayOf(ymd) {
  const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftYmd(ymd, -((wd + 6) % 7));
}

// { this: [from, to), last: [from, to) } as YYYY-MM-DD, by Vietnam calendar week.
function weekWindows(today) {
  const mon = mondayOf(today);
  return { this: [mon, shiftYmd(mon, 7)], last: [shiftYmd(mon, -7), mon] };
}

const dayOf = (ts) => (ts ? vnYmd(new Date(ts)) : null);
const inRange = (ymd, [from, to]) => !!ymd && ymd >= from && ymd < to;

// { this, last, change } counts of timestamps by week.
function weekly(timestamps, today) {
  const w = weekWindows(today);
  const days = timestamps.map(dayOf);
  const a = days.filter((d) => inRange(d, w.this)).length;
  const b = days.filter((d) => inRange(d, w.last)).length;
  return { this: a, last: b, change: b ? Math.round(((a - b) / b) * 100) : null };
}

// Organisers = accounts that own a club or run Xé Vé games; the first time they did
// either is when they became a host.
function hostStarts(clubs, xeveEvents) {
  const first = new Map();
  for (const r of [...clubs, ...xeveEvents]) {
    const prev = first.get(r.host_id);
    if (!prev || r.created_at < prev) first.set(r.host_id, r.created_at);
  }
  return first; // host_id -> created_at
}

// Paying = on a paid tier, or a Social Manager that was paid for.
const isPaying = (s) => (s.tier && s.tier !== 'free') || (!!s.social_manager && !!s.social_manager_paid_until);

// Free -> paid conversion among organisers.
function conversion(hostIds, subs) {
  const byHost = new Map(subs.map((s) => [s.host_id, s]));
  const total = hostIds.length;
  const paying = hostIds.filter((id) => byHost.get(id) && isPaying(byHost.get(id))).length;
  return { hosts: total, paying, rate: total ? Math.round((paying / total) * 1000) / 10 : 0 };
}

// MRR: each running paid period counts its order's price per month (a 12-month order
// of 1.188.000đ adds 99.000đ). Periods switched on by hand (no order) add nothing.
function mrr(subs, paidOrders, today) {
  const latest = new Map(); // `${host}|${kind}` -> order (newest confirmed)
  for (const o of paidOrders) {
    const k = `${o.host_id}|${o.kind}`;
    const prev = latest.get(k);
    if (!prev || (o.confirmed_at || '') > (prev.confirmed_at || '')) latest.set(k, o);
  }
  let total = 0;
  for (const s of subs) {
    if (s.tier !== 'free' && s.tier_paid_until && s.tier_paid_until >= today) {
      const o = latest.get(`${s.host_id}|tier`);
      if (o && o.tier === s.tier) total += Number(o.amount) / o.months;
    }
    if (s.social_manager && s.social_manager_paid_until && s.social_manager_paid_until >= today) {
      const o = latest.get(`${s.host_id}|social_manager`);
      if (o) total += Number(o.amount) / o.months;
    }
  }
  return Math.round(total);
}

// Money confirmed in a calendar month ('YYYY-MM').
const cashIn = (paidOrders, month) => paidOrders.filter((o) => (dayOf(o.confirmed_at) || '').startsWith(month)).reduce((s, o) => s + Number(o.amount), 0);

// Plans ending within `days` days (today included), soonest first.
function expiring(subs, today, days) {
  const until = shiftYmd(today, days);
  const out = [];
  for (const s of subs) {
    if (s.tier !== 'free' && s.tier_paid_until && s.tier_paid_until >= today && s.tier_paid_until <= until) {
      out.push({ host_id: s.host_id, kind: 'tier', tier: s.tier, until: s.tier_paid_until });
    }
    if (s.social_manager && s.social_manager_paid_until && s.social_manager_paid_until >= today && s.social_manager_paid_until <= until) {
      out.push({ host_id: s.host_id, kind: 'social_manager', until: s.social_manager_paid_until });
    }
  }
  return out
    .map((x) => ({ ...x, days_left: Math.round((Date.parse(x.until) - Date.parse(today)) / DAY) }))
    .sort((a, b) => a.until.localeCompare(b.until));
}

// Last 30 days: renewals (a paid order extending a plan the host had paid for before)
// vs plans that ran out and were not renewed (a renewed plan's end date has moved on).
function renewal(subs, paidOrders, today) {
  const from = shiftYmd(today, -30);
  let lapsed = 0;
  for (const s of subs) {
    for (const end of [s.tier_paid_until, s.social_manager_paid_until]) if (end && end < today && end >= from) lapsed += 1;
  }
  const sorted = [...paidOrders].sort((a, b) => (a.confirmed_at || '').localeCompare(b.confirmed_at || ''));
  const seen = new Set();
  let renewed = 0;
  for (const o of sorted) {
    const k = `${o.host_id}|${o.kind}`;
    if (seen.has(k) && (dayOf(o.confirmed_at) || '') >= from) renewed += 1;
    seen.add(k);
  }
  return { renewed, lapsed, rate: renewed + lapsed ? Math.round((renewed / (renewed + lapsed)) * 100) : null };
}

// Counts per day for the last `n` days: [{ date, count }].
function daily(timestamps, today, n = 14) {
  const counts = new Map();
  for (const ts of timestamps) {
    const d = dayOf(ts);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  return Array.from({ length: n }, (_, i) => {
    const date = shiftYmd(today, i - n + 1);
    return { date, count: counts.get(date) || 0 };
  });
}

module.exports = { vnYmd, shiftYmd, mondayOf, weekWindows, weekly, hostStarts, isPaying, conversion, mrr, cashIn, expiring, renewal, daily };
