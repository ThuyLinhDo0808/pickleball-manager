// Tournament engine: pure functions (no DB) so every rule is unit-testable.
//
// Flow: players -> pairTeams -> assignGroups (snake by strength) -> roundRobin per group
//       -> standings -> seedQualifiers -> buildBracket (byes for top seeds) -> advance winners.

const DEFAULT_DUPR = 3.0; // unrated players count as an average club player
const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };

const level = (p) => (p.dupr_level == null || p.dupr_level === '' ? DEFAULT_DUPR : Number(p.dupr_level));
const byLevelDesc = (a, b) => level(b) - level(a) || a.full_name.localeCompare(b.full_name);

function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Average DUPR of a team (unrated players count as DEFAULT_DUPR), 2 decimals.
function strengthOf(players) {
  return Math.round((100 * players.reduce((s, p) => s + level(p), 0)) / players.length) / 100;
}

function teamOf(players) {
  return {
    players: players.map((p) => ({ id: p.id, full_name: p.full_name })),
    name: players.map((p) => p.full_name).join(' & '),
    strength: strengthOf(players),
  };
}

// players: [{ id, full_name, gender, dupr_level }]
// mode: 'balanced' (strong + weak together, so teams are even) | 'random'
// Returns { teams, leftover } — leftover players could not be paired (odd count, gender mismatch).
function pairTeams(players, format, mode = 'balanced', rand = Math.random) {
  if (format === 'singles') return { teams: players.map((p) => teamOf([p])), leftover: [] };

  if (format === 'mixed') {
    let men = players.filter((p) => p.gender === 'male');
    let women = players.filter((p) => p.gender === 'female');
    const unknown = players.filter((p) => p.gender !== 'male' && p.gender !== 'female');
    if (mode === 'random') {
      men = shuffle(men, rand);
      women = shuffle(women, rand);
    } else {
      men = [...men].sort(byLevelDesc); // strongest man ...
      women = [...women].sort(byLevelDesc).reverse(); // ... with the weakest woman
    }
    const n = Math.min(men.length, women.length);
    return {
      teams: Array.from({ length: n }, (_, i) => teamOf([men[i], women[i]])),
      leftover: [...men.slice(n), ...women.slice(n), ...unknown],
    };
  }

  // doubles
  const pool = mode === 'random' ? shuffle(players, rand) : [...players].sort(byLevelDesc);
  const teams = [];
  const leftover = pool.length % 2 ? [pool[mode === 'random' ? pool.length - 1 : Math.floor(pool.length / 2)]] : [];
  const rest = pool.filter((p) => !leftover.includes(p));
  if (mode === 'random') {
    for (let i = 0; i + 1 < rest.length; i += 2) teams.push(teamOf([rest[i], rest[i + 1]]));
  } else {
    for (let i = 0; i < rest.length / 2; i++) teams.push(teamOf([rest[i], rest[rest.length - 1 - i]]));
  }
  return { teams, leftover };
}

// Snake draft by strength so groups are even: 1,2,3,3,2,1,1,2,3...
// Returns group numbers (1-based) in the same order as `teams`.
function assignGroups(teams, groupCount) {
  const order = teams.map((t, i) => ({ i, s: t.strength ?? 0 })).sort((a, b) => b.s - a.s || a.i - b.i);
  const groups = new Array(teams.length);
  order.forEach(({ i }, k) => {
    const lap = Math.floor(k / groupCount);
    const pos = k % groupCount;
    groups[i] = (lap % 2 === 0 ? pos : groupCount - 1 - pos) + 1;
  });
  return groups;
}

// Circle method: every team meets every other once. Returns [{ round, a, b }] (indexes into `ids`).
function roundRobin(ids) {
  const list = [...ids];
  if (list.length % 2) list.push(null); // bye
  const n = list.length;
  const out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== null && b !== null) out.push({ round: r + 1, a: r % 2 && i === 0 ? b : a, b: r % 2 && i === 0 ? a : b });
    }
    list.splice(1, 0, list.pop()); // rotate all but the first
  }
  return out;
}

function isPlayed(m) {
  return m.team1_score != null && m.team2_score != null && m.team1_score !== m.team2_score;
}

// Group table. Tie-break: wins, then head-to-head (2 teams), point diff, points for, seed.
function standings(teamIds, matches, seedOf = () => 0) {
  const row = new Map(teamIds.map((id) => [id, { team_id: id, played: 0, wins: 0, losses: 0, points_for: 0, points_against: 0 }]));
  const h2h = new Map();
  for (const m of matches) {
    if (!isPlayed(m) || !row.has(m.team1_id) || !row.has(m.team2_id)) continue;
    const a = row.get(m.team1_id);
    const b = row.get(m.team2_id);
    a.played++; b.played++;
    a.points_for += m.team1_score; a.points_against += m.team2_score;
    b.points_for += m.team2_score; b.points_against += m.team1_score;
    const [w, l] = m.team1_score > m.team2_score ? [a, b] : [b, a];
    w.wins++; l.losses++;
    h2h.set(`${w.team_id}>${l.team_id}`, true);
  }
  const rows = [...row.values()].map((r) => ({ ...r, diff: r.points_for - r.points_against }));
  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const tiedCount = rows.filter((r) => r.wins === x.wins).length;
    if (tiedCount === 2) {
      if (h2h.get(`${x.team_id}>${y.team_id}`)) return -1;
      if (h2h.get(`${y.team_id}>${x.team_id}`)) return 1;
    }
    return y.diff - x.diff || y.points_for - x.points_for || seedOf(x.team_id) - seedOf(y.team_id);
  });
  return rows.map((r, i) => ({ ...r, position: i + 1 }));
}

// Group winners first, then runners-up, ... ; within a tier the better record seeds higher.
// groupTables: { [groupNo]: standings rows }
function seedQualifiers(groupTables, advancePerGroup) {
  const seeds = [];
  for (let pos = 1; pos <= advancePerGroup; pos++) {
    const tier = Object.values(groupTables)
      .map((rows) => rows[pos - 1])
      .filter(Boolean)
      .sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.points_for - a.points_for);
    seeds.push(...tier.map((r) => r.team_id));
  }
  return seeds;
}

// Standard bracket order: 1 v 8, 4 v 5, 2 v 7, 3 v 6 ... keeps top seeds apart until late.
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

// seeds: team ids, best first. groupOf(teamId) -> group number (optional), used so teams
// from the same group don't meet again in the first knockout round.
// Returns every knockout match (all rounds), byes already resolved.
function buildBracket(seeds, groupOf = () => null) {
  if (seeds.length < 2) throw new Error('At least 2 teams are needed for a knockout.');
  let size = 1;
  while (size < seeds.length) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches = [];
  for (let r = 1; r <= rounds; r++) {
    for (let s = 0; s < size / 2 ** r; s++) matches.push({ round: r, slot: s, team1_id: null, team2_id: null, winner_id: null, bye: false });
  }
  const at = (r, s) => matches.find((m) => m.round === r && m.slot === s);
  const first = matches.filter((m) => m.round === 1);
  first.forEach((m, s) => {
    m.team1_id = seeds[order[2 * s] - 1] ?? null;
    m.team2_id = seeds[order[2 * s + 1] - 1] ?? null;
  });

  // Crossover: swap lower seeds between first-round matches to avoid group rematches.
  const clash = (m) => m.team1_id && m.team2_id && groupOf(m.team1_id) != null && groupOf(m.team1_id) === groupOf(m.team2_id);
  for (const m of first) {
    if (!clash(m)) continue;
    const other = first.find(
      (o) => o !== m && o.team2_id && !clash(o) &&
        groupOf(m.team1_id) !== groupOf(o.team2_id) && groupOf(o.team1_id) !== groupOf(m.team2_id)
    ) || first.find((o) => o !== m && o.team2_id && groupOf(m.team1_id) !== groupOf(o.team2_id) && groupOf(o.team1_id) !== groupOf(m.team2_id));
    if (other) [m.team2_id, other.team2_id] = [other.team2_id, m.team2_id];
  }

  for (let s = 0; s < size / 2; s++) {
    const m = at(1, s);
    if (!m.team1_id || !m.team2_id) {
      m.bye = true;
      m.winner_id = m.team1_id || m.team2_id;
      placeWinner(matches, m);
    }
  }
  return { rounds, matches };
}

// Put a match's winner into the right side of the next-round match.
function placeWinner(matches, m) {
  const next = matches.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
  if (!next) return null;
  if (m.slot % 2 === 0) next.team1_id = m.winner_id;
  else next.team2_id = m.winner_id;
  return next;
}

function roundName(round, rounds) {
  const left = rounds - round;
  return left === 0 ? 'final' : left === 1 ? 'semi' : left === 2 ? 'quarter' : `r${2 ** (left + 1)}`;
}

module.exports = {
  DEFAULT_DUPR,
  TEAM_SIZE,
  strengthOf,
  pairTeams,
  assignGroups,
  roundRobin,
  standings,
  seedQualifiers,
  seedOrder,
  buildBracket,
  placeWinner,
  roundName,
  isPlayed,
  shuffle,
};
