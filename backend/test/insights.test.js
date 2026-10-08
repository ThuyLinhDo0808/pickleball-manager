const test = require('node:test');
const assert = require('node:assert');
const { insights, monthsBetween } = require('../src/services/insights');

test('monthsBetween spans the year end', () => {
  assert.deepStrictEqual(monthsBetween('2026-11-01', '2027-02-10'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('insights: frequency, active/inactive, retention, renewal, revenue, activities', () => {
  const members = [
    { id: 'a', full_name: 'An', member_type: 'fixed', is_active: true, joined_on: '2026-08-01' },
    { id: 'b', full_name: 'Bình', member_type: 'fixed', is_active: true, joined_on: '2026-09-05' },
    { id: 'c', full_name: 'Cường', member_type: 'fixed', is_active: true, joined_on: '2026-08-01' },
    { id: 'g', full_name: 'Guest', member_type: 'guest', is_active: true, joined_on: '2026-09-01' },
  ];
  const events = [
    { id: 'e1', title: 'T7', event_date: '2026-08-08', kind: 'weekly', slots: 4 },
    { id: 'e2', title: 'T7', event_date: '2026-09-12', kind: 'weekly', slots: 4 },
    { id: 'e3', title: 'Giao lưu', event_date: '2026-09-20', kind: 'game', slots: 8 },
    { id: 'e4', title: 'Sắp tới', event_date: '2026-10-20', kind: 'weekly', slots: 4 },
  ];
  const participants = [
    { event_id: 'e1', member_id: 'a', status: 'checked_in' },
    { event_id: 'e1', member_id: 'c', status: 'registered' }, // past + registered = played
    { event_id: 'e2', member_id: 'a', status: 'checked_in' },
    { event_id: 'e2', member_id: 'b', status: 'no_show' }, // doesn't count
    { event_id: 'e3', member_id: 'a', status: 'checked_in' },
    { event_id: 'e3', member_id: 'g', status: 'checked_in' },
    { event_id: 'e4', member_id: 'b', status: 'registered' }, // future: not played yet
  ];
  const memberships = [
    { id: 'm1', club_member_id: 'a', plan_id: 'p', starts_on: '2026-08-01', ends_on: '2026-08-31', status: 'paid', amount: 300000 },
    { id: 'm2', club_member_id: 'a', plan_id: 'p', starts_on: '2026-09-01', ends_on: '2026-09-30', status: 'paid', amount: 300000 },
    { id: 'm3', club_member_id: 'c', plan_id: 'p', starts_on: '2026-08-01', ends_on: '2026-08-31', status: 'paid', amount: 300000 },
  ];
  const money = [
    { type: 'income', amount: 200000, occurred_on: '2026-09-20', event_id: 'e3' },
    { type: 'expense', amount: 50000, occurred_on: '2026-09-20', event_id: 'e3' },
  ];
  const r = insights({ members, events, participants, memberships, plans: [{ id: 'p', name: 'Tháng', period: 'month' }], money, from: '2026-08-01', to: '2026-10-31', today: '2026-10-08' });

  assert.strictEqual(r.summary.official, 3);
  assert.deepStrictEqual([r.summary.active, r.summary.at_risk, r.summary.inactive], [1, 1, 1]);
  const an = r.frequency.members.find((m) => m.member_id === 'a');
  assert.strictEqual(an.sessions, 3); assert.strictEqual(an.per_month, 1);
  const sep = r.by_month.find((m) => m.month === '2026-09');
  assert.strictEqual(sep.players, 2); // a + guest
  assert.strictEqual(sep.retention, 50); // of {a, c} in Aug only a came back
  assert.strictEqual(sep.income, 200000 + 300000);
  assert.strictEqual(r.summary.renewal, 33); // ended: m1 (renewed by m2), m2, m3 (not renewed)
  assert.strictEqual(r.by_plan[0].sold, 3);
  const game = r.by_activity.find((k) => k.kind === 'game');
  assert.strictEqual(game.profit_per_session, 150000); assert.strictEqual(game.avg_fill, 25);
  assert.strictEqual(r.summary.sessions, 3);
});
