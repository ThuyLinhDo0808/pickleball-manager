// Ranking + awards maths. Pure functions (no DB) so they are easy to test.

const APP_TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';
const PERIODS = ['day', 'month', 'quarter', 'year', 'all'];
const DEFAULT_MIN_MATCHES = 3;

const pad = (n) => String(n).padStart(2, '0');

// Calendar date (YYYY-MM-DD) of a timestamp in the club's timezone.
function localDate(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(ts));
}

// Inclusive date range of the period containing `ymd`. `all` -> null (no bounds).
function periodBounds(period, ymd) {
  if (period === 'all') return null;
  const [y, m] = ymd.split('-').map(Number);
  const last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (period === 'day') return { from: ymd, to: ymd };
  if (period === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}` };
  if (period === 'quarter') {
    const q0 = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${pad(q0)}-01`, to: `${y}-${pad(q0 + 2)}-${pad(last(y, q0 + 2))}` };
  }
  if (period === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  throw new Error('Unknown period');
}

// A match set up but not scored yet counts nowhere (no winner, no points).
function isScored(match) {
  return !!match && match.team1_score != null && match.team2_score != null;
}

function winnerTeam(match) {
  if (!isScored(match)) return 0;
  if (match.team1_score > match.team2_score) return 1;
  if (match.team2_score > match.team1_score) return 2;
  return 0; // draw
}

// matches: [{ team1_score, team2_score, match_players: [{ team, club_member_id }] }]
// members: [{ id, full_name, gender, kind }] — `kind`: 'member' (on the club's member list)
// or 'guest' (a quick sign-up / a name the Host typed into a match, not on the list).
function aggregate(matches, members) {
  const byId = new Map(members.map((m) => [m.id, {
    club_member_id: m.id,
    full_name: m.full_name,
    gender: m.gender || null,
    kind: m.kind || 'member',
    member_type: m.member_type || null,
    matches_played: 0,
    wins: 0,
    losses: 0,
    points_scored: 0,
    points_lost: 0,
  }]));

  for (const match of matches) {
    if (!isScored(match)) continue;
    const winner = winnerTeam(match);
    for (const p of match.match_players || []) {
      const row = byId.get(p.club_member_id);
      if (!row) continue;
      const mine = p.team === 1 ? match.team1_score : match.team2_score;
      const theirs = p.team === 1 ? match.team2_score : match.team1_score;
      row.matches_played += 1;
      if (winner === p.team) row.wins += 1;
      else if (winner !== 0) row.losses += 1;
      row.points_scored += mine;
      row.points_lost += theirs;
    }
  }

  return [...byId.values()]
    .filter((r) => r.matches_played > 0)
    .map((r) => ({
      ...r,
      point_diff: r.points_scored - r.points_lost,
      win_rate: r.matches_played ? Math.round((100 * r.wins) / r.matches_played) : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate || b.point_diff - a.point_diff || a.full_name.localeCompare(b.full_name));
}

// attendance: { [club_member_id]: count of check-ins in the period }
function awards(rankings, attendance, members, minMatches = DEFAULT_MIN_MATCHES) {
  const eligible = rankings.filter((r) => r.matches_played >= minMatches);
  const top = (list, n) => list.slice(0, n);
  const pickFields = (r, value) => ({ club_member_id: r.club_member_id, full_name: r.full_name, value, matches_played: r.matches_played });

  const byRate = [...eligible].sort((a, b) => b.win_rate - a.win_rate || b.point_diff - a.point_diff || b.matches_played - a.matches_played);
  const byDiff = [...rankings].sort((a, b) => b.point_diff - a.point_diff || b.win_rate - a.win_rate);
  const lowest = [...eligible].sort((a, b) => a.win_rate - b.win_rate || a.point_diff - b.point_diff || b.matches_played - a.matches_played)[0];

  const names = new Map(members.map((m) => [m.id, m.full_name]));
  const diligent = Object.entries(attendance)
    .filter(([id, n]) => n > 0 && names.has(id))
    .sort((a, b) => b[1] - a[1] || names.get(a[0]).localeCompare(names.get(b[0])))
    .slice(0, 3)
    .map(([id, n]) => ({ club_member_id: id, full_name: names.get(id), value: n }));

  return {
    min_matches: minMatches,
    top_win_rate: top(byRate, 3).map((r) => pickFields(r, r.win_rate)),
    top_point_diff: top(byDiff, 3).map((r) => pickFields(r, r.point_diff)),
    top_attendance: diligent,
    // Only awarded when someone else is doing better — a lone player isn't "last".
    lowest_win_rate: lowest && eligible.length > 1 ? pickFields(lowest, lowest.win_rate) : null,
  };
}

// Monday (YYYY-MM-DD) of the week containing a local date.
function weekStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// "Weeks at No. 1" — a reign on the all-time leaderboard (every match from the first one).
// Matches are replayed day by day; after each day the cumulative table is ranked with the
// same rule as the ranking table (win rate among players with at least `minMatches`
// matches, then more matches, then point difference). The holder keeps No. 1 until someone
// ranks strictly above them (an exact tie does not take it); the day that happens their
// reign ends and the new leader's starts. Weeks of a reign = ceil(days held / 7), at least 1
// (taking No. 1 today = 1 week); the current holder's reign runs to `today`.
// matches carry `day` (local date). -> [{ club_member_id, full_name, weeks, days, streak,
// current, since, last_week }] most weeks first; `streak` = their longest single reign in
// weeks, `since` = start of the current reign (holder only).
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const weeksOfDays = (d) => Math.max(1, Math.ceil(d / 7));
function weeksAtTop(matches, members, minMatches = 1, today = localDate(Date.now())) {
  const byDay = new Map();
  for (const m of matches) {
    if (!isScored(m) || !m.day) continue;
    if (!byDay.has(m.day)) byDay.set(m.day, []);
    byDay.get(m.day).push(m);
  }
  const days = [...byDay.keys()].sort();
  const key = (r) => [r.win_rate, r.matches_played, r.point_diff];
  const better = (a, b) => {
    const x = key(a);
    const y = key(b);
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  const reigns = []; // { id, name, from, to }
  let holder = null;
  const played = [];
  for (const d of days) {
    played.push(...byDay.get(d));
    const board = aggregate(played, members)
      .filter((r) => r.matches_played >= minMatches)
      .sort((a, b) => b.win_rate - a.win_rate || b.matches_played - a.matches_played || b.point_diff - a.point_diff || a.full_name.localeCompare(b.full_name, 'vi'));
    if (!board.length) continue;
    const lead = board[0];
    const mine = holder && board.find((r) => r.club_member_id === holder.id);
    if (mine && !better(lead, mine)) continue; // still No. 1 (or tied with the leader)
    if (holder) holder.to = d;
    holder = { id: lead.club_member_id, name: lead.full_name, from: d, to: null };
    reigns.push(holder);
  }
  const end = holder && today > holder.from ? today : holder?.from;
  const out = new Map();
  for (const r of reigns) {
    const held = r.to ? daysBetween(r.from, r.to) : daysBetween(r.from, end) + 1;
    const o = out.get(r.id) || { club_member_id: r.id, full_name: r.name, weeks: 0, days: 0, streak: 0, current: false, since: null, last_week: null };
    o.days += held;
    o.streak = Math.max(o.streak, weeksOfDays(held));
    o.last_week = weekStart(r.to || end);
    if (r === holder) {
      o.current = true;
      o.since = r.from;
    }
    out.set(r.id, o);
  }
  for (const o of out.values()) o.weeks = weeksOfDays(o.days);
  return [...out.values()].sort((a, b) => b.weeks - a.weeks || b.days - a.days || Number(b.current) - Number(a.current) || a.full_name.localeCompare(b.full_name));
}

module.exports = { weekStart, weeksAtTop, isScored, APP_TZ, PERIODS, DEFAULT_MIN_MATCHES, localDate, periodBounds, aggregate, awards, winnerTeam };
