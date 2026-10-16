const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
const { plan, differ } = require('../src/services/memberDedupe');

const m = (id, full_name, extra = {}) => ({ id, full_name, member_type: 'fixed', created_at: `2026-01-0${id.length}`, ...extra });

test('same name, nothing telling them apart → merged into the row with the account', () => {
  const out = plan([m('a', 'Linh Tyn', { phone: '0901 234 567' }), m('bb', 'linh  tyn', { user_id: 'u1', account_verified: true })]);
  assert.deepStrictEqual(out.map((x) => [x.source.id, x.target]), [['a', 'bb']]);
});

test('accents and case do not matter', () => {
  assert.strictEqual(plan([m('a', 'Nguyễn Văn Đức'), m('bb', 'nguyen van duc')]).length, 1);
});

test('different account, phone, birth year, gender or DUPR ID → two people', () => {
  assert.strictEqual(differ({ user_id: 'u1' }, { user_id: 'u2' }), 'account');
  assert.strictEqual(differ({ phone: '0901111111' }, { phone: '+84 901 111 112' }), 'phone');
  assert.strictEqual(differ({ phone: '0901111111' }, { phone: '+84 901 111 111' }), null);
  assert.strictEqual(differ({ birth_year: 1990 }, { birth_date: '1991-02-03' }), 'birth');
  assert.strictEqual(differ({ gender: 'male' }, { gender: 'female' }), 'gender');
  assert.strictEqual(differ({ dupr_id: 'ab12' }, { dupr_id: 'XY99' }), 'dupr');
  assert.strictEqual(plan([m('a', 'An', { phone: '0901' }), m('bb', 'An', { phone: '0902' })]).length, 0);
});

test('waiting join requests and members under review are left for the Host', () => {
  assert.strictEqual(plan([m('a', 'An'), m('bb', 'An', { join_requested: true })]).length, 0);
  assert.strictEqual(plan([m('a', 'An'), m('bb', 'An', { user_id: 'u', account_verified: false })]).length, 0);
  assert.strictEqual(plan([m('a', 'An'), m('bb', 'An', { review_until: '2999-01-01' })]).length, 0);
  assert.strictEqual(plan([m('a', 'An', { is_active: false }), m('bb', 'An')]).length, 0);
});

test('three rows: the compatible ones join the kept row, a different person stays', () => {
  const out = plan([m('a', 'An', { user_id: 'u1', account_verified: true }), m('bb', 'An'), m('ccc', 'An', { user_id: 'u2', account_verified: true })]);
  assert.deepStrictEqual(out.map((x) => [x.source.id, x.target]), [['bb', 'a']]);
});
