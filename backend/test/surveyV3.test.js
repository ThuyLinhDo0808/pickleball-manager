// Khảo sát bản 3: how long it stays open, and the new answers in the summary.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const test = require('node:test');
const assert = require('node:assert/strict');
const { closesFrom, summarizeAnswers } = require('../src/services/survey');
const { eventEndMs } = require('../src/services/attendance');

const ev = { event_date: '2026-10-24', start_time: '17:00', end_time: '19:00' };
const H = 3600000;

test('12h: closes 12 hours after the session ends', () => {
  assert.equal(closesFrom(ev, '12h', null), eventEndMs(ev) + 12 * H);
});

test('next session: closes when the next session starts; a week when there is none', () => {
  const next = eventEndMs(ev) + 3 * 24 * H;
  assert.equal(closesFrom(ev, 'next_session', next), next);
  assert.equal(closesFrom(ev, 'next_session', null), eventEndMs(ev) + 7 * 24 * H);
  // A "next" that starts before this one ends is not a next session.
  assert.equal(closesFrom(ev, 'next_session', eventEndMs(ev) - H), eventEndMs(ev) + 7 * 24 * H);
});

test('summary: % happy with the organisation and % balanced matches', () => {
  const s = summarizeAnswers([
    { rating: 5, org_satisfaction: 'very', match_balance: 'yes', come_back: 'yes' },
    { rating: 4, org_satisfaction: 'yes', match_balance: 'some', come_back: 'maybe' },
    { rating: 2, org_satisfaction: 'no', match_balance: 'no', come_back: 'no' },
    { rating: 3 }, // an old answer without the new questions
  ]);
  assert.equal(s.org_happy_rate, 67);
  assert.equal(s.balance_rate, 33);
  assert.deepEqual(s.org, { no: 1, yes: 1, very: 1 });
  assert.deepEqual(s.balance, { yes: 1, no: 1, some: 1 });
  assert.equal(s.count, 4);
});
