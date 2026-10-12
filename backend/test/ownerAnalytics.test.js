const test = require('node:test');
const assert = require('node:assert');
const { analytics, lastMonths, classify } = require('../src/services/ownerAnalytics');

test('lastMonths crosses the year end', () => {
  assert.deepStrictEqual(lastMonths('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('classify: first purchase, renewal, upgrade', () => {
  const k = classify([
    { id: 1, host_id: 'a', kind: 'tier', confirmed_at: '2026-01-02T03:00:00Z' },
    { id: 2, host_id: 'a', kind: 'tier', confirmed_at: '2026-02-02T03:00:00Z' },
    { id: 3, host_id: 'a', kind: 'tier', confirmed_at: '2026-02-10T03:00:00Z', upgrade_from: 'basic' },
    { id: 4, host_id: 'a', kind: 'social_manager', confirmed_at: '2026-02-11T03:00:00Z' },
  ]);
  assert.deepStrictEqual([k.get(1), k.get(2), k.get(3), k.get(4)], ['new', 'renewal', 'upgrade', 'new']);
});

test('analytics: revenue by month, churn, segments, funnel narrows', () => {
  const today = '2026-10-15';
  const users = [
    { id: 'h1', email: 'h1@x', created_at: '2026-08-01T00:00:00Z', account_role: 'manager', onboarded_at: '2026-08-01T00:00:00Z' },
    { id: 'h2', email: 'h2@x', created_at: '2026-09-01T00:00:00Z', account_role: 'manager', onboarded_at: '2026-09-01T00:00:00Z' },
    { id: 'h3', email: 'h3@x', created_at: '2026-10-01T00:00:00Z', account_role: 'manager', onboarded_at: '2026-10-01T00:00:00Z' },
    { id: 'p1', email: 'p1@x', created_at: '2026-10-02T00:00:00Z', account_role: 'player', onboarded_at: '2026-10-02T00:00:00Z' },
    { id: 'p2', email: 'p2@x', created_at: '2026-10-03T00:00:00Z', account_role: null, onboarded_at: null },
  ];
  const orders = [
    // h1: Aug one month (ran out in Sept = churn), then came back in October
    { id: 1, host_id: 'h1', kind: 'tier', tier: 'basic', months: 1, amount: 100000, status: 'paid', created_at: '2026-08-02T00:00:00Z', confirmed_at: '2026-08-02T00:00:00Z' },
    { id: 2, host_id: 'h1', kind: 'tier', tier: 'basic', months: 1, amount: 100000, status: 'paid', created_at: '2026-10-05T00:00:00Z', confirmed_at: '2026-10-05T00:00:00Z' },
    // h2: 12 months pro in September, with a promo discount
    { id: 3, host_id: 'h2', kind: 'tier', tier: 'pro', months: 12, amount: 1200000, discount_amount: 120000, promo_code_id: 'x', status: 'paid', created_at: '2026-09-03T00:00:00Z', confirmed_at: '2026-09-03T00:00:00Z' },
    { id: 4, host_id: 'h3', kind: 'tier', tier: 'basic', months: 1, amount: 100000, status: 'cancelled', created_at: '2026-10-04T00:00:00Z' },
    { id: 5, host_id: 'h3', kind: 'social_manager', months: 1, amount: 89000, status: 'pending', created_at: '2026-10-06T00:00:00Z' },
  ];
  const subs = [
    { host_id: 'h1', tier: 'basic', tier_paid_until: '2026-11-04' },
    { host_id: 'h2', tier: 'pro', tier_paid_until: '2027-08-29' },
    { host_id: 'h3', tier: 'free' },
  ];
  const clubs = [
    { id: 'c1', host_id: 'h1', kind: 'club', sport: 'pickleball', province: 'Hà Nội' },
    { id: 'c2', host_id: 'h2', kind: 'community', sport: 'badminton', province: 'TP HCM' },
    { id: 'c3', host_id: 'h3', kind: 'club', sport: 'pickleball', province: 'Hà Nội' },
  ];
  const members = [...Array(25).fill({ club_id: 'c1' }), ...Array(5).fill({ club_id: 'c2' })];
  const events = [{ host_id: 'h1', club_id: 'c1', event_date: '2026-10-10' }, { host_id: 'h2', club_id: 'c2', event_date: '2026-07-01' }];
  const r = analytics({ today, months: 6, users, subs, orders, redemptions: [{ id: 1 }], clubs, members, events, requests: [{ user_id: 'h3' }], hostIds: ['h1', 'h2', 'h3'] });

  const m = Object.fromEntries(r.revenue.by_month.map((x) => [x.month, x]));
  assert.strictEqual(m['2026-08'].cash, 100000);
  assert.strictEqual(m['2026-09'].cash, 1200000);
  assert.strictEqual(m['2026-10'].cash, 100000);
  assert.strictEqual(m['2026-10'].renewal, 100000); // h1 came back = renewal
  assert.strictEqual(m['2026-09'].new, 1200000);
  assert.strictEqual(m['2026-09'].mrr, 100000); // 1.2M / 12
  assert.strictEqual(r.revenue.totals.window, 1400000);
  assert.strictEqual(r.revenue.totals.discounts, 120000);
  assert.deepStrictEqual(r.revenue.totals.pending, { count: 1, amount: 89000 });
  assert.strictEqual(r.revenue.totals.cancelled.count, 1);
  assert.strictEqual(r.revenue.by_tier.find((x) => x.tier === 'pro').cash, 1200000);
  assert.strictEqual(r.revenue.by_length.find((x) => x.months === 12).orders, 1);
  assert.strictEqual(r.revenue.promos.orders, 1);
  assert.strictEqual(r.revenue.top_hosts[0].host_id, 'h2');

  // churn: h1 paid at end of Aug, not at end of Sept
  const sep = r.finance.churn.by_month.find((x) => x.month === '2026-09');
  assert.deepStrictEqual([sep.start, sep.lost], [1, 1]);
  assert.strictEqual(r.finance.paying_hosts, 2);
  assert.ok(r.finance.mrr > 0 && r.finance.arpu > 0);

  const seg = r.segments;
  assert.strictEqual(seg.by_product.find((x) => x.key === 'community').hosts, 1);
  assert.strictEqual(seg.by_size.find((x) => x.key === '21-50').hosts, 1); // h1 has 25 members
  assert.strictEqual(seg.by_sport.find((x) => x.key === 'badminton').hosts, 1);
  assert.strictEqual(seg.by_region.find((x) => x.key === 'Hà Nội').hosts, 2);
  assert.strictEqual(seg.by_activity.find((x) => x.key === 'active').hosts, 1);
  assert.strictEqual(seg.by_value.find((x) => x.key === 'at_risk').hosts, 1); // h2 paying, idle 100+ days

  const f = Object.fromEntries(r.funnel.map((x) => [x.key, x.count]));
  assert.deepStrictEqual([f.accounts, f.onboarded, f.managers, f.hosts, f.ever_paid, f.paying], [5, 4, 3, 3, 2, 2]);
  for (let i = 1; i < r.funnel.length; i += 1) assert.ok(r.funnel[i].count <= r.funnel[i - 1].count);
  assert.strictEqual(r.cohorts.find((x) => x.month === '2026-10').hosts, 1);
});

test('analytics: a plan given for free is counted apart from paying hosts', () => {
  const today = '2026-10-15';
  const users = ['a', 'b', 'c'].map((id) => ({ id, email: `${id}@x`, created_at: '2026-09-01T00:00:00Z', account_role: 'manager', onboarded_at: '2026-09-01T00:00:00Z' }));
  const orders = [
    { id: 1, host_id: 'a', kind: 'tier', tier: 'basic', months: 3, amount: 300000, status: 'paid', created_at: '2026-10-01T00:00:00Z', confirmed_at: '2026-10-01T00:00:00Z' },
    // c paid long ago; the plan now runs on months the owner added for free
    { id: 2, host_id: 'c', kind: 'tier', tier: 'basic', months: 1, amount: 100000, status: 'paid', created_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-01T00:00:00Z' },
  ];
  const subs = [
    { host_id: 'a', tier: 'basic', tier_paid_until: '2026-12-30' },
    { host_id: 'b', tier: 'pro', tier_paid_until: '2027-01-01' }, // never paid: a gift
    { host_id: 'c', tier: 'basic', tier_paid_until: '2026-12-01' },
  ];
  const r = analytics({ today, months: 6, users, subs, orders, redemptions: [], clubs: [], members: [], events: [], requests: [], hostIds: ['a', 'b', 'c'] });
  assert.strictEqual(r.finance.paying_hosts, 1);
  assert.strictEqual(r.finance.gifted_hosts, 2);
  assert.strictEqual(r.finance.arpu, 100000); // 300k / 3 months, only host a
  assert.strictEqual(r.segments.by_value.find((x) => x.key === 'gifted').hosts, 2);
  const f = Object.fromEntries(r.funnel.map((x) => [x.key, x.count]));
  assert.strictEqual(f.ever_paid, 2); // a and c, not b
  assert.strictEqual(f.paying, 1);
});
