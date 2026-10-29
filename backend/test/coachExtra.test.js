// Coach Manager (đợt C7): free 1-1 times inside the coach's open hours.
process.env.SUPABASE_URL ||= 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freeTimes, shortName } = require('../src/services/coachExtra');

// 2026-11-02 is a Monday (weekday 0).
const slot = { id: 's1', weekday: 0, start_time: '07:00', end_time: '10:00', lesson_min: 60, price: 300000, active: true };

test('a 3-hour Monday window gives three 1-hour lessons', () => {
  const out = freeTimes({ slots: [slot], busy: {}, today: '2026-11-02', nowMin: 0, days: 1, leadHours: 0 });
  assert.deepEqual(out.map((x) => x.start_time), ['07:00', '08:00', '09:00']);
  assert.equal(out[0].price, 300000);
});

test('times overlapping a session already on the calendar are left out', () => {
  const out = freeTimes({ slots: [slot], busy: { '2026-11-02': [['08:30', 60]] }, today: '2026-11-02', nowMin: 0, days: 1, leadHours: 0 });
  assert.deepEqual(out.map((x) => x.start_time), ['07:00']);
});

test('today, times before now + lead hours are left out; other days repeat weekly', () => {
  const out = freeTimes({ slots: [slot], busy: {}, today: '2026-11-02', nowMin: 6 * 60, days: 8, leadHours: 2 });
  assert.deepEqual(out.map((x) => `${x.date} ${x.start_time}`), ['2026-11-02 08:00', '2026-11-02 09:00', '2026-11-09 07:00', '2026-11-09 08:00', '2026-11-09 09:00']);
});

test('inactive slots and other weekdays give nothing', () => {
  assert.equal(freeTimes({ slots: [{ ...slot, active: false }], busy: {}, today: '2026-11-02', days: 7, leadHours: 0 }).length, 0);
  assert.equal(freeTimes({ slots: [slot], busy: {}, today: '2026-11-03', days: 6, leadHours: 0 }).length, 0);
});

test('reviewers are shown by their given name', () => {
  assert.equal(shortName('Lê Thị Tay'), 'Tay');
  assert.equal(shortName(''), '');
});
