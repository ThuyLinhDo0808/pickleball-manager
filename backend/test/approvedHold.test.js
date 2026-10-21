const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
const { approvedHoldMs, eventStartMs } = require('../src/services/attendance');

const H = 3600000;
const ev = { event_date: '2026-10-24', start_time: '17:00' };

test('an approved place is held until 12 hours before the start', () => {
  const now = Date.parse('2026-10-21T09:33:00Z');
  const until = now + approvedHoldMs(ev, now);
  assert.strictEqual(until, eventStartMs(ev) - 12 * H);
  assert.strictEqual(new Date(until).toISOString(), '2026-10-23T22:00:00.000Z'); // 24/10 05:00 giờ VN
});

test('approved later than 12 hours before the start: 30 minutes', () => {
  const now = eventStartMs(ev) - 5 * H;
  assert.strictEqual(approvedHoldMs(ev, now), 30 * 60000);
  assert.strictEqual(approvedHoldMs(ev, eventStartMs(ev) - 12 * H - 10 * 60000), 30 * 60000);
});
