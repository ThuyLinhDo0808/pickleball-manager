// The Host's own work on the member list (services/memberAdmin.js): what a file row can set.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fieldsOf, cleanDupr, phoneKey } = require('../src/services/memberAdmin');

test('a file row: blanks set nothing, known values are cleaned', () => {
  assert.deepEqual(fieldsOf({ full_name: '  Hải   Ken ', phone: '', gender: 'male', birth_date: '1997-05-01', member_type: 'fixed', notes: '' }), {
    full_name: 'Hải Ken',
    gender: 'male',
    birth_date: '1997-05-01',
    birth_year: 1997,
    member_type: 'fixed',
  });
  assert.deepEqual(fieldsOf({ gender: 'x', member_type: 'boss', birth_year: 1990 }), { birth_year: 1990 });
});

test('DUPR ID and phone keys', () => {
  assert.equal(cleanDupr(' dd24dy '), 'DD24DY');
  assert.equal(cleanDupr('bad id!'), null);
  assert.equal(phoneKey('+84 912 345 678'), '912345678');
  assert.equal(phoneKey('0987'), null);
});
