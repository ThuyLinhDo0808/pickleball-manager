const test = require('node:test');
const assert = require('node:assert');
const { permitsGrants } = require('../src/services/clubRoles');

const C = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const co = [{ role: 'co_admin' }];
const can = (method, url, body) => permitsGrants(co, method, url, body);

test('co-host: runs sessions, members, matches and balls', () => {
  assert.ok(can('POST', '/api/events'));
  assert.ok(can('PATCH', `/api/clubs/${C}/members/${M}`));
  assert.ok(can('POST', `/api/events/${M}/participants/${M}/confirm-payment`));
  assert.ok(can('POST', `/api/events/${M}/quick-invite`));
  assert.ok(can('GET', `/api/clubs/${C}/inventory`));
  assert.ok(can('POST', `/api/clubs/${C}/inventory/${M}/moves`, { kind: 'buy' }));
  assert.ok(can('PATCH', `/api/matches/${M}`));
  assert.ok(can('GET', `/api/clubs/${C}/dupr/matches`));
  assert.ok(can('POST', `/api/clubs/${C}/members`));
  assert.ok(can('POST', `/api/clubs/${C}/members/import`));
});

test('co-host: no money, no DUPR sending, no settings, no deleting members', () => {
  for (const [m, u] of [
    ['GET', '/api/transactions?club_id=x'],
    ['POST', '/api/transactions'],
    ['GET', `/api/clubs/${C}/fund`],
    ['GET', `/api/clubs/${C}/plans`],
    ['GET', `/api/clubs/${C}/members/${M}/memberships`],
    ['GET', '/api/analytics/finance'],
    ['GET', `/api/events/${M}/finance`],
    ['POST', `/api/clubs/${C}/dupr/matches/csv`],
    ['GET', `/api/clubs/${C}/deleted-members`],
    ['POST', `/api/clubs/${C}/deleted-members/${M}/restore`],
    ['DELETE', `/api/clubs/${C}/deleted-members/${M}`],
    ['POST', `/api/clubs/${C}/dupr/matches/mark`],
    ['POST', `/api/clubs/${C}/dupr/batches/${M}/confirm`],
    ['PATCH', `/api/clubs/${C}`],
    ['PUT', `/api/clubs/${C}/community-settings`],
    ['POST', `/api/clubs/${C}/join-token/rotate`],
    ['DELETE', `/api/clubs/${C}/members/${M}`],
    ['POST', `/api/clubs/${C}/members/${M}/remove`],
  ]) assert.ok(!can(m, u), `${m} ${u}`);
});
