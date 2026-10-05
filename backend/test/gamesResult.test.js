const test = require('node:test');
const assert = require('node:assert/strict');
// sport.js loads the Supabase client; give it dummy settings (no request is made here).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const { gamesResult, cleanFormat, badmintonResult } = require('../src/services/sport');

test('badminton 21 by default (unchanged behaviour)', () => {
  assert.deepEqual(badmintonResult([[21, 18], [19, 21], [30, 29]]).team1_score, 2);
  assert.throws(() => badmintonResult([[15, 10], [15, 12]]), /isn't a finished game/);
  assert.throws(() => badmintonResult([[21, 18], [21, 15], [21, 10]]), /Best of 3/);
});

test('badminton games to 15 and 11 (caps 21 / 15), best of 5', () => {
  const f15 = cleanFormat('badminton', { points: 15 });
  assert.equal(gamesResult([[15, 10], [15, 13]], f15).team1_score, 2);
  assert.equal(gamesResult([[21, 20], [16, 14]], f15).team1_score, 2);
  assert.throws(() => gamesResult([[15, 14]], f15), /finished/);
  assert.throws(() => gamesResult([[22, 20]], f15), /0-21/);
  const f11 = cleanFormat('badminton', { points: 11, best_of: 5 });
  const r = gamesResult([[11, 5], [9, 11], [11, 7], [15, 14]], f11);
  assert.deepEqual([r.team1_score, r.team2_score], [3, 1]);
  assert.throws(() => gamesResult([[11, 5], [11, 5], [11, 5], [11, 5]], f11), /ends at 3/);
});

test('first to the points (win by 1) and pickleball games', () => {
  const f = cleanFormat('badminton', { points: 21, win_by: 1 });
  assert.equal(gamesResult([[21, 20], [21, 19]], f).team1_score, 2);
  assert.throws(() => gamesResult([[22, 20]], f), /0-21/);
  const p = cleanFormat('pickleball', { points: 11 });
  assert.equal(gamesResult([[11, 9], [8, 11], [13, 11]], p).team1_score, 2);
  assert.throws(() => gamesResult([[11, 10]], p), /finished/);
  // Custom target ("+"): any 3–99, win by 2 with no maximum.
  const c = cleanFormat('pickleball', { points: 25 });
  assert.equal(gamesResult([[25, 20], [27, 25]], c).team1_score, 2);
  assert.throws(() => gamesResult([[25, 24]], c), /finished/);
  assert.throws(() => cleanFormat('pickleball', { points: 2 }), /3–99/);
  assert.throws(() => cleanFormat('pickleball', { points: 150 }), /3–99/);
});
