// Live scoring engine (pure). A live match is its settings plus a log of events; the
// state (scores, who serves, from which side, what to call) is rebuilt by replaying the
// log, so "undo" is just dropping the last event and several scorers can't drift apart.
//
// Events:  'r1' / 'r2'  rally won by team 1 / 2
//          's1' / 's2'  team 1 / 2 serves first in this game   (only at 0-0 of a game)
//          'x1' / 'x2'  team 1 / 2 swap left/right positions    (only at 0-0 of a game)
//
// Scoring systems (cfg.scoring):
//   'sideout'        pickleball traditional: only the serving side scores; doubles have
//                    server 1 and 2, except the first service turn of a game ("0-0-2");
//                    after a side out the player on the right serves. Call "4-2-1".
//   'sideout_single' pickleball one-serve side-out: only the serving side scores, but a lost
//                    rally is a side out straight away (no second server). Call "4-2".
//   'rally'          every rally scores and the rally winner serves next, from the right
//                    court on an even score and the left on an odd one (badminton always;
//                    pickleball rally scoring, MLP-style). Optional "freeze": a side can win
//                    the game's last point only on its own serve.
// Games go to cfg.points, win by cfg.win_by (1 or 2), up to cfg.cap when set (badminton
// 21 → 30, 15 → 21, 11 → 15).

const EVENTS = new Set(['r1', 'r2', 's1', 's2', 'x1', 'x2']);

const SCORINGS = { pickleball: ['sideout', 'sideout_single', 'rally'], badminton: ['rally'] };
const POINTS = { pickleball: [11, 15, 21], badminton: [21, 15, 11] };
const BADMINTON_CAP = { 21: 30, 15: 21, 11: 15 };

const DEFAULTS = {
  pickleball: { scoring: 'sideout', points: 11, win_by: 2, cap: null, best_of: 1, freeze: false },
  badminton: { scoring: 'rally', points: 21, win_by: 2, cap: 30, best_of: 3, freeze: false },
};

// Settings from the request, checked. players: { 1: [id, id?], 2: [id, id?] } (right, left).
function cleanConfig(sport, body = {}, players) {
  const base = DEFAULTS[sport];
  if (!base) throw new Error('Unknown sport.');
  const cfg = { sport, ...base };
  const scoring = body.scoring ?? base.scoring;
  if (!SCORINGS[sport].includes(scoring)) throw new Error(`Scoring must be ${SCORINGS[sport].join(', ')}.`);
  cfg.scoring = scoring;
  const points = Number(body.points ?? base.points);
  if (!POINTS[sport].includes(points)) throw new Error(`Points must be ${POINTS[sport].join(', ')}.`);
  cfg.points = points;
  const winBy = Number(body.win_by ?? base.win_by);
  if (![1, 2].includes(winBy)) throw new Error('win_by must be 1 or 2.');
  cfg.win_by = winBy;
  cfg.cap = sport === 'badminton' && winBy === 2 ? BADMINTON_CAP[points] : null;
  cfg.freeze = scoring === 'rally' && sport === 'pickleball' && !!body.freeze;
  const bestOf = Number(body.best_of ?? base.best_of);
  if (![1, 3, 5].includes(bestOf)) throw new Error('Best of 1, 3 or 5 games.');
  cfg.best_of = bestOf;
  const first = Number(body.first_server ?? 1);
  if (![1, 2].includes(first)) throw new Error('first_server must be 1 or 2.');
  cfg.first_server = first;
  const n1 = players?.[1]?.length || 0;
  const n2 = players?.[2]?.length || 0;
  cfg.doubles = n1 === 2 && n2 === 2 ? true : n1 === 1 && n2 === 1 ? false : body.doubles !== false;
  return cfg;
}

// Older live rows have no `scoring`: pickleball was side-out, badminton rally.
const scoringOf = (cfg) => cfg.scoring || (cfg.sport === 'badminton' ? 'rally' : 'sideout');
const twoServers = (cfg) => scoringOf(cfg) === 'sideout' && cfg.doubles;

const other = (t) => (t === 1 ? 2 : 1);

function gameOver(cfg, a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (cfg.cap && hi >= cfg.cap) return true;
  return hi >= cfg.points && hi - lo >= cfg.win_by;
}

// Would one more point for `team` end the game?
function onePointFromGame(cfg, score, team) {
  const s = [...score];
  s[team - 1] += 1;
  return gameOver(cfg, s[0], s[1]);
}

// Placeholder slots ('1a', '1b'…) when the line-up isn't known: the engine still tracks
// positions and servers, the page just shows "Player 1 / 2" of that team.
function lineup(cfg, players) {
  const side = (t) => {
    const list = (players?.[t] || []).filter(Boolean);
    const want = cfg.doubles ? 2 : 1;
    const out = list.slice(0, want);
    while (out.length < want) out.push(`${t}${'ab'[out.length]}`);
    return out;
  };
  return { 1: side(1), 2: side(2) };
}

function replay(cfg, players, log = []) {
  const scoring = scoringOf(cfg);
  const rally = scoring === 'rally';
  const pos = lineup(cfg, players);
  const games = [];
  const won = [0, 0];
  let score = [0, 0];
  let serving = cfg.first_server;
  let firstOfGame = serving;
  let serverNo = twoServers(cfg) ? 2 : 1;
  let serverId = pos[serving][0];
  let rallies = 0;
  let gameRallies = 0;
  let finished = false;
  let winner = null;
  let note = null;
  const atStart = () => score[0] === 0 && score[1] === 0 && gameRallies === 0;
  const deciding = () => games.length === cfg.best_of - 1;
  const half = Math.ceil(cfg.points / 2);

  // Who serves at the start of a game (or after a server / position change at 0-0).
  const resetServer = () => {
    serverNo = twoServers(cfg) ? 2 : 1;
    serverId = pos[serving][0];
  };
  // A side wins the serve back: side-out → the player on the right; rally → the player in
  // the court matching the side's score (even right, odd left).
  const takeServe = (team) => {
    serving = team;
    serverNo = 1;
    serverId = rally && cfg.doubles && score[team - 1] % 2 === 1 ? pos[team][1] : pos[team][0];
    note = 'side_out';
  };

  for (const ev of log) {
    if (!EVENTS.has(ev)) throw new Error(`Bad event ${ev}.`);
    if (finished) throw new Error('The match is over.');
    const team = Number(ev[1]);
    note = null;
    if (ev[0] === 's' || ev[0] === 'x') {
      if (!atStart()) throw new Error('Change the server or positions only before the first rally of a game.');
      if (ev[0] === 's') {
        serving = team;
        firstOfGame = team;
      } else {
        pos[team] = [...pos[team]].reverse();
      }
      resetServer();
      continue;
    }

    rallies += 1;
    gameRallies += 1;
    const before = Math.max(...score);
    if (team === serving) {
      // The serving side wins the rally: a point in every system; doubles partners switch courts.
      score[team - 1] += 1;
      if (cfg.doubles) pos[team] = [pos[team][1], pos[team][0]];
    } else if (rally) {
      // Rally scoring: the receivers score and take the serve — unless "freeze" stops them
      // winning the game on the other side's serve (then they only take the serve).
      if (cfg.freeze && onePointFromGame(cfg, score, team)) {
        takeServe(team);
        note = 'freeze';
      } else {
        score[team - 1] += 1;
        takeServe(team);
      }
    } else if (twoServers(cfg) && serverNo === 1) {
      serverNo = 2;
      serverId = pos[serving].find((p) => p !== serverId);
      note = 'second_server';
    } else {
      takeServe(team);
    }
    const now = Math.max(...score);
    if (before < half && now === half) {
      if (deciding()) note = 'switch_ends';
      else if (cfg.sport === 'badminton') note = 'interval';
    }

    if (gameOver(cfg, score[0], score[1])) {
      const w = score[0] > score[1] ? 1 : 2;
      games.push(score);
      won[w - 1] += 1;
      if (won[w - 1] > cfg.best_of / 2) {
        finished = true;
        winner = w;
        note = 'match_over';
      } else {
        note = 'game_over';
        score = [0, 0];
        gameRallies = 0;
        // Next game: badminton — the game's winner serves; pickleball — the other team
        // than the one that served first last game.
        serving = cfg.sport === 'badminton' ? w : other(firstOfGame);
        firstOfGame = serving;
        resetServer();
      }
    }
  }

  // Server's court: in doubles where the server stands; in singles by the server's score.
  const myScore = score[serving - 1];
  const side = cfg.doubles ? (pos[serving][0] === serverId ? 'right' : 'left') : myScore % 2 === 0 ? 'right' : 'left';
  const recv = score[other(serving) - 1];
  const call = finished ? null : twoServers(cfg) ? `${myScore}-${recv}-${serverNo}` : `${myScore}-${recv}`;

  // Game / match point: the side one point from the game. Side-out (and freeze): only the
  // serving side can win the next point.
  let point = null;
  if (!finished) {
    const canWin = rally && !cfg.freeze ? [serving, other(serving)] : [serving];
    for (const t of canWin) {
      if (onePointFromGame(cfg, score, t)) point = { team: t, match: won[t - 1] + 1 > cfg.best_of / 2 };
    }
  }

  return {
    games,
    score,
    game_no: games.length + (finished ? 0 : 1),
    games_won: won,
    serving: finished ? null : serving,
    server_no: finished ? null : serverNo,
    two_servers: twoServers(cfg),
    server_id: finished ? null : serverId,
    server_side: finished ? null : side,
    positions: pos,
    call,
    note,
    point,
    rallies,
    at_start: !finished && atStart(),
    finished,
    winner,
  };
}

// Final result as the tournament stores it: pickleball one game → the points; otherwise
// games won plus the games themselves.
function resultOf(cfg, state) {
  if (!state.finished) return null;
  if (cfg.sport === 'pickleball' && cfg.best_of === 1) {
    const [a, b] = state.games[0];
    return { s1: a, s2: b, games: null };
  }
  return { s1: state.games_won[0], s2: state.games_won[1], games: state.games };
}

module.exports = { DEFAULTS, EVENTS, SCORINGS, POINTS, BADMINTON_CAP, cleanConfig, replay, resultOf, gameOver, scoringOf };
