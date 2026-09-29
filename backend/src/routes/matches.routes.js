const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { dbError, notFound, isUuid } = require('../utils/respond');

const router = express.Router();
router.use(requireAuth);

const MATCH_TYPES = ['singles', 'doubles', 'mixed'];

// A match belongs to EITHER a club OR an event; ownership is checked against that parent.
async function ownsParent(hostId, { club_id, event_id }) {
  if (club_id) {
    if (!isUuid(club_id)) return false;
    const { data } = await supabaseAdmin.from('clubs').select('id').eq('id', club_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  if (event_id) {
    if (!isUuid(event_id)) return false;
    const { data } = await supabaseAdmin.from('events').select('id').eq('id', event_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  return false;
}

// GET /api/matches?club_id=...  or  ?event_id=...
router.get('/', async (req, res) => {
  const { club_id, event_id } = req.query;
  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id query param is required.' });
  if (!(await ownsParent(req.user.id, { club_id, event_id }))) return notFound(res, club_id ? 'Club' : 'Event');

  let query = supabaseAdmin.from('matches').select('*, match_players(*)').order('played_at', { ascending: false });
  query = club_id ? query.eq('club_id', club_id) : query.eq('event_id', event_id);
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json({ matches: data });
});

// Record a match and its players in one call.
router.post('/', async (req, res) => {
  const { club_id, event_id, team1_score, team2_score, team1_player_ids, team2_player_ids } = req.body;
  const match_type = req.body.match_type || 'doubles';

  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id is required.' });
  if (club_id && event_id) return res.status(400).json({ error: 'Provide only one of club_id or event_id.' });
  if (!MATCH_TYPES.includes(match_type)) return res.status(400).json({ error: 'match_type must be singles, doubles or mixed.' });

  if (!Array.isArray(team1_player_ids) || !Array.isArray(team2_player_ids)) {
    return res.status(400).json({ error: 'team1_player_ids and team2_player_ids must be arrays.' });
  }
  const need = match_type === 'singles' ? 1 : 2;
  if (team1_player_ids.length !== need || team2_player_ids.length !== need) {
    return res.status(400).json({ error: `${match_type} needs exactly ${need} player(s) per team.` });
  }
  const all = [...team1_player_ids, ...team2_player_ids];
  if (!all.every(isUuid)) return res.status(400).json({ error: 'Invalid player id.' });
  if (new Set(all).size !== all.length) return res.status(400).json({ error: 'A player can only appear once in a match.' });

  if (!Number.isInteger(team1_score) || !Number.isInteger(team2_score) || team1_score < 0 || team2_score < 0) {
    return res.status(400).json({ error: 'Scores must be whole numbers, 0 or more.' });
  }
  if (team1_score === team2_score) return res.status(400).json({ error: 'A match cannot end in a tie.' });

  if (!(await ownsParent(req.user.id, { club_id, event_id }))) return notFound(res, club_id ? 'Club' : 'Event');

  // Every player must belong to THIS club/event (not merely exist somewhere).
  const table = club_id ? 'club_members' : 'event_participants';
  const parentCol = club_id ? 'club_id' : 'event_id';
  const { data: found, error: findErr } = await supabaseAdmin
    .from(table).select('id').eq(parentCol, club_id || event_id).in('id', all);
  if (findErr) return dbError(res, findErr);
  if (!found || found.length !== all.length) {
    return res.status(400).json({ error: 'One or more players do not belong to this club/event.' });
  }

  const winner_team = team1_score > team2_score ? 1 : 2;
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .insert({ club_id: club_id || null, event_id: event_id || null, match_type, team1_score, team2_score, winner_team, recorded_by: req.user.id })
    .select().single();
  if (matchErr) return dbError(res, matchErr);

  const playerField = club_id ? 'club_member_id' : 'event_participant_id';
  const rows = [
    ...team1_player_ids.map((id) => ({ match_id: match.id, team: 1, [playerField]: id })),
    ...team2_player_ids.map((id) => ({ match_id: match.id, team: 2, [playerField]: id })),
  ];
  const { data: players, error: playersErr } = await supabaseAdmin.from('match_players').insert(rows).select();
  if (playersErr) {
    await supabaseAdmin.from('matches').delete().eq('id', match.id); // no half-saved matches
    return dbError(res, playersErr);
  }
  res.status(201).json({ match: { ...match, match_players: players } });
});

router.delete('/:matchId', async (req, res) => {
  if (!isUuid(req.params.matchId)) return res.status(400).json({ error: 'Invalid match id.' });
  const { data: match } = await supabaseAdmin.from('matches').select('club_id, event_id').eq('id', req.params.matchId).maybeSingle();
  if (!match || !(await ownsParent(req.user.id, match))) return notFound(res, 'Match');
  const { error } = await supabaseAdmin.from('matches').delete().eq('id', req.params.matchId);
  if (error) return dbError(res, error);
  res.status(204).send();
});

module.exports = router;
