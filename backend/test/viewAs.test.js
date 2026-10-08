const test = require('node:test');
const assert = require('node:assert');
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
const { maskPhone, maskPhones } = require('../src/services/viewAs');

test('maskPhone keeps the first two and last three digits', () => {
  assert.strictEqual(maskPhone('0901234123'), '09xx xxx 123');
  assert.strictEqual(maskPhone('+84 90 123 4567'), '84xx xxx 567');
  assert.strictEqual(maskPhone('123'), '•••');
});

test('maskPhones masks any *phone* key at any depth, leaves the rest', () => {
  const out = maskPhones({ a: 1, phone: '0901234123', list: [{ guest_phone: '0912345678', name: 'An' }], contact_phone: null });
  assert.deepStrictEqual(out, { a: 1, phone: '09xx xxx 123', list: [{ guest_phone: '09xx xxx 678', name: 'An' }], contact_phone: null });
});
