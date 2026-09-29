const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');

const router = express.Router();

// Confirms club_id/event_id in the body belongs to the authenticated host.
async function ownsParent(hostId, { club_id, event_id }) {
  if (club_id) {
    const { data } = await supabase.from('clubs').select('id').eq('id', club_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  if (event_id) {
    const { data } = await supabase.from('events').select('id').eq('id', event_id).eq('host_id', hostId).maybeSingle();
    return !!data;
  }
  return false;
}

// A player entry must belong to the same parent (club_member <-> club, event_participant <-> event)
async function playerBelongsToParent(player, parent) {
  if (player.club_member_id) {
    if (!parent.club_id) return false;
    const { data } = await supabase
      .from('club_members')
      .select('id')
      .eq('id', player.club_member_id)
      .eq('club_id', parent.club_id)
      .maybeSingle();
    return !!data;
  }
  if (player.event_participant_id) {
    if (!parent.event_id) return false;
    const { data } = await supabase
      .from('event_participants')
      .select('id')
      .eq('id', player.event_participant_id)
      .eq('event_id', parent.event_id)
      .maybeSingle();
    return !!data;
  }
  return false;
}

router.get('/', async (req, res) => {
  const { club_id, event_id } = req.query;
  let query = supabase.from('matches').select('*, match_players(*)').order('played_at', { ascending: false });
  if (club_id) {
    if (!isUuid(club_id)) return res.status(400).json({ error: 'invalid club_id' });
    const ok = await ownsParent(req.hostId, { club_id });
    if (!ok) return notFound(res, 'Club');
    query = query.eq('club_id', club_id);
  } else if (event_id) {
    if (!isUuid(event_id)) return res.status(400).json({ error: 'invalid event_id' });
    const ok = await ownsParent(req.hostId, { event_id });
    if (!ok) return notFound(res, 'Event');
    query = query.eq('event_id', event_id);
  } else {
    return res.status(400).json({ error: 'club_id or event_id query param is required.' });
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { club_id, event_id, match_type, team1_score, team2_score, video_url, players } = req.body;

  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id is required.' });
  if (club_id && event_id) return res.status(400).json({ error: 'match belongs to exactly one of club_id or event_id.' });
  if (!Array.isArray(players) || players.length < 2) {
    return res.status(400).json({ error: 'players[] with at least 2 entries is required.' });
  }

  const parent = { club_id: club_id || null, event_id: event_id || null };
  const owns = await ownsParent(req.hostId, parent);
  if (!owns) return res.status(403).json({ error: 'You do not own this club/event.' });

  for (const p of players) {
    if (![1, 2].includes(p.team)) return res.status(400).json({ error: 'each player needs team 1 or 2.' });
    const belongs = await playerBelongsToParent(p, parent);
    if (!belongs) return res.status(400).json({ error: 'a player does not belong to this club/event.' });
  }

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({
      club_id: parent.club_id,
      event_id: parent.event_id,
      match_type: match_type || 'doubles',
      team1_score: team1_score ?? 0,
      team2_score: team2_score ?? 0,
      video_url: video_url || null,
    })
    .select()
    .single();
  if (mErr) return dbError(res, mErr);

  const playerRows = players.map((p) => ({
    match_id: match.id,
    team: p.team,
    club_member_id: p.club_member_id || null,
    event_participant_id: p.event_participant_id || null,
  }));
  const { data: savedPlayers, error: pErr } = await supabase.from('match_players').insert(playerRows).select();
  if (pErr) {
    // roll back the match if player rows failed to insert
    await supabase.from('matches').delete().eq('id', match.id);
    return dbError(res, pErr);
  }

  res.status(201).json({ ...match, match_players: savedPlayers });
});

router.patch('/:matchId', async (req, res) => {
  if (!isUuid(req.params.matchId)) return notFound(res, 'Match');
  const { data: match, error: fErr } = await supabase.from('matches').select('*').eq('id', req.params.matchId).maybeSingle();
  if (fErr) return dbError(res, fErr);
  if (!match) return notFound(res, 'Match');
  const owns = await ownsParent(req.hostId, { club_id: match.club_id, event_id: match.event_id });
  if (!owns) return notFound(res, 'Match');

  const fields = pick(req.body, ['team1_score', 'team2_score', 'video_url', 'match_type']);
  const { data, error } = await supabase.from('matches').update(fields).eq('id', match.id).select().single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.delete('/:matchId', async (req, res) => {
  if (!isUuid(req.params.matchId)) return notFound(res, 'Match');
  const { data: match, error: fErr } = await supabase.from('matches').select('*').eq('id', req.params.matchId).maybeSingle();
  if (fErr) return dbError(res, fErr);
  if (!match) return notFound(res, 'Match');
  const owns = await ownsParent(req.hostId, { club_id: match.club_id, event_id: match.event_id });
  if (!owns) return notFound(res, 'Match');

  const { error } = await supabase.from('matches').delete().eq('id', match.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

module.exports = router;
