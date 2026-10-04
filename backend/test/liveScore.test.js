const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanConfig, replay, resultOf } = require('../src/services/liveScore');

const dbl = { 1: ['A', 'B'], 2: ['C', 'D'] };
const sgl = { 1: ['A'], 2: ['C'] };
const rep = (s, n) => Array(n).fill(s);

test('pickleball doubles starts 0-0-2 and sides out after one fault', () => {
  const cfg = cleanConfig('pickleball', {}, dbl);
  let s = replay(cfg, dbl, []);
  assert.equal(s.call, '0-0-2');
  assert.equal(s.server_id, 'A');
  assert.equal(s.server_side, 'right');
  s = replay(cfg, dbl, ['r1']); // A scores, A and B swap; A now serves from the left
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(s.call, '1-0-2');
  assert.equal(s.server_id, 'A');
  assert.equal(s.server_side, 'left');
  s = replay(cfg, dbl, ['r1', 'r2']); // first service turn has only one server → side out
  assert.equal(s.note, 'side_out');
  assert.equal(s.serving, 2);
  assert.equal(s.call, '0-1-1');
  assert.equal(s.server_id, 'C');
  s = replay(cfg, dbl, ['r1', 'r2', 'r1']); // fault by server 1 → server 2 (partner)
  assert.equal(s.note, 'second_server');
  assert.equal(s.call, '0-1-2');
  assert.equal(s.server_id, 'D');
  assert.deepEqual(s.score, [1, 0]);
  s = replay(cfg, dbl, ['r1', 'r2', 'r1', 'r1']); // second fault → side out to team 1, right player serves
  assert.equal(s.serving, 1);
  assert.equal(s.call, '1-0-1');
  assert.equal(s.server_id, 'B'); // B stands on the right after A's point
});

test('pickleball game to 11 win by 2, result as points', () => {
  const cfg = cleanConfig('pickleball', { points: 11 }, sgl);
  // Team 1 serves and wins 11 straight rallies.
  const s = replay(cfg, sgl, rep('r1', 11));
  assert.equal(s.finished, true);
  assert.equal(s.winner, 1);
  assert.deepEqual(resultOf(cfg, s), { s1: 11, s2: 0, games: null });
  // Game point shows for the server only.
  const p = replay(cfg, sgl, rep('r1', 10));
  assert.deepEqual(p.point, { team: 1, match: true });
  assert.equal(p.call, '10-0');
  assert.throws(() => replay(cfg, sgl, rep('r1', 12)), /over/);
});

test('pickleball 10-10 needs a 2-point lead', () => {
  const cfg = cleanConfig('pickleball', {}, sgl);
  const log = [...rep('r1', 10), 'r2', ...rep('r2', 10), 'r1', 'r1'];
  let s = replay(cfg, sgl, log); // 11-10 → not over
  assert.deepEqual(s.score, [11, 10]);
  assert.equal(s.finished, false);
  s = replay(cfg, sgl, [...log, 'r1']);
  assert.equal(s.finished, true);
  assert.deepEqual(s.games, [[12, 10]]);
});

test('pickleball best of 3: switch ends at 6 in the deciding game, other team serves first next game', () => {
  const cfg = cleanConfig('pickleball', { best_of: 3 }, sgl);
  let s = replay(cfg, sgl, rep('r1', 11));
  assert.equal(s.note, 'game_over');
  assert.equal(s.serving, 2);
  const g2 = ['r2', ...rep('r2', 11)]; // side out, then team 2 runs 11
  s = replay(cfg, sgl, [...rep('r1', 11), ...rep('r2', 11)]);
  assert.deepEqual(s.games_won, [1, 1]);
  assert.equal(s.serving, 1);
  s = replay(cfg, sgl, [...rep('r1', 11), ...rep('r2', 11), ...rep('r1', 6)]);
  assert.equal(s.note, 'switch_ends');
  s = replay(cfg, sgl, [...rep('r1', 11), ...rep('r2', 11), ...rep('r1', 11)]);
  assert.equal(s.finished, true);
  assert.deepEqual(resultOf(cfg, s), { s1: 2, s2: 1, games: [[11, 0], [0, 11], [11, 0]] });
  assert.ok(g2);
});

test('server and positions can change only at 0-0', () => {
  const cfg = cleanConfig('pickleball', {}, dbl);
  let s = replay(cfg, dbl, ['s2', 'x2']);
  assert.equal(s.serving, 2);
  assert.equal(s.server_id, 'D');
  assert.equal(s.at_start, true);
  assert.throws(() => replay(cfg, dbl, ['r1', 's2']), /before the first rally/);
});

test('badminton doubles: rally scoring, serve from right on even, switch ends at 11 in game 3', () => {
  const cfg = cleanConfig('badminton', {}, dbl);
  let s = replay(cfg, dbl, ['r2']); // receivers win → serve passes, 1 point (odd) → left player
  assert.deepEqual(s.score, [0, 1]);
  assert.equal(s.serving, 2);
  assert.equal(s.server_id, 'D');
  assert.equal(s.server_side, 'left');
  s = replay(cfg, dbl, ['r2', 'r2']); // server wins → C and D swap, D serves from the right
  assert.equal(s.server_id, 'D');
  assert.equal(s.server_side, 'right');
  s = replay(cfg, dbl, rep('r1', 11));
  assert.equal(s.note, 'interval');
  s = replay(cfg, dbl, [...rep('r1', 21), ...rep('r2', 21), ...rep('r1', 11)]);
  assert.equal(s.note, 'switch_ends');
  // 29-29 → the 30th point wins.
  const deuce = [];
  for (let i = 0; i < 29; i++) deuce.push('r1', 'r2');
  s = replay(cfg, dbl, [...deuce, 'r2']);
  assert.deepEqual(s.games, [[29, 30]]);
  assert.equal(s.serving, 2); // game winner serves next game
});

test('badminton result is games won + games', () => {
  const cfg = cleanConfig('badminton', {}, sgl);
  const s = replay(cfg, sgl, [...rep('r1', 21), ...rep('r1', 21)]);
  assert.equal(s.finished, true);
  assert.deepEqual(resultOf(cfg, s), { s1: 2, s2: 0, games: [[21, 0], [21, 0]] });
});

test('pickleball rally scoring: every rally scores, no second server, serve by score parity', () => {
  const cfg = cleanConfig('pickleball', { scoring: 'rally', points: 21 }, dbl);
  let s = replay(cfg, dbl, []);
  assert.equal(s.call, '0-0');
  assert.equal(s.two_servers, false);
  s = replay(cfg, dbl, ['r2']); // receivers score AND take the serve; B on 1 (odd) → left player
  assert.deepEqual(s.score, [0, 1]);
  assert.equal(s.serving, 2);
  assert.equal(s.server_id, 'D');
  assert.equal(s.server_side, 'left');
  assert.equal(s.call, '1-0');
  s = replay(cfg, dbl, ['r2', 'r2']); // server wins → swap, serves from the right
  assert.equal(s.server_id, 'D');
  assert.equal(s.server_side, 'right');
  s = replay(cfg, dbl, rep('r1', 21));
  assert.equal(s.finished, true);
  assert.deepEqual(resultOf(cfg, s), { s1: 21, s2: 0, games: null });
});

test('pickleball rally with freeze: the receivers cannot win the last point', () => {
  const cfg = cleanConfig('pickleball', { scoring: 'rally', points: 21, freeze: true }, sgl);
  // 20-0 for team 2 with team 1 serving: team 2 wins the rally but only gets the serve.
  const log = ['s2', ...rep('r2', 20), 'r1', 'r2']; // 0-20, T1 takes serve (1-20), T2 wins rally
  let s = replay(cfg, sgl, log.slice(0, -1));
  assert.equal(s.serving, 1);
  assert.equal(s.point, null, 'team 2 cannot win on team 1 serve');
  s = replay(cfg, sgl, log);
  assert.equal(s.note, 'freeze');
  assert.deepEqual(s.score, [1, 20]);
  assert.equal(s.serving, 2);
  assert.deepEqual(s.point, { team: 2, match: true });
  s = replay(cfg, sgl, [...log, 'r2']);
  assert.equal(s.finished, true);
});

test('pickleball one-serve side-out: lost rally = side out, call has 2 numbers', () => {
  const cfg = cleanConfig('pickleball', { scoring: 'sideout_single' }, dbl);
  let s = replay(cfg, dbl, []);
  assert.equal(s.call, '0-0');
  s = replay(cfg, dbl, ['r1', 'r2']);
  assert.equal(s.note, 'side_out');
  assert.equal(s.serving, 2);
  assert.equal(s.call, '0-1');
  assert.equal(s.server_id, 'C');
  s = replay(cfg, dbl, ['r1', 'r2', 'r1']); // straight back, no second server
  assert.equal(s.serving, 1);
  assert.equal(s.server_id, 'B');
});

test('win by 1: first to the points wins', () => {
  const cfg = cleanConfig('pickleball', { scoring: 'rally', points: 11, win_by: 1 }, sgl);
  const log = [];
  for (let i = 0; i < 10; i++) log.push('r1', 'r2');
  const s = replay(cfg, sgl, [...log, 'r1']);
  assert.equal(s.finished, true);
  assert.deepEqual(s.games, [[11, 10]]);
});

test('badminton 15 points: cap 21, interval at 8; 11 points best of 5, cap 15', () => {
  const c15 = cleanConfig('badminton', { points: 15 }, sgl);
  assert.equal(c15.cap, 21);
  assert.equal(replay(c15, sgl, rep('r1', 8)).note, 'interval');
  const deuce = [];
  for (let i = 0; i < 20; i++) deuce.push('r1', 'r2');
  assert.deepEqual(replay(c15, sgl, [...deuce, 'r1']).games, [[21, 20]]);
  const c11 = cleanConfig('badminton', { points: 11, best_of: 5 }, sgl);
  assert.equal(c11.cap, 15);
  const s = replay(c11, sgl, rep('r1', 33));
  assert.equal(s.finished, true);
  assert.deepEqual(s.games_won, [3, 0]);
  assert.throws(() => cleanConfig('badminton', { scoring: 'sideout' }, sgl), /Scoring/);
});

test('older rows without scoring keep their system', () => {
  const old = { sport: 'pickleball', points: 11, win_by: 2, cap: null, best_of: 1, first_server: 1, doubles: true };
  assert.equal(replay(old, dbl, []).call, '0-0-2');
});
