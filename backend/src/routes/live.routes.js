const crypto = require('crypto');
const express = require('express');
const { requireFeature } = require('../services/plan');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { actingHost } = require('../services/clubAccess');
const { todayYmd } = require('../services/memberships');
const { clubSport, timingReady } = require('../services/sport');
const L = require('../services/liveScore');
const T = require('../services/tournament');
const { recordMatch, recordSub, loadFull, scoresFor } = require('./tournaments.routes');

// Live (point-by-point) scoring of tournament matches  —  /api/live
// Who may score: the club's owner and co-admins, and referees / coordinators whose grant
// covers the club (one club, every club, or everything). Anyone with the public link only
// watches (see publicBoard below, mounted under /api/public/live/:token).

const SCORER_ROLES = ['referee', 'coordinator'];

function badRequest(message, status = 400, code) {
  return Object.assign(new Error(message), { status, code });
}
function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
}

const activeToday = (g, today = todayYmd()) => (!g.valid_from || g.valid_from <= today) && (!g.valid_until || g.valid_until >= today);

// Does a referee / coordinator grant cover this tournament's club?
function grantCovers(g, t) {
  if (g.host_id !== t.host_id || !SCORER_ROLES.includes(g.role) || !activeToday(g)) return false;
  if (g.event_id) return false;
  if (g.club_id) return g.club_id === t.club_id;
  return (g.scope || 'all') !== 'xeve';
}

async function staffGrants(req) {
  if (!req.emailVerified || !req.hostEmail) return [];
  const { data, error } = await supabase.from('staff_grants').select('*').eq('email', req.hostEmail.toLowerCase());
  if (error) throw error;
  return data || [];
}

// 'manager' (owner / co-admin) or 'staff', else null.
async function roleFor(req, t) {
  const me = req.userId;
  if (t.host_id === me) return 'manager';
  if (t.club_id && (await actingHost(req, t.club_id).catch(() => null)) === t.host_id) return 'manager';
  return (await staffGrants(req)).some((g) => grantCovers(g, t)) ? 'staff' : null;
}

async function loadTournament(id) {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function memberNames(ids) {
  const clean = [...new Set(ids.filter(isUuid))];
  if (!clean.length) return {};
  const { data, error } = await supabase.from('club_members').select('id, full_name').in('id', clean);
  if (error) throw error;
  return Object.fromEntries((data || []).map((m) => [m.id, m.full_name]));
}

// Teams / fixtures of a tournament as "scoreable" items: { match_id | sub_match_id, label,
// team names, default line-ups, format, played }.
function scoreables(full) {
  const teamOf = (id) => full.teams.find((x) => x.id === id) || null;
  const items = [];
  if (full.kind === 'team') {
    for (const f of full.matches || []) {
      for (const sub of f.subs || []) {
        items.push({
          sub_match_id: sub.id,
          fixture_id: f.id,
          round: f.round,
          format: sub.format,
          team1: teamOf(f.team1_id)?.name || '?',
          team2: teamOf(f.team2_id)?.name || '?',
          team1_id: f.team1_id,
          team2_id: f.team2_id,
          lineup: { 1: [sub.team1_p1, sub.team1_p2].filter(Boolean), 2: [sub.team2_p1, sub.team2_p2].filter(Boolean) },
          played: sub.team1_score != null,
          score: sub.team1_score != null ? [sub.team1_score, sub.team2_score] : null,
          games: sub.games || null,
          duration_sec: sub.duration_sec ?? null,
          score_format: sub.score_format || null,
        });
      }
    }
  } else {
    for (const m of full.matches) {
      if (m.is_bye || !m.team1_id || !m.team2_id) continue;
      const a = teamOf(m.team1_id);
      const b = teamOf(m.team2_id);
      items.push({
        match_id: m.id,
        stage: m.stage,
        group_no: m.group_no,
        round: m.round,
        format: full.format,
        team1: a?.name || '?',
        team2: b?.name || '?',
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        lineup: { 1: [a?.player1_id, a?.player2_id].filter(Boolean), 2: [b?.player1_id, b?.player2_id].filter(Boolean) },
        played: m.team1_score != null,
        score: m.team1_score != null ? [m.team1_score, m.team2_score] : null,
        games: m.games || null,
        duration_sec: m.duration_sec ?? null,
        score_format: m.score_format || null,
        // Group results are locked once the knockout exists.
        locked: m.stage === 'group' && full.status !== 'groups' && !full.round_robin,
      });
    }
  }
  return items;
}

// A live row as the pages use it: settings, names, and the rebuilt state.
function liveView(row, item, names) {
  let state;
  try {
    state = L.replay(row.config, row.players, row.log || [], row.stamps || null);
  } catch {
    state = null;
  }
  const label = (id, team, i) => names[id] || `${team === 1 ? item?.team1 : item?.team2 || ''} #${i + 1}`;
  const nameMap = {};
  for (const team of [1, 2]) (state?.positions?.[team] || []).forEach((id, i) => (nameMap[id] = label(id, team, i)));
  return {
    id: row.id,
    match_id: row.match_id,
    sub_match_id: row.sub_match_id,
    court: row.court,
    status: row.status,
    config: row.config,
    team1: item?.team1 || '?',
    team2: item?.team2 || '?',
    format: item?.format || null,
    names: nameMap,
    state,
    events: (row.log || []).length,
    version: row.updated_at,
    started_at: row.started_at,
    updated_at: row.updated_at,
  };
}

async function liveRows(tournamentId) {
  const { data, error } = await supabase.from('tournament_live').select('*').eq('tournament_id', tournamentId).order('started_at');
  if (error) throw error;
  return data || [];
}

// Everything a scorer / watcher needs for one tournament.
async function board(t, { includePrivate = false } = {}) {
  const [full, rows] = await Promise.all([loadFull(t), liveRows(t.id)]);
  const items = scoreables(full);
  const byKey = (r) => items.find((x) => (r.match_id ? x.match_id === r.match_id : x.sub_match_id === r.sub_match_id));
  const ids = [...items.flatMap((x) => [...x.lineup[1], ...x.lineup[2]]), ...rows.flatMap((r) => [...(r.players?.[1] || []), ...(r.players?.[2] || [])])];
  const names = await memberNames(ids);
  const lives = rows.map((r) => liveView(r, byKey(r), names));
  const liveKeys = new Set(rows.filter((r) => r.status === 'live').map((r) => r.match_id || r.sub_match_id));
  return {
    tournament: {
      id: t.id,
      name: t.name,
      kind: t.kind,
      status: full.status,
      sport: await clubSport(t.club_id),
      event_date: t.event_date,
      location: t.location,
      ...(includePrivate ? { live_token: t.live_token || null } : {}),
    },
    champion: full.champion_id ? full.teams.find((x) => x.id === full.champion_id)?.name || null : null,
    lives,
    matches: items.map((x) => ({
      ...x,
      lineup_names: { 1: x.lineup[1].map((id) => names[id] || '?'), 2: x.lineup[2].map((id) => names[id] || '?') },
      live: liveKeys.has(x.match_id || x.sub_match_id),
    })),
    // Members of each team (team leagues pick a line-up per sub-match).
    rosters: full.kind === 'team' ? Object.fromEntries(full.teams.map((tm) => [tm.id, (tm.players || []).map((p) => ({ id: p.id, full_name: p.full_name, gender: p.gender }))])) : null,
  };
}

const router = express.Router();

// Tournaments a referee / coordinator may score (the Staff workspace lists them).
router.get('/tournaments', async (req, res) => {
  try {
    const grants = (await staffGrants(req)).filter((g) => SCORER_ROLES.includes(g.role) && activeToday(g) && !g.event_id && (g.club_id || (g.scope || 'all') !== 'xeve'));
    if (!grants.length) return res.json([]);
    const hosts = [...new Set(grants.map((g) => g.host_id))];
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, kind, status, event_date, location, club_id, host_id, clubs(name)')
      .in('host_id', hosts)
      .neq('status', 'completed')
      .order('event_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    res.json((data || []).filter((t) => grants.some((g) => grantCovers(g, t))).map(({ host_id, clubs, ...t }) => ({ ...t, club_name: clubs?.name || null })));
  } catch (err) {
    fail(res, err);
  }
});

router.param('tournamentId', async (req, res, next, id) => {
  try {
    const t = await loadTournament(id);
    const role = t && (await roleFor(req, t));
    if (!role) return notFound(res, 'Tournament');
    req.tournament = t;
    req.liveRole = role;
    next();
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:tournamentId', async (req, res) => {
  try {
    res.json({ role: req.liveRole, ...(await board(req.tournament, { includePrivate: req.liveRole === 'manager' })) });
  } catch (err) {
    fail(res, err);
  }
});

// Turn the public live board on (new link) or off. Managers only.
router.post('/:tournamentId/public', async (req, res) => {
  try {
    if (req.liveRole !== 'manager') throw badRequest('Only the club managers can share the live board.', 403);
    const token = req.body.on === false ? null : crypto.randomBytes(9).toString('base64url');
    const { error } = await supabase.from('tournaments').update({ live_token: token }).eq('id', req.tournament.id);
    if (error) throw error;
    res.json({ live_token: token });
  } catch (err) {
    fail(res, err);
  }
});

// Start scoring a match live (or pick up the one already running).
router.post('/:tournamentId/start', requireFeature('tournaments', (req) => req.tournament.host_id), async (req, res) => {
  const t = req.tournament;
  try {
    const { match_id, sub_match_id } = req.body;
    if (!!match_id === !!sub_match_id) throw badRequest('Pick one match.');
    const full = await loadFull(t);
    const item = scoreables(full).find((x) => (match_id ? x.match_id === match_id : x.sub_match_id === sub_match_id));
    if (!item) throw badRequest('Match not found.', 404);
    if (item.locked) throw badRequest('The knockout has started; group results are locked.', 409);

    const { data: existing } = await supabase
      .from('tournament_live')
      .select('*')
      .eq(match_id ? 'match_id' : 'sub_match_id', match_id || sub_match_id)
      .maybeSingle();
    if (existing?.status === 'live') return res.json((await board(t)).lives.find((l) => l.id === existing.id));
    if (item.played && !req.body.rescore) throw badRequest('This match already has a result.', 409, 'played');

    // Line-up: given (team leagues pick per sub-match) or the team's players.
    let players = { 1: item.lineup[1], 2: item.lineup[2] };
    if (req.body.players) {
      const want = T.TEAM_SIZE?.[item.format] || (item.format === 'singles' ? 1 : 2);
      const chosen = { 1: (req.body.players[1] || []).filter(Boolean), 2: (req.body.players[2] || []).filter(Boolean) };
      if (chosen[1].length || chosen[2].length) {
        for (const side of [1, 2]) {
          const ids = chosen[side];
          if (!ids.every(isUuid) || new Set(ids).size !== ids.length) throw badRequest('Pick different players.');
          if (ids.length && ids.length !== want) throw badRequest(`Pick ${want} player(s) per side.`);
          if (t.kind === 'team' && ids.length) {
            const teamId = side === 1 ? item.team1_id : item.team2_id;
            const { data: rows } = await supabase.from('tournament_team_members').select('club_member_id').eq('team_id', teamId).in('club_member_id', ids);
            if ((rows || []).length !== ids.length) throw badRequest('A player is not in that team.');
          } else if (ids.length && !ids.every((id) => item.lineup[side].includes(id))) {
            throw badRequest('A player is not in that team.');
          }
        }
        players = { 1: chosen[1].length ? chosen[1] : item.lineup[1], 2: chosen[2].length ? chosen[2] : item.lineup[2] };
      }
    }
    // Right / left at the start: the order given (the Host can swap at 0-0 too).
    const sport = await clubSport(t.club_id);
    const doublesFormat = item.format !== 'singles';
    let config;
    try {
      config = L.cleanConfig(sport, { ...req.body, doubles: doublesFormat }, doublesFormat ? null : players);
      config.doubles = doublesFormat;
    } catch (err) {
      throw badRequest(err.message);
    }
    const row = {
      tournament_id: t.id,
      match_id: match_id || null,
      sub_match_id: sub_match_id || null,
      court: String(req.body.court || '').trim().slice(0, 40) || null,
      config,
      players,
      log: [],
      ...((await timingReady()) ? { stamps: [] } : {}),
      status: 'live',
      scorer_name: req.hostEmail || null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const q = existing
      ? supabase.from('tournament_live').update(row).eq('id', existing.id).select().single()
      : supabase.from('tournament_live').insert(row).select().single();
    const { data, error } = await q;
    if (error) throw error;
    res.status(201).json((await board(t)).lives.find((l) => l.id === data.id));
  } catch (err) {
    fail(res, err);
  }
});

async function liveRow(t, liveId) {
  if (!isUuid(liveId)) throw badRequest('Live match not found.', 404);
  const { data, error } = await supabase.from('tournament_live').select('*').eq('id', liveId).eq('tournament_id', t.id).maybeSingle();
  if (error) throw error;
  if (!data) throw badRequest('Live match not found.', 404);
  return data;
}

// Save a new log, but only if nobody else changed it since the scorer's last view
// (`version` = updated_at they saw): two phones scoring one match can't double-count.
async function writeLog(t, row, log, version) {
  if (version && version !== row.updated_at) throw badRequest('Someone else just updated this match — refreshed.', 409, 'stale');
  try {
    L.replay(row.config, row.players, log);
  } catch (err) {
    throw badRequest(err.message);
  }
  // Event times follow the log: a new event gets "now", undo drops the last one.
  const timed = await timingReady();
  const old = (row.stamps || []).slice(0, log.length);
  while (old.length < log.length) old.push(Date.now());
  const { data, error } = await supabase
    .from('tournament_live')
    .update({ log, ...(timed ? { stamps: old } : {}), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select();
  if (error) throw error;
  if (!data?.length) throw badRequest('Someone else just updated this match — refreshed.', 409, 'stale');
}

async function viewOf(t, liveId) {
  return (await board(t)).lives.find((l) => l.id === liveId);
}

// One event: a rally won ('r1' / 'r2'), who serves first ('s1' / 's2') or a position swap.
router.post('/:tournamentId/:liveId/event', async (req, res) => {
  const t = req.tournament;
  try {
    const row = await liveRow(t, req.params.liveId);
    if (row.status !== 'live') throw badRequest('This match is no longer live.', 409);
    if (!L.EVENTS.has(req.body.ev)) throw badRequest('Unknown event.');
    await writeLog(t, row, [...(row.log || []), req.body.ev], req.body.version);
    res.json(await viewOf(t, row.id));
  } catch (err) {
    if (err.code === 'stale') {
      const live = await viewOf(t, req.params.liveId).catch(() => null);
      return res.status(409).json({ error: err.message, code: 'stale', live });
    }
    fail(res, err);
  }
});

router.post('/:tournamentId/:liveId/undo', async (req, res) => {
  const t = req.tournament;
  try {
    const row = await liveRow(t, req.params.liveId);
    if (row.status !== 'live') throw badRequest('This match is no longer live.', 409);
    if (!(row.log || []).length) throw badRequest('Nothing to undo.');
    await writeLog(t, row, row.log.slice(0, -1), req.body.version);
    res.json(await viewOf(t, row.id));
  } catch (err) {
    if (err.code === 'stale') {
      const live = await viewOf(t, req.params.liveId).catch(() => null);
      return res.status(409).json({ error: err.message, code: 'stale', live });
    }
    fail(res, err);
  }
});

// Court name (e.g. "Sân 2") — shown on the public board.
router.patch('/:tournamentId/:liveId', async (req, res) => {
  const t = req.tournament;
  try {
    const row = await liveRow(t, req.params.liveId);
    const court = String(req.body.court || '').trim().slice(0, 40) || null;
    const { error } = await supabase.from('tournament_live').update({ court }).eq('id', row.id);
    if (error) throw error;
    res.json(await viewOf(t, row.id));
  } catch (err) {
    fail(res, err);
  }
});

// Match over → store the result in the tournament (standings / bracket update as usual).
router.post('/:tournamentId/:liveId/save', async (req, res) => {
  const t = req.tournament;
  try {
    const row = await liveRow(t, req.params.liveId);
    if (row.status !== 'live') throw badRequest('Already saved.', 409);
    const state = L.replay(row.config, row.players, row.log || [], row.stamps || null);
    const result = L.resultOf(row.config, state);
    if (!result) throw badRequest('The match is not over yet.');
    if (row.match_id) {
      await recordMatch(t, row.match_id, result);
    } else {
      // Real players only (placeholders like "1a" are not stored).
      const real = (ids) => (ids || []).filter(isUuid);
      await recordSub(t, row.sub_match_id, result, { team1_players: real(row.players?.[1]), team2_players: real(row.players?.[2]) });
    }
    const { error } = await supabase.from('tournament_live').update({ status: 'saved', updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error;
    res.json(await viewOf(t, row.id));
  } catch (err) {
    fail(res, err);
  }
});

// Enter the result after the match (no live scoring): same checks as the tournament page,
// open to the same people as live scoring (owners, co-admins, club referees / coordinators).
router.post('/:tournamentId/result', async (req, res) => {
  const t = req.tournament;
  try {
    const { match_id, sub_match_id } = req.body;
    if (!!match_id === !!sub_match_id) throw badRequest('Pick one match.');
    if (!isUuid(match_id || sub_match_id)) throw badRequest('Match not found.', 404);
    const { data: running } = await supabase
      .from('tournament_live')
      .select('id, status')
      .eq(match_id ? 'match_id' : 'sub_match_id', match_id || sub_match_id)
      .maybeSingle();
    if (running?.status === 'live') throw badRequest('This match is being scored live — finish or stop it first.', 409, 'live');
    const result = req.body.clear ? { clear: true } : await scoresFor(t, req.body);
    if (match_id) await recordMatch(t, match_id, result);
    else await recordSub(t, sub_match_id, result, req.body.clear ? {} : { team1_players: req.body.team1_players, team2_players: req.body.team2_players });
    res.json(await board(t));
  } catch (err) {
    fail(res, err);
  }
});

// Stop scoring live (nothing is stored in the tournament).
router.delete('/:tournamentId/:liveId', async (req, res) => {
  const t = req.tournament;
  try {
    const row = await liveRow(t, req.params.liveId);
    const { error } = await supabase.from('tournament_live').delete().eq('id', row.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

// Public live board (no login): /api/public/live/:token. Names and scores only.
async function publicBoard(req, res) {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return notFound(res, 'Live board');
  try {
    const { data: t, error } = await supabase.from('tournaments').select('*').eq('live_token', token).maybeSingle();
    if (error) throw error;
    if (!t) return notFound(res, 'Live board');
    const b = await board(t);
    const { data: club } = await supabase.from('clubs').select('name').eq('id', t.club_id).maybeSingle();
    res.set('Cache-Control', 'no-store');
    res.json({
      tournament: { ...b.tournament, club_name: club?.name || null },
      champion: b.champion,
      lives: b.lives.filter((l) => l.status === 'live' || Date.now() - new Date(l.updated_at).getTime() < 30 * 60 * 1000),
      matches: b.matches.map(({ lineup, ...m }) => m),
    });
  } catch (err) {
    fail(res, err);
  }
}

module.exports = router;
module.exports.publicBoard = publicBoard;
