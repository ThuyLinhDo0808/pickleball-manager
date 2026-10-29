const test = require('node:test');
const assert = require('node:assert');
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const S = require('../src/services/coachSchedule');

test('weekdayOf counts Monday as 0 and Sunday as 6', () => {
  assert.strictEqual(S.weekdayOf('2026-11-02'), 0); // Monday
  assert.strictEqual(S.weekdayOf('2026-11-08'), 6); // Sunday
});

test('expandDates lists every Tue / Thu in the range, inclusive', () => {
  const d = S.expandDates([1, 3], '2026-11-01', '2026-11-14');
  assert.deepStrictEqual(d, ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']);
});

test('expandDates refuses more than 200 sessions', () => {
  assert.throws(() => S.expandDates([0, 1, 2, 3, 4, 5, 6], '2026-01-01', '2026-12-31'), (e) => e.code === 'too_many_sessions');
});

test('cleanClass builds a single-session class from one date', () => {
  const c = S.cleanClass({ title: 'Buổi thử', kind: 'single', date: '2026-11-05', start_time: '18:00' }, { court_name: 'Sân A' }, { creating: true });
  assert.strictEqual(c.date_from, '2026-11-05');
  assert.deepStrictEqual(c.weekdays, [3]);
  assert.strictEqual(c.court_name, 'Sân A');
  assert.strictEqual(c.start_time, '18:00:00');
  assert.strictEqual(c.capacity, 8);
});

test('cleanClass needs a weekday for a repeating class', () => {
  assert.throws(() => S.cleanClass({ title: 'Lớp', kind: 'group', date_from: '2026-11-01', date_to: '2026-11-30', start_time: '18:00', weekdays: [] }, {}, { creating: true }), (e) => e.code === 'bad_weekdays');
});

test('cleanClass private defaults to one seat', () => {
  const c = S.cleanClass({ title: '1-1', kind: 'private', date_from: '2026-11-01', date_to: '2026-11-30', start_time: '07:30', weekdays: [5] }, {}, { creating: true });
  assert.strictEqual(c.capacity, 1);
});

test('endMs adds the duration to the start', () => {
  const ms = S.endMs({ session_date: '2026-11-05', start_time: '18:00:00', duration_min: 90 });
  assert.strictEqual(ms, Date.parse('2026-11-05T18:00:00') + 90 * 60000);
});
