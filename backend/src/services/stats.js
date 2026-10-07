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
// members: [{ id, full_name, gender }]
function aggregate(matches, members) {
  const byId = new Map(members.map((m) => [m.id, {
    club_member_id: m.id,
    full_name: m.full_name,
    gender: m.gender || null,
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
      win_rate: r.matches_played ? Math.round((1000 * r.wins) / r.matches_played) / 10 : 0,
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

// "Weeks at No. 1": every week (Mon–Sun) with scored matches has its own leaderboard;
// whoever tops it holds No. 1 that week (equal wins, win rate and point diff = shared).
// matches carry `day` (local date). -> [{ club_member_id, full_name, weeks, streak,
// current, last_week }] most weeks first; `streak` = their longest run of weeks in a row
// at No. 1, `current` = they top the latest week.
function weeksAtTop(matches, members) {
  const byWeek = new Map();
  for (const m of matches) {
    if (!isScored(m) || !m.day) continue;
    const k = weekStart(m.day);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(m);
  }
  const weeks = [...byWeek.keys()].sort();
  const out = new Map();
  let prevTop = new Set();
  const run = new Map();
  for (const k of weeks) {
    const board = aggregate(byWeek.get(k), members);
    const lead = board[0];
    const tops = lead ? board.filter((r) => r.wins === lead.wins && r.win_rate === lead.win_rate && r.point_diff === lead.point_diff) : [];
    const now = new Set();
    for (const r of tops) {
      const o = out.get(r.club_member_id) || { club_member_id: r.club_member_id, full_name: r.full_name, weeks: 0, streak: 0, current: false, last_week: null };
      o.weeks += 1;
      o.last_week = k;
      const n = (prevTop.has(r.club_member_id) ? run.get(r.club_member_id) || 0 : 0) + 1;
      run.set(r.club_member_id, n);
      o.streak = Math.max(o.streak, n);
      out.set(r.club_member_id, o);
      now.add(r.club_member_id);
    }
    prevTop = now;
  }
  for (const id of prevTop) out.get(id).current = true;
  return [...out.values()].sort((a, b) => b.weeks - a.weeks || b.streak - a.streak || (b.last_week || '').localeCompare(a.last_week || '') || a.full_name.localeCompare(b.full_name));
}

module.exports = { weekStart, weeksAtTop, isScored, APP_TZ, PERIODS, DEFAULT_MIN_MATCHES, localDate, periodBounds, aggregate, awards, winnerTeam };
