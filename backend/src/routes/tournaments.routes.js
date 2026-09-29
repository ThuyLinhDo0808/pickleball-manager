const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const T = require('../services/tournament');

const router = express.Router();
const FORMATS = Object.keys(T.TEAM_SIZE);

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message }) : dbError(res, err);
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
    const players = await clubMembers(club_id, ids);
    res.json(T.pairTeams(players, format, mode === 'random' ? 'random' : 'balanced'));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', async (req, res) => {
  const { club_id, format } = req.body;
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
        group_count: groupCount,
        advance_per_group: advance,
        status: groupCount > 0 ? 'groups' : 'knockout',
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

router.delete('/:tournamentId', async (req, res) => {
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
