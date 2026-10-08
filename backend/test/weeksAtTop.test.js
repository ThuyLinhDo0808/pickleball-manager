const test = require('node:test');
const assert = require('node:assert/strict');
const { weekStart, weeksAtTop } = require('../src/services/stats');

const members = [{ id: 'a', full_name: 'An' }, { id: 'b', full_name: 'Bình' }, { id: 'c', full_name: 'Chi' }];
// a + b beat c + ? → keep it simple: singles-like 2-player matches.
const m = (day, w, l) => ({ day, team1_score: 11, team2_score: 5, match_players: [{ team: 1, club_member_id: w }, { team: 2, club_member_id: l }] });

test('weekStart is the Monday', () => {
  assert.equal(weekStart('2026-10-07'), '2026-10-05'); // Wednesday
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
});

test('counts weeks at No. 1, longest run, current holder', () => {
  const rows = weeksAtTop(
    [
      m('2026-09-21', 'a', 'b'), // week 1: a
      m('2026-09-29', 'a', 'c'), // week 2: a
      m('2026-10-06', 'b', 'a'), m('2026-10-07', 'b', 'c'), // week 3: b
      m('2026-10-13', 'a', 'b'), // week 4: a
      { day: '2026-10-14', team1_score: null, team2_score: null, match_players: [] }, // unscored: ignored
    ],
    members
  );
  assert.deepEqual(rows.map((r) => [r.club_member_id, r.weeks, r.streak, r.current]), [
    ['a', 3, 2, true],
    ['b', 1, 1, false],
  ]);
});

test('an exact tie at the top is shared', () => {
  const rows = weeksAtTop([m('2026-10-05', 'a', 'c'), m('2026-10-06', 'b', 'c')], members);
  assert.deepEqual(rows.map((r) => r.club_member_id).sort(), ['a', 'b']);
  assert.ok(rows.every((r) => r.weeks === 1 && r.current));
});
