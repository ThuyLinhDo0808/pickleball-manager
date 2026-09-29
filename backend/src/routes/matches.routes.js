const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');

const router = express.Router();
const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };
const PLAYER_SELECT = '*, match_players(*, club_members(full_name, gender), event_participants(full_name))';

// Accept YouTube links only (watch, youtu.be, shorts, live, embed); empty clears it.
function cleanVideoUrl(v) {
  if (v == null || v === '') return { value: null };
  try {
    const u = new URL(String(v).trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return { error: 'video_url must be a YouTube link.' };
    return { value: u.toString() };
  } catch {
    return { error: 'video_url must be a valid URL.' };
  }
}

function cleanScore(v) {
  const n = Number(v ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

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
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  let query = supabase.from('matches').select(PLAYER_SELECT).order('played_at', { ascending: false }).limit(limit);
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
  const { club_id, event_id, players } = req.body;
  const match_type = TEAM_SIZE[req.body.match_type] ? req.body.match_type : 'doubles';
  const team1_score = cleanScore(req.body.team1_score);
  const team2_score = cleanScore(req.body.team2_score);
  if (team1_score == null || team2_score == null) return res.status(400).json({ error: 'scores must be whole numbers 0-99.' });
  const video = cleanVideoUrl(req.body.video_url);
  if (video.error) return res.status(400).json({ error: video.error });
  const played_at = req.body.played_at ? new Date(req.body.played_at) : new Date();
  if (Number.isNaN(played_at.getTime())) return res.status(400).json({ error: 'played_at is not a valid date.' });

  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id is required.' });
  if (club_id && event_id) return res.status(400).json({ error: 'match belongs to exactly one of club_id or event_id.' });
  if (!Array.isArray(players) || players.length < 2) {
    return res.status(400).json({ error: 'players[] with at least 2 entries is required.' });
  }

  const parent = { club_id: club_id || null, event_id: event_id || null };
  const owns = await ownsParent(req.hostId, parent);
  if (!owns) return res.status(403).json({ error: 'You do not own this club/event.' });

  const size = TEAM_SIZE[match_type];
  for (const team of [1, 2]) {
    if (players.filter((p) => p.team === team).length !== size) {
      return res.status(400).json({ error: `${match_type} needs ${size} player(s) per team.` });
    }
  }
  const keys = players.map((p) => p.club_member_id || p.event_participant_id);
  if (new Set(keys).size !== keys.length) return res.status(400).json({ error: 'a player cannot appear twice in a match.' });

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
      match_type,
      team1_score,
      team2_score,
      video_url: video.value,
      played_at: played_at.toISOString(),
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
  const { error: pErr } = await supabase.from('match_players').insert(playerRows);
  if (pErr) {
    // roll back the match if player rows failed to insert
    await supabase.from('matches').delete().eq('id', match.id);
    return dbError(res, pErr);
  }

  const { data: full, error: fErr } = await supabase.from('matches').select(PLAYER_SELECT).eq('id', match.id).single();
  if (fErr) return dbError(res, fErr);
  res.status(201).json(full);
});

router.patch('/:matchId', async (req, res) => {
  if (!isUuid(req.params.matchId)) return notFound(res, 'Match');
  const { data: match, error: fErr } = await supabase.from('matches').select('*').eq('id', req.params.matchId).maybeSingle();
  if (fErr) return dbError(res, fErr);
  if (!match) return notFound(res, 'Match');
  const owns = await ownsParent(req.hostId, { club_id: match.club_id, event_id: match.event_id });
  if (!owns) return notFound(res, 'Match');

  // match_type is fixed after creation: changing it would break the team sizes.
  const fields = pick(req.body, ['team1_score', 'team2_score', 'video_url', 'played_at']);
  for (const k of ['team1_score', 'team2_score']) {
    if (k in fields) {
      fields[k] = cleanScore(fields[k]);
      if (fields[k] == null) return res.status(400).json({ error: 'scores must be whole numbers 0-99.' });
    }
  }
  if ('video_url' in fields) {
    const video = cleanVideoUrl(fields.video_url);
    if (video.error) return res.status(400).json({ error: video.error });
    fields.video_url = video.value;
  }
  if ('played_at' in fields) {
    const d = new Date(fields.played_at);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'played_at is not a valid date.' });
    fields.played_at = d.toISOString();
  }
  const { data, error } = await supabase.from('matches').update(fields).eq('id', match.id).select(PLAYER_SELECT).single();
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
