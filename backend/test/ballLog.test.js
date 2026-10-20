const test = require('node:test');
const assert = require('node:assert/strict');
const { ballLog, itemMetrics, playStats } = require('../src/services/inventory');

const mv = (kind, quantity, occurred_on, extra = {}) => ({ kind, quantity, occurred_on, ...extra });

test("the club's example: 48 balls; 2 new on 4/10; the same 2 on 6/10; they break and 2 new on 8/10", () => {
  const rows = ballLog(
    [
      mv('purchase', 48, '2026-10-01', { unit_cost: 70000 }),
      mv('use', 2, '2026-10-04'),
      mv('broken', 2, '2026-10-08'),
      mv('use', 2, '2026-10-08'),
    ],
    ['2026-10-02', '2026-10-04', '2026-10-06', '2026-10-08'] // 2/10: before any ball was logged
  );
  assert.deepEqual(
    rows.map((r) => [r.date, r.new, r.old, r.broken_now, r.played, r.playable, r.bought, r.left]),
    [
      ['2026-10-04', 2, 0, 0, 2, 2, 48, 46],
      ['2026-10-06', 0, 2, 0, 2, 2, 48, 46],
      ['2026-10-08', 2, 2, 2, 4, 2, 48, 44],
    ]
  );
});

test('old balls played as entered; a session with 0 new and 0 broken stays in the table', () => {
  const rows = ballLog([
    mv('purchase', 48, '2026-10-01', { unit_cost: 70000 }),
    mv('use', 2, '2026-10-20'),
    mv('play', 0, '2026-10-20'),
    mv('use', 1, '2026-10-22'),
    mv('play', 2, '2026-10-22'),
    mv('broken', 1, '2026-10-22'),
    mv('play', 2, '2026-10-26'), // 0 new, 0 broken: 2 old balls played
  ]);
  assert.deepEqual(rows.map((r) => [r.date, r.new, r.old, r.broken_now, r.played, r.playable, r.left]), [
    ['2026-10-20', 2, 0, 0, 2, 2, 46],
    ['2026-10-22', 1, 2, 1, 3, 2, 45],
    ['2026-10-26', 0, 2, 0, 2, 2, 45],
  ]);
  // 7 ball-sessions, 1 ball broken -> a ball lasts 7 sessions; 70k broken over 3 sessions.
  const s = playStats(rows, 70000);
  assert.equal(s.ball_sessions, 7);
  assert.equal(s.play_durability, 7);
  assert.equal(s.ball_cost_per_session, 23333);
  const m = itemMetrics([mv('purchase', 10, 'x', { unit_cost: 1 }), mv('use', 4, 'x'), mv('broken', 1, 'x'), mv('play', 3, 'x')]);
  assert.equal(m.stock, 6);
  assert.equal(m.in_play, 3);
});

test('new balls taken out and broken in the same session', () => {
  const rows = ballLog([
    mv('purchase', 48, '2026-10-01', { unit_cost: 1 }),
    mv('use', 4, '2026-10-04'),
    mv('broken', 4, '2026-10-04'), // all four broke that evening
    mv('use', 2, '2026-10-06'),
  ]);
  assert.deepEqual(rows.map((r) => [r.new, r.old, r.broken_now, r.playable, r.left]), [
    [4, 0, 4, 0, 44],
    [2, 0, 0, 2, 42],
  ]);
});
