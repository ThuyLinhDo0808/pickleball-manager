// The deduction rule of Coach Manager (đợt C4): which attendance charges a session.
process.env.SUPABASE_URL ||= 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const test = require('node:test');
const assert = require('node:assert/strict');
const { charges, deductMode, excuseDeadlineMs, startMs } = require('../src/services/coachAttendance');

test('default rule: present and no-show charge, an excuse on time does not, a late excuse does', () => {
  const m = 'present_or_noshow';
  assert.equal(charges(m, 'present', false), true);
  assert.equal(charges(m, 'absent', false), true);
  assert.equal(charges(m, 'excused', false), false);
  assert.equal(charges(m, 'excused', true), true);
});

test('present_only charges only when present', () => {
  const m = 'present_only';
  assert.equal(charges(m, 'present', false), true);
  assert.equal(charges(m, 'absent', false), false);
  assert.equal(charges(m, 'excused', false), false);
  assert.equal(charges(m, 'excused', true), false);
});

test('always charges every status', () => {
  for (const s of ['present', 'absent', 'excused']) assert.equal(charges('always', s, false), true);
});

test('the class rule overrides the coach rule; default when neither is set', () => {
  assert.equal(deductMode({ deduct_mode: 'present_only' }, { deduct_mode: 'always' }), 'always');
  assert.equal(deductMode({ deduct_mode: 'present_only' }, { deduct_mode: null }), 'present_only');
  assert.equal(deductMode({}, {}), 'present_or_noshow');
});

test('the excuse deadline is cancel_hours before the session start', () => {
  const s = { session_date: '2026-11-05', start_time: '18:30:00', duration_min: 90 };
  assert.equal(excuseDeadlineMs(s, { cancel_hours: 12 }), startMs(s) - 12 * 3600000);
  assert.equal(excuseDeadlineMs(s, {}), startMs(s));
});
