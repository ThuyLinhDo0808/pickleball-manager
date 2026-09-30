const express = require('express');
const { supabase } = require('../supabase');
const features = require('../services/features');
const { dbError, notFound, isUuid } = require('../utils/respond');
const T = require('../services/tournament');

const router = express.Router();
const FORMATS = Object.keys(T.TEAM_SIZE);
const DIVISIONS = ['open', 'men', 'women'];
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

// Date / time / place (for the calendar) — shared by create and edit.
function scheduleFields(body) {
  const out = {};
  if ('event_date' in body) {
    if (body.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) throw badRequest('event_date must be YYYY-MM-DD.');
    out.event_date = body.event_date || null;
  }
  for (const k of ['start_time', 'end_time']) {
    if (k in body) {
      if (body[k] && !TIME_RE.test(body[k])) throw badRequest(`${k} must be HH:MM.`);
      out[k] = body[k] || null;
    }
  }
  if ('location' in body) out.location = String(body.location || '').trim() || null;
  if ('entry_fee' in body) {
    const fee = Number(body.entry_fee || 0);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000000) throw badRequest('entry_fee must be 0-100,000,000.');
    out.entry_fee = Math.round(fee);
  }
  if (out.start_time && out.end_time && out.end_time <= out.start_time) throw badRequest('end_time must be after start_time.');
  return out;
}

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code, feature: err.feature, tier_needed: err.tier_needed }) : dbError(res, err);
}

async function ownedClub(hostId, clubId) {
  if (!isUuid(clubId)) return null;
  const { data } = await supabase.from('clubs').select('id').eq('id', clubId).eq('host_id', hostId).maybeSingle();
  return data;
}

async function clubMembers(clubId, ids) {
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, gender, dupr_level')
    .eq('club_id', clubId)
    .in('id', ids);
  if (error) throw error;
  return data;
}

// Everything the tournament page needs, with group tables computed on the fly.
async function loadFull(t) {
  if (t.kind === 'team') return loadTeamLeague(t);
  const [{ data: teams, error: e1 }, { data: matches, error: e2 }] = await Promise.all([
    supabase.from('tournament_teams').select('*').eq('tournament_id', t.id).order('seed'),
    supabase.from('tournament_matches').select('*').eq('tournament_id', t.id).order('round').order('slot'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const seedOf = (id) => teams.find((x) => x.id === id)?.seed ?? 999;
  const groups = {};
  for (let g = 1; g <= t.group_count; g++) {
    const ids = teams.filter((x) => x.group_no === g).map((x) => x.id);
    groups[g] = T.standings(ids, matches.filter((m) => m.stage === 'group' && m.group_no === g), seedOf);
  }
  const ko = matches.filter((m) => m.stage === 'knockout');
  const rounds = ko.length ? Math.max(...ko.map((m) => m.round)) : 0;
  const final = ko.find((m) => m.round === rounds);
  return {
    ...t,
    teams,
    matches,
    groups,
    rounds,
    group_stage_done: matches.filter((m) => m.stage === 'group').every(T.isPlayed),
    champion_id: final?.winner_id || null,
  };
}

// Team league: rosters, fixtures with their sub-matches, league table, champion.
async function loadTeamLeague(t) {
  const [{ data: teams, error: e1 }, { data: fixtures, error: e2 }] = await Promise.all([
    supabase.from('tournament_teams').select('*, tournament_team_members(club_members(id, full_name, gender, dupr_level))').eq('tournament_id', t.id).order('seed'),
    supabase.from('tournament_matches').select('*, tournament_sub_matches(*)').eq('tournament_id', t.id).order('round').order('slot'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const roster = teams.map(({ tournament_team_members: tm, ...team }) => ({
    ...team,
    players: (tm || []).map((x) => x.club_members).filter(Boolean).sort((a, b) => (b.dupr_level ?? 0) - (a.dupr_level ?? 0)),
  }));
  const withResults = fixtures.map(({ tournament_sub_matches: subs, ...f }) => {
    const sorted = (subs || []).sort((a, b) => a.slot - b.slot);
    return { ...f, subs: sorted, result: T.fixtureResult(sorted, t.win_rule) };
  });
  const table = T.teamStandings(roster.map((x) => x.id), withResults);
  const allDone = withResults.length > 0 && withResults.every((f) => f.result.done);
  return {
    ...t,
    teams: roster,
    matches: withResults,
    standings: table,
    rounds: withResults.length ? Math.max(...withResults.map((f) => f.round)) : 0,
    champion_id: allDone ? table[0]?.team_id || null : null,
  };
}

// Guard for :tournamentId — must belong to the signed-in host.
router.param('tournamentId', async (req, res, next, id) => {
  if (!isUuid(id)) return notFound(res, 'Tournament');
  const { data, error } = await supabase.from('tournaments').select('*').eq('id', id).eq('host_id', req.hostId).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Tournament');
  req.tournament = data;
  next();
});

router.get('/', async (req, res) => {
  if (!(await ownedClub(req.hostId, req.query.club_id))) return notFound(res, 'Club');
  const { data, error } = await supabase
    .from('tournaments')
    .select('*, tournament_teams(count)')
    .eq('club_id', req.query.club_id)
    .order('created_at', { ascending: false });
  if (error) return dbError(res, error);
  res.json(data.map(({ tournament_teams, ...t }) => ({ ...t, team_count: tournament_teams?.[0]?.count ?? 0 })));
});

// Suggested teams (balanced or random) — the Host can still edit them before creating.
router.post('/pairing', async (req, res) => {
  const { club_id, format, mode } = req.body;
  const ids = Array.isArray(req.body.player_ids) ? [...new Set(req.body.player_ids)] : [];
  if (!(await ownedClub(req.hostId, club_id))) return notFound(res, 'Club');
  if (!FORMATS.includes(format)) return res.status(400).json({ error: 'format must be singles, doubles or mixed.' });
  if (!ids.every(isUuid)) return res.status(400).json({ error: 'invalid player id.' });
  try {
    if (mode !== 'random') await features.assertFeature(req.hostId, 'balanced_pairing');
    const players = await clubMembers(club_id, ids);
    res.json(T.pairTeams(players, format, mode === 'random' ? 'random' : 'balanced'));
  } catch (err) {
    fail(res, err);
  }
});

// Team league: split the chosen players into N teams of equal overall strength.
router.post('/team-builder', async (req, res) => {
  const { club_id } = req.body;
  const ids = Array.isArray(req.body.player_ids) ? [...new Set(req.body.player_ids)] : [];
  const count = parseInt(req.body.team_count, 10);
  if (!(await ownedClub(req.hostId, club_id))) return notFound(res, 'Club');
  if (!ids.every(isUuid)) return res.status(400).json({ error: 'invalid player id.' });
  if (!(count >= 2 && count <= 16)) return res.status(400).json({ error: 'team_count must be 2-16.' });
  if (ids.length < count * 2) return res.status(400).json({ error: 'Each team needs at least 2 players.' });
  try {
    await features.assertFeature(req.hostId, 'team_league');
    if (req.body.mode !== 'random') await features.assertFeature(req.hostId, 'balanced_pairing');
    const players = await clubMembers(club_id, ids);
    res.json({ teams: T.buildTeams(players, count, req.body.mode === 'random' ? 'random' : 'balanced') });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', async (req, res) => {
  if (req.body.kind === 'team') return createTeamLeague(req, res);
  const { club_id, format } = req.body;
  const division = DIVISIONS.includes(req.body.division) ? req.body.division : 'open';
  const name = String(req.body.name || '').trim();
  const groupCount = parseInt(req.body.group_count, 10) || 0;
  const advance = parseInt(req.body.advance_per_group, 10) || 2;
  const teamsIn = Array.isArray(req.body.teams) ? req.body.teams : [];

  try {
    if (!(await ownedClub(req.hostId, club_id))) throw badRequest('Club not found.', 404);
    if (!name) throw badRequest('name is required.');
    if (!FORMATS.includes(format)) throw badRequest('format must be singles, doubles or mixed.');
    if (teamsIn.length < 2) throw badRequest('At least 2 teams are needed.');

    const size = T.TEAM_SIZE[format];
    const allIds = teamsIn.flatMap((t) => t.player_ids || []);
    if (!allIds.every(isUuid)) throw badRequest('invalid player id.');
    if (new Set(allIds).size !== allIds.length) throw badRequest('A player can only be in one team.');
    const members = await clubMembers(club_id, allIds);
    const byId = new Map(members.map((m) => [m.id, m]));

    const teams = teamsIn.map((t) => {
      const ids = t.player_ids || [];
      if (ids.length !== size) throw badRequest(`Each ${format} team needs ${size} player(s).`);
      const players = ids.map((id) => byId.get(id));
      if (players.some((p) => !p)) throw badRequest('A player is not in this club.');
      if (format === 'mixed' && players.map((p) => p.gender).sort().join() !== 'female,male') {
        throw badRequest(`Mixed team "${players.map((p) => p.full_name).join(' & ')}" needs one man and one woman (set gender on the member).`);
      }
      const want = { men: 'male', women: 'female' }[division];
      if (want && format !== 'mixed' && players.some((p) => p.gender !== want)) {
        throw badRequest(`${division === 'men' ? "Men's" : "Women's"} event: "${players.map((p) => p.full_name).join(' & ')}" doesn't fit (set gender on the member).`);
      }
      return { players, strength: T.strengthOf(players) };
    });

    if (groupCount > 0) {
      if (groupCount > Math.floor(teams.length / 2)) throw badRequest('Each group needs at least 2 teams.');
      const smallest = Math.floor(teams.length / groupCount);
      if (advance > smallest) throw badRequest(`At most ${smallest} team(s) per group can advance.`);
      if (advance * groupCount < 2) throw badRequest('At least 2 teams must reach the knockout.');
    }

    // Seeds by strength (1 = strongest), then snake into groups.
    const order = teams.map((t, i) => i).sort((a, b) => teams[b].strength - teams[a].strength || a - b);
    const seedOfIdx = new Map(order.map((i, k) => [i, k + 1]));
    const groupsOfIdx = groupCount > 0 ? T.assignGroups(teams, groupCount) : teams.map(() => null);

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        host_id: req.hostId,
        club_id,
        name,
        format,
        division: format === 'mixed' ? 'open' : division,
        group_count: groupCount,
        advance_per_group: advance,
        status: groupCount > 0 ? 'groups' : 'knockout',
        ...scheduleFields(req.body),
      })
      .select()
      .single();
    if (tErr) throw tErr;

    try {
      const { data: saved, error: teamErr } = await supabase
        .from('tournament_teams')
        .insert(
          teams.map((t, i) => ({
            tournament_id: tournament.id,
            name: t.players.map((p) => p.full_name).join(' & '),
            player1_id: t.players[0].id,
            player2_id: t.players[1]?.id || null,
            strength: t.strength,
            seed: seedOfIdx.get(i),
            group_no: groupsOfIdx[i],
          }))
        )
        .select();
      if (teamErr) throw teamErr;

      let rows;
      if (groupCount > 0) {
        rows = [];
        for (let g = 1; g <= groupCount; g++) {
          const ids = saved.filter((x) => x.group_no === g).sort((a, b) => a.seed - b.seed).map((x) => x.id);
          for (const m of T.roundRobin(ids)) {
            rows.push({ tournament_id: tournament.id, stage: 'group', group_no: g, round: m.round, slot: 0, team1_id: m.a, team2_id: m.b });
          }
        }
      } else {
        const seeds = [...saved].sort((a, b) => a.seed - b.seed).map((x) => x.id);
        rows = knockoutRows(tournament.id, T.buildBracket(seeds));
      }
      const { error: mErr } = await supabase.from('tournament_matches').insert(rows);
      if (mErr) throw mErr;
    } catch (err) {
      await supabase.from('tournaments').delete().eq('id', tournament.id); // roll back
      throw err;
    }

    res.status(201).json(await loadFull(tournament));
  } catch (err) {
    fail(res, err);
  }
});

// Team league: teams (4-8 players) play every other team once; each fixture holds one
// sub-match per entry of sub_formats (e.g. mens, womens, mixed).
async function createTeamLeague(req, res) {
  const { club_id } = req.body;
  const name = String(req.body.name || '').trim();
  const teamsIn = Array.isArray(req.body.teams) ? req.body.teams : [];
  const subFormats = Array.isArray(req.body.sub_formats) ? req.body.sub_formats : [];
  const winRule = req.body.win_rule === 'points' ? 'points' : 'sub_wins';
  try {
    if (!(await ownedClub(req.hostId, club_id))) throw badRequest('Club not found.', 404);
    await features.assertFeature(req.hostId, 'team_league');
    if (!name) throw badRequest('name is required.');
    if (teamsIn.length < 2) throw badRequest('At least 2 teams are needed.');
    if (!subFormats.length || subFormats.length > 7 || !subFormats.every((f) => T.SUB_FORMATS.includes(f))) {
      throw badRequest('Pick 1-7 sub-matches (mens, womens, mixed, doubles, singles).');
    }
    const allIds = teamsIn.flatMap((t) => t.player_ids || []);
    if (!allIds.every(isUuid)) throw badRequest('invalid player id.');
    if (new Set(allIds).size !== allIds.length) throw badRequest('A player can only be in one team.');
    const members = await clubMembers(club_id, allIds);
    const byId = new Map(members.map((m) => [m.id, m]));
    const teams = teamsIn.map((t, i) => {
      const players = (t.player_ids || []).map((id) => byId.get(id));
      if (players.some((p) => !p)) throw badRequest('A player is not in this club.');
      if (players.length < 2 || players.length > 12) throw badRequest('Each team needs 2-12 players.');
      const tname = String(t.name || '').trim() || `Team ${i + 1}`;
      // Every sub-match must be playable by this roster.
      for (const f of new Set(subFormats)) {
        const men = players.filter((p) => p.gender === 'male').length;
        const women = players.filter((p) => p.gender === 'female').length;
        const ok = f === 'mens' ? men >= 2 : f === 'womens' ? women >= 2 : f === 'mixed' ? men >= 1 && women >= 1 : true;
        if (!ok) throw badRequest(`"${tname}" doesn't have enough ${f === 'womens' ? 'women' : f === 'mens' ? 'men' : 'men and women'} for the ${f} sub-match.`);
      }
      return { name: tname, players, strength: T.strengthOf(players), total: players.reduce((s, p) => s + Number(p.dupr_level ?? T.DEFAULT_DUPR), 0) };
    });

    const order = teams.map((_, i) => i).sort((a, b) => teams[b].total - teams[a].total || a - b);
    const seedOf = new Map(order.map((i, k) => [i, k + 1]));
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        host_id: req.hostId,
        club_id,
        name,
        kind: 'team',
        format: 'doubles',
        group_count: 1,
        advance_per_group: 1,
        status: 'groups',
        win_rule: winRule,
        sub_formats: subFormats,
        ...scheduleFields(req.body),
      })
      .select()
      .single();
    if (tErr) throw tErr;
    try {
      const { data: saved, error: teamErr } = await supabase
        .from('tournament_teams')
        .insert(teams.map((t, i) => ({ tournament_id: tournament.id, name: t.name, strength: t.strength, seed: seedOf.get(i), group_no: 1 })))
        .select();
      if (teamErr) throw teamErr;
      const idOf = (i) => saved.find((x) => x.seed === seedOf.get(i)).id;
      const { error: mErr } = await supabase
        .from('tournament_team_members')
        .insert(teams.flatMap((t, i) => t.players.map((p) => ({ team_id: idOf(i), club_member_id: p.id }))));
      if (mErr) throw mErr;
      const ids = [...saved].sort((a, b) => a.seed - b.seed).map((x) => x.id);
      const { data: fixtures, error: fErr } = await supabase
        .from('tournament_matches')
        .insert(T.roundRobin(ids).map((m) => ({ tournament_id: tournament.id, stage: 'group', group_no: 1, round: m.round, slot: 0, team1_id: m.a, team2_id: m.b })))
        .select('id');
      if (fErr) throw fErr;
      const { error: sErr } = await supabase
        .from('tournament_sub_matches')
        .insert(fixtures.flatMap((f) => subFormats.map((format, k) => ({ fixture_id: f.id, slot: k + 1, format }))));
      if (sErr) throw sErr;
    } catch (err) {
      await supabase.from('tournaments').delete().eq('id', tournament.id); // roll back
      throw err;
    }
    res.status(201).json(await loadFull(tournament));
  } catch (err) {
    fail(res, err);
  }
}

function knockoutRows(tournamentId, bracket) {
  return bracket.matches.map((m) => ({
    tournament_id: tournamentId,
    stage: 'knockout',
    group_no: null,
    round: m.round,
    slot: m.slot,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    winner_id: m.winner_id,
    is_bye: m.bye,
  }));
}

router.get('/:tournamentId', async (req, res) => {
  try {
    res.json(await loadFull(req.tournament));
  } catch (err) {
    fail(res, err);
  }
});

// Rename / reschedule (shown on the club calendar).
router.patch('/:tournamentId', async (req, res) => {
  try {
    const fields = scheduleFields(req.body);
    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();
      if (!name) throw badRequest('name is required.');
      fields.name = name;
    }
    const { data, error } = await supabase.from('tournaments').update(fields).eq('id', req.tournament.id).select().single();
    if (error) throw error;
    res.json(await loadFull(data));
  } catch (err) {
    fail(res, err);
  }
});

// Team league: players + score of one sub-match (or { clear: true }). The fixture result,
// league table and champion follow from all sub-matches.
router.patch('/:tournamentId/sub-matches/:subId', async (req, res) => {
  const t = req.tournament;
  try {
    if (t.kind !== 'team') throw badRequest('Not a team tournament.');
    if (!isUuid(req.params.subId)) throw badRequest('Sub-match not found.', 404);
    const { data: sub, error } = await supabase
      .from('tournament_sub_matches')
      .select('*, tournament_matches!inner(id, tournament_id, team1_id, team2_id)')
      .eq('id', req.params.subId)
      .eq('tournament_matches.tournament_id', t.id)
      .maybeSingle();
    if (error) throw error;
    if (!sub) throw badRequest('Sub-match not found.', 404);
    const fixture = sub.tournament_matches;

    let patch;
    if (req.body.clear) {
      patch = { team1_score: null, team2_score: null, played_at: null, team1_p1: null, team1_p2: null, team2_p1: null, team2_p2: null };
    } else {
      const s1 = Number(req.body.team1_score);
      const s2 = Number(req.body.team2_score);
      if (![s1, s2].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) throw badRequest('Scores must be whole numbers 0-99.');
      if (s1 === s2) throw badRequest('A sub-match needs a winner (no draws).');
      patch = { team1_score: s1, team2_score: s2, played_at: new Date().toISOString() };
      // Line-ups are optional; when given they must come from the right roster and fit the format.
      const sides = [['team1', req.body.team1_players, fixture.team1_id], ['team2', req.body.team2_players, fixture.team2_id]];
      for (const [side, ids, teamId] of sides) {
        if (!Array.isArray(ids) || !ids.filter(Boolean).length) continue;
        const clean = ids.filter(Boolean);
        if (!clean.every(isUuid) || new Set(clean).size !== clean.length) throw badRequest('Pick different players.');
        const { data: rows } = await supabase.from('tournament_team_members').select('club_members(id, full_name, gender)').eq('team_id', teamId).in('club_member_id', clean);
        const players = (rows || []).map((r) => r.club_members);
        if (players.length !== clean.length) throw badRequest('A player is not in that team.');
        if (!T.sideFits(sub.format, players)) throw badRequest(`Line-up doesn't fit ${sub.format} (check players' gender).`);
        patch[`${side}_p1`] = clean[0];
        patch[`${side}_p2`] = clean[1] || null;
      }
    }
    const { error: uErr } = await supabase.from('tournament_sub_matches').update(patch).eq('id', sub.id);
    if (uErr) throw uErr;

    // Store the fixture's result (sub-matches won) and winner, then the tournament status.
    const { data: subs } = await supabase.from('tournament_sub_matches').select('*').eq('fixture_id', fixture.id);
    const r = T.fixtureResult(subs, t.win_rule);
    await supabase
      .from('tournament_matches')
      .update({
        team1_score: r.played ? r.sub_wins[0] : null,
        team2_score: r.played ? r.sub_wins[1] : null,
        winner_id: r.done ? (r.winner === 1 ? fixture.team1_id : r.winner === 2 ? fixture.team2_id : null) : null,
        played_at: r.done ? new Date().toISOString() : null,
      })
      .eq('id', fixture.id);
    const full = await loadFull(t);
    const status = full.champion_id ? 'completed' : 'groups';
    if (status !== t.status) {
      await supabase.from('tournaments').update({ status }).eq('id', t.id);
      full.status = status;
    }
    res.json(full);
  } catch (err) {
    fail(res, err);
  }
});

// ---- Entry fees -------------------------------------------------------------
// Every player in the tournament, who has paid, and the totals. Marking a player paid
// writes a club-fund income ("tournament_fee"); unmarking voids it.
async function tournamentPlayers(t) {
  if (t.kind === 'team') {
    const { data, error } = await supabase
      .from('tournament_team_members')
      .select('club_member_id, tournament_teams!inner(tournament_id, name)')
      .eq('tournament_teams.tournament_id', t.id);
    if (error) throw error;
    return data.map((r) => ({ id: r.club_member_id, team: r.tournament_teams.name }));
  }
  const { data, error } = await supabase.from('tournament_teams').select('name, player1_id, player2_id').eq('tournament_id', t.id).order('seed');
  if (error) throw error;
  return data.flatMap((tm) => [tm.player1_id, tm.player2_id].filter(Boolean).map((id) => ({ id, team: tm.name })));
}

async function feeSummary(t) {
  const players = await tournamentPlayers(t);
  const ids = players.map((p) => p.id);
  const [{ data: members, error: e1 }, { data: paid, error: e2 }] = await Promise.all([
    ids.length ? supabase.from('club_members').select('id, full_name').in('id', ids) : { data: [] },
    supabase.from('tournament_fee_payments').select('club_member_id, amount, paid_at').eq('tournament_id', t.id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const name = new Map(members.map((m) => [m.id, m.full_name]));
  const paidBy = new Map(paid.map((p) => [p.club_member_id, p]));
  const fee = Number(t.entry_fee || 0);
  const rows = players.map((p) => ({ club_member_id: p.id, full_name: name.get(p.id) || '?', team: p.team, paid: paidBy.has(p.id), amount: Number(paidBy.get(p.id)?.amount ?? fee) }));
  const collected = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
  return { entry_fee: fee, players: rows, paid_count: rows.filter((r) => r.paid).length, expected: fee * rows.length, collected };
}

// "Edit" rebuilds a tournament: carry the entry-fee payments over from the old one.
router.post('/:tournamentId/fees/import', async (req, res) => {
  const t = req.tournament;
  try {
    const fromId = req.body.from;
    if (!isUuid(fromId) || fromId === t.id) throw badRequest('from is required.');
    const { data: old } = await supabase.from('tournaments').select('id').eq('id', fromId).eq('host_id', req.hostId).maybeSingle();
    if (!old) throw badRequest('Tournament not found.', 404);
    const ids = (await tournamentPlayers(t)).map((p) => p.id);
    if (ids.length) {
      const { error } = await supabase.from('tournament_fee_payments').update({ tournament_id: t.id }).eq('tournament_id', fromId).in('club_member_id', ids);
      if (error) throw error;
    }
    res.json(await feeSummary(t));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:tournamentId/fees', async (req, res) => {
  try {
    res.json(await feeSummary(req.tournament));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:tournamentId/fees/:memberId', async (req, res) => {
  const t = req.tournament;
  const memberId = req.params.memberId;
  try {
    if (!isUuid(memberId)) throw badRequest('Player not found.', 404);
    const players = await tournamentPlayers(t);
    if (!players.some((p) => p.id === memberId)) throw badRequest('This player is not in the tournament.', 404);
    const { data: existing } = await supabase.from('tournament_fee_payments').select('*').eq('tournament_id', t.id).eq('club_member_id', memberId).maybeSingle();
    if (req.body.paid && !existing) {
      const fee = Number(t.entry_fee || 0);
      if (!(fee > 0)) throw badRequest('Set the entry fee first.');
      const { data: m } = await supabase.from('club_members').select('full_name').eq('id', memberId).single();
      const { data: txn, error: tErr } = await supabase
        .from('transactions')
        .insert({ host_id: t.host_id, owner_type: 'club', club_id: t.club_id, type: 'income', category: 'tournament_fee', amount: fee, note: `${t.name} — ${m?.full_name || ''}` })
        .select('id')
        .single();
      if (tErr) throw tErr;
      const { error } = await supabase.from('tournament_fee_payments').insert({ tournament_id: t.id, club_member_id: memberId, amount: fee, transaction_id: txn.id });
      if (error) throw error;
    } else if (!req.body.paid && existing) {
      if (existing.transaction_id) {
        await supabase
          .from('transactions')
          .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'entry fee marked unpaid' })
          .eq('id', existing.transaction_id);
      }
      const { error } = await supabase.from('tournament_fee_payments').delete().eq('tournament_id', t.id).eq('club_member_id', memberId);
      if (error) throw error;
    }
    res.json(await feeSummary(t));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:tournamentId', async (req, res) => {
  // Entry fees already booked for this tournament are voided (the ledger keeps them).
  const { data: fees } = await supabase.from('tournament_fee_payments').select('transaction_id').eq('tournament_id', req.tournament.id);
  const txnIds = (fees || []).map((f) => f.transaction_id).filter(Boolean);
  if (txnIds.length) {
    await supabase.from('transactions').update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'tournament deleted' }).in('id', txnIds).eq('is_voided', false);
  }
  const { error } = await supabase.from('tournaments').delete().eq('id', req.tournament.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// Enter (or clear, with { clear: true }) a score. Knockout winners move on automatically.
router.patch('/:tournamentId/matches/:matchId', async (req, res) => {
  const t = req.tournament;
  try {
    if (!isUuid(req.params.matchId)) throw badRequest('Match not found.', 404);
    const { data: m, error } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', req.params.matchId)
      .eq('tournament_id', t.id)
      .maybeSingle();
    if (error) throw error;
    if (!m) throw badRequest('Match not found.', 404);
    if (t.kind === 'team') throw badRequest('Enter team results per sub-match.');
    if (m.is_bye || !m.team1_id || !m.team2_id) throw badRequest('This match has no opponent yet.');
    if (m.stage === 'group' && t.status !== 'groups') throw badRequest('The knockout has started; reset it to change group results.', 409);

    let patch;
    if (req.body.clear) {
      patch = { team1_score: null, team2_score: null, winner_id: null, played_at: null };
    } else {
      const s1 = Number(req.body.team1_score);
      const s2 = Number(req.body.team2_score);
      if (![s1, s2].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) throw badRequest('Scores must be whole numbers 0-99.');
      if (s1 === s2) throw badRequest('Tournament matches need a winner (no draws).');
      patch = { team1_score: s1, team2_score: s2, winner_id: s1 > s2 ? m.team1_id : m.team2_id, played_at: new Date().toISOString() };
    }

    let next = null;
    if (m.stage === 'knockout') {
      const { data } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', t.id)
        .eq('stage', 'knockout')
        .eq('round', m.round + 1)
        .eq('slot', Math.floor(m.slot / 2))
        .maybeSingle();
      next = data;
      if (next && T.isPlayed(next) && next.winner_id && patch.winner_id !== m.winner_id) {
        throw badRequest('The next round is already played; clear that result first.', 409);
      }
    }

    const { error: uErr } = await supabase.from('tournament_matches').update(patch).eq('id', m.id);
    if (uErr) throw uErr;

    if (m.stage === 'knockout') {
      if (next) {
        const side = m.slot % 2 === 0 ? 'team1_id' : 'team2_id';
        const { error: nErr } = await supabase.from('tournament_matches').update({ [side]: patch.winner_id }).eq('id', next.id);
        if (nErr) throw nErr;
      }
      const status = !next && patch.winner_id ? 'completed' : 'knockout';
      if (status !== t.status) await supabase.from('tournaments').update({ status }).eq('id', t.id);
      t.status = status;
    }

    res.json(await loadFull(t));
  } catch (err) {
    fail(res, err);
  }
});

// Group stage finished -> build the knockout from the group tables.
router.post('/:tournamentId/knockout', async (req, res) => {
  const t = req.tournament;
  try {
    if (t.kind === 'team') throw badRequest('Team leagues have no knockout.');
    if (t.status !== 'groups') throw badRequest('The knockout already exists.', 409);
    const full = await loadFull(t);
    if (!full.group_stage_done) throw badRequest('Enter every group match result first.');
    const groupOf = (id) => full.teams.find((x) => x.id === id)?.group_no ?? null;
    const seeds = T.seedQualifiers(full.groups, t.advance_per_group);
    const { error } = await supabase.from('tournament_matches').insert(knockoutRows(t.id, T.buildBracket(seeds, groupOf)));
    if (error) throw error;
    await supabase.from('tournaments').update({ status: 'knockout' }).eq('id', t.id);
    res.json(await loadFull({ ...t, status: 'knockout' }));
  } catch (err) {
    fail(res, err);
  }
});

// Undo the knockout (e.g. a group result was wrong). Group results are kept.
router.delete('/:tournamentId/knockout', async (req, res) => {
  const t = req.tournament;
  try {
    if (t.group_count === 0) throw badRequest('This tournament is knockout-only; delete it instead.');
    const { error } = await supabase.from('tournament_matches').delete().eq('tournament_id', t.id).eq('stage', 'knockout');
    if (error) throw error;
    await supabase.from('tournaments').update({ status: 'groups' }).eq('id', t.id);
    res.json(await loadFull({ ...t, status: 'groups' }));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
