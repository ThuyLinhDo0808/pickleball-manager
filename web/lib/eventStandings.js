// The kèo's own rankings (only the matches of this session) and the challenge suggestion.
// Pure functions: matches as returned by GET /api/matches?event_id=… .

const keyOf = (mp) => mp.event_participant_id || mp.club_member_id;
const nameOf = (mp) => mp.event_participants?.full_name || mp.club_members?.full_name || '?';
const genderOf = (mp) => mp.event_participants?.gender || mp.club_members?.gender || null;
const uidOf = (mp) => mp.event_participants?.user_id || null;
const scored = (m) => m.team1_score != null && m.team2_score != null && m.team1_score !== m.team2_score;

// One row per player: played, won, lost, points for / against, difference, win rate (%),
// ranked by win rate, then point difference, then more matches.
export function eventStandings(matches = []) {
  const rows = new Map();
  for (const m of matches) {
    if (!scored(m)) continue;
    const win = m.team1_score > m.team2_score ? 1 : 2;
    for (const mp of m.match_players || []) {
      const id = keyOf(mp);
      if (!id) continue;
      const r = rows.get(id) || { id, name: nameOf(mp), gender: genderOf(mp), user_id: uidOf(mp), played: 0, won: 0, lost: 0, pf: 0, pa: 0 };
      const mine = mp.team === 1 ? m.team1_score : m.team2_score;
      const theirs = mp.team === 1 ? m.team2_score : m.team1_score;
      r.played += 1;
      if (mp.team === win) r.won += 1;
      else r.lost += 1;
      r.pf += Number(mine);
      r.pa += Number(theirs);
      rows.set(id, r);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, diff: r.pf - r.pa, rate: r.played ? Math.round((1000 * r.won) / r.played) / 10 : 0 }))
    .sort((a, b) => b.rate - a.rate || b.diff - a.diff || b.played - a.played || a.name.localeCompare(b.name, 'vi'))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// Thách thức: the best player teams up with the last one and plays a random pair from
// ranks 2-5 with the SAME genders (top + last = nam + nữ → the other pair is nam + nữ too).
// When ranks 2-5 do not have them, the next ranks are used. A player without a gender fits
// either. Needs at least 4 ranked players; null when no fitting pair exists.
const fits = (want, r) => !want || !r.gender || r.gender === want;
function pairFor(pool, genders, rand) {
  const [g1, g2] = genders;
  const firsts = pool.filter((r) => fits(g1, r));
  for (const a of [...firsts].sort(() => rand() - 0.5)) {
    const seconds = pool.filter((r) => r.id !== a.id && fits(g2, r));
    if (seconds.length) return [a, seconds[Math.floor(rand() * seconds.length)]];
  }
  return null;
}
export function challengePick(standings, rand = Math.random) {
  if (standings.length < 4) return null;
  const top = standings[0];
  const last = standings[standings.length - 1];
  const genders = [top.gender || null, last.gender || null];
  const middle = standings.slice(1, -1);
  const team2 = pairFor(middle.slice(0, 4), genders, rand) || pairFor(middle, genders, rand);
  if (!team2) return null;
  // Same order as the challengers (nam with nam, nữ with nữ), for the match form.
  if (genders[0] && team2[0].gender && team2[0].gender !== genders[0]) team2.reverse();
  return { team1: [top, last], team2, wider: !team2.every((r) => middle.slice(0, 4).includes(r)) };
}

// How many times two players were on the same side in these matches.
export function timesTogether(matches = [], idA, idB) {
  if (!idA || !idB) return 0;
  let n = 0;
  for (const m of matches) {
    for (const team of [1, 2]) {
      const ids = (m.match_players || []).filter((mp) => mp.team === team).map(keyOf);
      if (ids.includes(idA) && ids.includes(idB)) n += 1;
    }
  }
  return n;
}
