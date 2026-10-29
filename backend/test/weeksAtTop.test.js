const test = require('node:test');
const assert = require('node:assert/strict');
const { weekStart, weeksAtTop } = require('../src/services/stats');

const members = [{ id: 'a', full_name: 'An' }, { id: 'b', full_name: 'Bình' }, { id: 'c', full_name: 'Chi' }, { id: 'd', full_name: 'Dung' }];
// Singles-like 2-player matches, 11-5.
const m = (day, w, l) => ({ day, team1_score: 11, team2_score: 5, match_players: [{ team: 1, club_member_id: w }, { team: 2, club_member_id: l }] });

test('weekStart is the Monday', () => {
  assert.equal(weekStart('2026-10-07'), '2026-10-05'); // Wednesday
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
});

test('No. 1 on the all-time table keeps it until someone ranks above', () => {
  const rows = weeksAtTop(
    [
      m('2026-09-01', 'a', 'b'), // a 1-0 takes No. 1
      m('2026-09-08', 'a', 'c'), // a 2-0
      m('2026-09-15', 'c', 'd'), // c 1-1, d 0-1: a still No. 1 (not weekly)
      m('2026-09-29', 'b', 'a'), // a 2-1 (67%), b 1-1, c 1-1 → a still top
      m('2026-10-06', 'b', 'c'), m('2026-10-06', 'b', 'd'), // b 3-1 (75%) passes a on 6/10
      { day: '2026-10-14', team1_score: null, team2_score: null, match_players: [] }, // unscored: ignored
    ],
    members,
    1,
    '2026-10-20'
  );
  // a: 1/9 → 6/10 = 35 days = 5 weeks; b: 6/10 → 20/10 (today, inclusive) = 15 days = 3 weeks.
  assert.deepEqual(rows.map((r) => [r.club_member_id, r.weeks, r.streak, r.current, r.since]), [
    ['a', 5, 5, false, null],
    ['b', 3, 3, true, '2026-10-06'],
  ]);
});

test('a newcomer with one 100% match does not pass a 100% player with more matches', () => {
  const rows = weeksAtTop([m('2026-10-01', 'a', 'c'), m('2026-10-02', 'a', 'c'), m('2026-10-20', 'b', 'd')], members, 1, '2026-10-21');
  assert.deepEqual(rows.map((r) => [r.club_member_id, r.current]), [['a', true]]);
  assert.equal(rows[0].weeks, 3); // 1/10 → 21/10 = 21 days
});

test('an exact tie does not take No. 1; taking it today counts 1 week', () => {
  const rows = weeksAtTop([m('2026-10-05', 'a', 'c'), m('2026-10-06', 'b', 'd')], members, 1, '2026-10-06');
  assert.deepEqual(rows.map((r) => [r.club_member_id, r.weeks, r.current]), [['a', 1, true]]);
});

test('only players with the minimum matches can hold No. 1 (same rule as the table)', () => {
  const rows = weeksAtTop([m('2026-10-05', 'b', 'c'), m('2026-10-06', 'a', 'c'), m('2026-10-07', 'a', 'd')], members, 2, '2026-10-07');
  // c has 2 matches first (0-2) and holds it until a reaches 2 wins; b never had 2 matches.
  assert.deepEqual(rows.map((r) => [r.club_member_id, r.current]).sort(), [['a', true], ['c', false]]);
  assert.deepEqual(weeksAtTop([m('2026-10-05', 'a', 'c')], members, 2), []);
});
