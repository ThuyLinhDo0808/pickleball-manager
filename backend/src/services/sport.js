// One app, several sports: each club plays one sport (clubs.sport). What differs:
//
//   level    pickleball: DUPR 1.00-8.00          badminton: step 1-6 (Yếu … Giỏi)
//   scoring  pickleball: one game, team scores   badminton: games to 21, best of 3
//            (team1_score / team2_score then hold games won, `games` the points)
//   stock    pickleball: balls retired over time badminton: shuttles used up per session
//
// The level columns are shared (club_members.dupr_level, events.level_min/max, ...);
// in a badminton club they hold the 1-6 step.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');

const SPORTS = ['pickleball', 'badminton'];
const MIGRATION = '20261012090000_multi_sport_badminton.sql';
const BADMINTON_LEVEL_MAX = 6;

async function sportReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

// Match timing + stored score format (migration 20261017): written only once it is run.
async function timingReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261017090000_match_timing_formats.sql');
}

// The club's sport (cached briefly; clubs never change sport).
const cache = new Map();
async function clubSport(clubId) {
  if (!clubId) return 'pickleball';
  const hit = cache.get(clubId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.sport;
  const { data } = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
  const sport = SPORTS.includes(data?.sport) ? data.sport : 'pickleball';
  cache.set(clubId, { sport, at: Date.now() });
  return sport;
}

// The player's own level for this sport (their profile keeps one per sport).
function profileLevel(profile, sport) {
  if (!profile) return null;
  return sport === 'badminton' ? profile.badminton_level ?? null : profile.dupr_level ?? null;
}

// A level typed by the Host / player: null, or a valid number for the sport (throws a message).
function cleanLevel(value, sport) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (sport === 'badminton') {
    if (!Number.isInteger(n) || n < 1 || n > BADMINTON_LEVEL_MAX) throw new Error('Badminton level must be a step from 1 to 6.');
    return n;
  }
  if (!(n >= 1 && n <= 8)) throw new Error('DUPR level must be between 1 and 8.');
  return n;
}

// Game formats a result can be checked against. Badminton: 21 (max 30), 15 (max 21) or
// 11 (max 15) points; pickleball: 11, 15 or 21 with no maximum; or a custom target
// (3–99, no maximum). Win by 2, or "first to the
// points" (win_by 1). best_of 1, 3 or 5 (unknown → 3 for up to 3 games, else 5).
const FORMAT_POINTS = { badminton: [21, 15, 11], pickleball: [11, 15, 21] };
const BADMINTON_CAP = { 21: 30, 15: 21, 11: 15 };

function cleanFormat(sport, f = {}) {
  const list = FORMAT_POINTS[sport] || FORMAT_POINTS.pickleball;
  // The usual targets, or any other the Host types in ("+" — e.g. 7, 9, 25).
  const points = Number(f?.points ?? list[0]);
  if (!Number.isInteger(points) || points < 3 || points > 99) throw new Error('Games go to 3–99 points.');
  const winBy = Number(f?.win_by ?? 2);
  if (![1, 2].includes(winBy)) throw new Error('win_by must be 1 or 2.');
  const bestOf = f?.best_of == null ? null : Number(f.best_of);
  if (bestOf != null && ![1, 3, 5].includes(bestOf)) throw new Error('Best of 1, 3 or 5 games.');
  return { points, win_by: winBy, cap: sport === 'badminton' && winBy === 2 ? BADMINTON_CAP[points] ?? null : null, ...(bestOf ? { best_of: bestOf } : {}) };
}

// Is a-b a finished game under this format?
function gameFinished(a, b, fmt) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  if (fmt.win_by === 1) return hi === fmt.points && lo < hi;
  if (fmt.cap && hi === fmt.cap) return lo === hi - 1 || lo === hi - 2;
  if (hi === fmt.points) return lo <= hi - 2;
  return hi > fmt.points && hi - lo === 2;
}

function formatText(fmt) {
  const tail = fmt.win_by === 1 ? 'first to the points' : `win by 2${fmt.cap ? `, max ${fmt.cap}` : ''}`;
  return `${fmt.points} points, ${tail}`;
}

// Result from games under a format: 1-5 games, each finished, no draws. Returns
// { games, team1_score, team2_score } with the games won, or throws a message.
function gamesResult(games, fmt) {
  const maxGames = fmt.best_of || 5;
  if (!Array.isArray(games) || games.length < 1 || games.length > maxGames) throw new Error(`Enter 1 to ${maxGames} games.`);
  const top = fmt.cap || (fmt.win_by === 1 ? fmt.points : 99);
  let won1 = 0;
  let won2 = 0;
  const clean = games.map((g, i) => {
    const a = Number(g?.[0]);
    const b = Number(g?.[1]);
    if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= top)) throw new Error(`Game ${i + 1}: scores must be 0-${top}.`);
    if (a === b) throw new Error(`Game ${i + 1}: a game can't end level.`);
    if (!gameFinished(a, b, fmt)) throw new Error(`Game ${i + 1}: ${a}-${b} isn't a finished game (${formatText(fmt)}).`);
    if (a > b) won1++;
    else won2++;
    return [a, b];
  });
  if (won1 === won2) throw new Error('The games are level: add the deciding game.');
  const bestOf = fmt.best_of || (games.length <= 3 ? 3 : 5);
  const need = Math.ceil(bestOf / 2);
  if (Math.max(won1, won2) > need) throw new Error(`Best of ${bestOf}: the match ends at ${need} games.`);
  return { games: clean, team1_score: won1, team2_score: won2 };
}

// Badminton result (format optional: 21 points, win by 2, max 30 by default).
function badmintonResult(games, format) {
  return gamesResult(games, cleanFormat('badminton', format || {}));
}

module.exports = { SPORTS, BADMINTON_LEVEL_MAX, sportReady, timingReady, clubSport, profileLevel, cleanLevel, badmintonResult, gamesResult, cleanFormat, gameFinished };
