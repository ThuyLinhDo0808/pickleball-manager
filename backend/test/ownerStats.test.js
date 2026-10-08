const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/services/ownerStats');

test('weekWindows: Monday-based weeks', () => {
  assert.deepStrictEqual(S.weekWindows('2026-10-08'), { this: ['2026-10-05', '2026-10-12'], last: ['2026-09-28', '2026-10-05'] });
  assert.strictEqual(S.mondayOf('2026-10-11'), '2026-10-05'); // Sunday belongs to the week before
});

test('weekly: this vs last week with % change (Vietnam time)', () => {
  const r = S.weekly(['2026-10-05T01:00:00Z', '2026-10-07T10:00:00Z', '2026-10-01T03:00:00Z', '2026-10-04T18:00:00Z'], '2026-10-08');
  // 2026-10-04T18:00Z is already Monday 01:00 in Vietnam.
  assert.deepStrictEqual(r, { this: 3, last: 1, change: 200 });
});

test('conversion counts paid tiers and paid Social Manager', () => {
  const subs = [
    { host_id: 'a', tier: 'basic' },
    { host_id: 'b', tier: 'free', social_manager: true, social_manager_paid_until: '2026-12-01' },
    { host_id: 'c', tier: 'free', social_manager: true, social_manager_paid_until: null },
    { host_id: 'd', tier: 'free' },
  ];
  assert.deepStrictEqual(S.conversion(['a', 'b', 'c', 'd'], subs), { hosts: 4, paying: 2, rate: 50 });
});

test('mrr spreads multi-month orders and ignores lapsed or hand-made plans', () => {
  const today = '2026-10-08';
  const subs = [
    { host_id: 'a', tier: 'basic', tier_paid_until: '2027-10-01' },
    { host_id: 'b', tier: 'pro', tier_paid_until: '2026-10-01' }, // lapsed
    { host_id: 'c', tier: 'standard', tier_paid_until: null }, // switched on by hand
    { host_id: 'd', tier: 'free', social_manager: true, social_manager_paid_until: '2026-11-08' },
  ];
  const orders = [
    { host_id: 'a', kind: 'tier', tier: 'basic', months: 12, amount: 1188000, confirmed_at: '2026-10-01T00:00:00Z' },
    { host_id: 'b', kind: 'tier', tier: 'pro', months: 1, amount: 499000, confirmed_at: '2026-09-01T00:00:00Z' },
    { host_id: 'd', kind: 'social_manager', months: 1, amount: 89000, confirmed_at: '2026-10-08T00:00:00Z' },
  ];
  assert.strictEqual(S.mrr(subs, orders, today), 99000 + 89000);
  assert.strictEqual(S.cashIn(orders, '2026-10'), 1188000 + 89000);
});

test('expiring lists plans ending within N days, soonest first', () => {
  const subs = [
    { host_id: 'a', tier: 'basic', tier_paid_until: '2026-10-15' },
    { host_id: 'b', tier: 'pro', tier_paid_until: '2026-10-10' },
    { host_id: 'c', tier: 'pro', tier_paid_until: '2026-11-10' },
    { host_id: 'd', tier: 'free', social_manager: true, social_manager_paid_until: '2026-10-08' },
  ];
  const r = S.expiring(subs, '2026-10-08', 7);
  assert.deepStrictEqual(r.map((x) => [x.host_id, x.days_left]), [['d', 0], ['b', 2], ['a', 7]]);
  assert.strictEqual(S.expiring(subs, '2026-10-08', 3).length, 2);
});

test('renewal: renewed orders vs lapsed plans in the last 30 days', () => {
  const subs = [
    { host_id: 'a', tier: 'free', tier_paid_until: '2026-10-01' }, // lapsed
    { host_id: 'b', tier: 'basic', tier_paid_until: '2026-12-01' }, // renewed
  ];
  const orders = [
    { host_id: 'b', kind: 'tier', confirmed_at: '2026-08-01T00:00:00Z' },
    { host_id: 'b', kind: 'tier', confirmed_at: '2026-10-01T00:00:00Z' },
    { host_id: 'a', kind: 'tier', confirmed_at: '2026-09-01T00:00:00Z' },
  ];
  assert.deepStrictEqual(S.renewal(subs, orders, '2026-10-08'), { renewed: 1, lapsed: 1, rate: 50 });
});

test('hostStarts takes the first club or Xé Vé game', () => {
  const m = S.hostStarts([{ host_id: 'a', created_at: '2026-10-05T00:00:00Z' }], [{ host_id: 'a', created_at: '2026-09-01T00:00:00Z' }, { host_id: 'b', created_at: '2026-10-06T00:00:00Z' }]);
  assert.deepStrictEqual([...m.entries()], [['a', '2026-09-01T00:00:00Z'], ['b', '2026-10-06T00:00:00Z']]);
});

test('trials: active list and conversion after the trial', () => {
  const subs = [
    { host_id: 'a', tier: 'standard', tier_paid_until: '2026-10-20', trial_ends_on: '2026-10-20', trial_started_at: '2026-10-06T00:00:00Z' },
    { host_id: 'b', tier: 'free', tier_paid_until: null, trial_ends_on: '2026-10-01', trial_started_at: '2026-09-17T00:00:00Z' },
    { host_id: 'c', tier: 'basic', tier_paid_until: '2026-11-01', trial_ends_on: '2026-10-02', trial_started_at: '2026-09-18T00:00:00Z' },
  ];
  const orders = [{ host_id: 'c', kind: 'tier', confirmed_at: '2026-10-02T03:00:00Z' }];
  const t = S.trials(subs, orders, '2026-10-08');
  assert.deepStrictEqual(t.active.map((x) => [x.host_id, x.days_left]), [['a', 12]]);
  assert.deepStrictEqual([t.ended, t.converted, t.rate], [2, 1, 50]);
  assert.strictEqual(S.isPaying(subs[0]), false, 'a trial is not paying');
  assert.deepStrictEqual(S.tierMix(subs, ['a', 'b', 'c', 'd']), { free: 2, basic: 1, standard: 0, advanced: 0, pro: 0, trial: 1 });
});
