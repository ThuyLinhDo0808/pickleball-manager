// Tiền thực tế & hoàn phí: the money line of one player (services/feeAdjust.js).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const test = require('node:test');
const assert = require('node:assert');
const { lineFor } = require('../src/services/feeAdjust');
const { feeFor } = require('../src/services/fees');

const ev = { fee_amount: 100000 };
const ch = (kind, amount, extra = {}) => ({ participant_id: 'p', kind, amount, created_at: extra.at || '2026-10-29T10:00:00Z', undone_at: extra.undone || null });

test('price list only: unpaid owes the base, paid is settled', () => {
  assert.deepStrictEqual([lineFor(ev, { id: 'p' }).state, lineFor(ev, { id: 'p' }).diff], ['unpaid', 100000]);
  const l = lineFor(ev, { id: 'p', fee_paid: true });
  assert.strictEqual(l.paid, 100000);
  assert.strictEqual(l.state, 'ok');
});

test('real amount lower than paid: to refund, then refunded', () => {
  const p = { id: 'p', fee_paid: true, paid_amount: 100000, actual_fee: 80000 };
  assert.strictEqual(lineFor(ev, p).state, 'to_refund');
  assert.strictEqual(lineFor(ev, p).diff, -20000);
  const l = lineFor(ev, p, [ch('adjust', 80000), ch('refund', 20000)]);
  assert.strictEqual(l.state, 'refunded');
  assert.strictEqual(l.paid, 80000);
  assert.strictEqual(l.base, 100000); // the price list stays
  assert.strictEqual(l.first_paid, 100000); // the first payment stays
});

test('real amount higher: to collect, then collected; undone rows do not count', () => {
  const p = { id: 'p', fee_paid: true, paid_amount: 100000, actual_fee: 120000 };
  assert.strictEqual(lineFor(ev, p).state, 'to_collect');
  assert.strictEqual(lineFor(ev, p, [ch('collect', 20000)]).state, 'collected');
  assert.strictEqual(lineFor(ev, p, [ch('collect', 20000, { undone: '2026-10-29T11:00:00Z' })]).diff, 20000);
});

test('not paid with a real amount: owes the real amount; feeFor follows it', () => {
  const p = { id: 'p', actual_fee: 50000 };
  assert.strictEqual(lineFor(ev, p).diff, 50000);
  assert.strictEqual(feeFor(ev, p), 50000);
  assert.strictEqual(feeFor(ev, { fee_amount: 120000 }), 120000);
  // Paid before the columns existed: the price list counts as paid.
  assert.strictEqual(lineFor(ev, { id: 'p', fee_paid: true, actual_fee: 100000 }).state, 'ok');
});
