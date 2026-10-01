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

// Badminton result: 1-3 games, each to 21 (win by 2, capped at 30), no draws.
// Returns { games, team1_score, team2_score } with the games won, or throws a message.
function badmintonResult(games) {
  if (!Array.isArray(games) || games.length < 1 || games.length > 3) throw new Error('Enter 1 to 3 games.');
  let won1 = 0;
  let won2 = 0;
  const clean = games.map((g, i) => {
    const a = Number(g?.[0]);
    const b = Number(g?.[1]);
    if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= 30)) throw new Error(`Game ${i + 1}: scores must be 0-30.`);
    if (a === b) throw new Error(`Game ${i + 1}: a game can't end level.`);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    const ok = (hi === 21 && lo <= 19) || (hi > 21 && hi < 30 && hi - lo === 2) || (hi === 30 && (lo === 28 || lo === 29));
    if (!ok) throw new Error(`Game ${i + 1}: ${a}-${b} isn't a finished game (21 points, win by 2, max 30).`);
    if (a > b) won1++;
    else won2++;
    return [a, b];
  });
  if (won1 === won2) throw new Error('The games are level: add the deciding game.');
  if (Math.max(won1, won2) > 2) throw new Error('Best of 3: the match ends at 2 games.');
  return { games: clean, team1_score: won1, team2_score: won2 };
}

module.exports = { SPORTS, BADMINTON_LEVEL_MAX, sportReady, clubSport, profileLevel, cleanLevel, badmintonResult };
