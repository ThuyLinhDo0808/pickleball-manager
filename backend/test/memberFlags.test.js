// Internal notes on a member: ready-made flags plus the Host's own short notes ("c:<text>").
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanFlags } = require('../src/routes/clubs.routes');

test('keeps the ready-made flags and the Host notes, drops the rest', () => {
  assert.deepEqual(cleanFlags(['late', 'bogus', 'c:  Chưa   hiểu chuyện ', 'c:', 'c:chưa hiểu chuyện']), ['late', 'c:Chưa hiểu chuyện']);
});

test('a Host note is at most 30 characters and 6 notes', () => {
  const long = `c:${'x'.repeat(50)}`;
  assert.equal(cleanFlags([long])[0].length, 32);
  const many = Array.from({ length: 9 }, (_, i) => `c:note ${i}`);
  assert.equal(cleanFlags(many).length, 6);
  assert.deepEqual(cleanFlags('nope'), []);
});
