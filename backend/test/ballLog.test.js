const test = require('node:test');
const assert = require('node:assert/strict');
const { ballLog, itemMetrics } = require('../src/services/inventory');

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
    rows.map((r) => [r.date, r.new, r.old, r.broken, r.used, r.bought, r.left]),
    [
      ['2026-10-04', 2, 0, 0, 2, 48, 46],
      ['2026-10-06', 0, 2, 0, 2, 48, 46],
      ['2026-10-08', 2, 0, 2, 4, 48, 44],
    ]
  );
  for (const r of rows) assert.equal(r.new + r.old + r.broken + r.left, r.bought);
});

test('old balls carry over until they break; broken balls are not taken from the box', () => {
  const rows = ballLog([
    mv('purchase', 10, '2026-10-01', { unit_cost: 1 }),
    mv('use', 3, '2026-10-02'),
    mv('use', 1, '2026-10-03'),
    mv('broken', 1, '2026-10-04'),
  ]);
  assert.deepEqual(rows.map((r) => [r.new, r.old, r.broken, r.left]), [
    [3, 0, 0, 7],
    [1, 3, 0, 6],
    [0, 3, 1, 6],
  ]);
  const m = itemMetrics([mv('purchase', 10, 'x', { unit_cost: 1 }), mv('use', 4, 'x'), mv('broken', 1, 'x')]);
  assert.equal(m.stock, 6);
  assert.equal(m.in_play, 3);
});
