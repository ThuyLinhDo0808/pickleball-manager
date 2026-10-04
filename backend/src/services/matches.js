const { supabase } = require('../supabase');
const { pick } = require('../utils/respond');
const { clubSport, badmintonResult } = require('./sport');
const { extrasReady } = require('./memberExtras');

const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };
const PLAYER_SELECT = '*, match_players(*, club_members(full_name, gender), event_participants(full_name))';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Accept YouTube links only (watch, youtu.be, shorts, live, embed); empty clears it.
function cleanVideoUrl(v) {
  if (v == null || v === '') return null;
  let u;
  try {
    u = new URL(String(v).trim());
  } catch {
    throw badRequest('video_url must be a valid URL.');
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) throw badRequest('video_url must be a YouTube link.');
  return u.toString();
}

function cleanScore(v) {
  const n = Number(v ?? 0);
  if (!(Number.isInteger(n) && n >= 0 && n <= 99)) throw badRequest('scores must be whole numbers 0-99.');
  return n;
}

function cleanDate(v) {
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) throw badRequest('played_at is not a valid date.');
  return d.toISOString();
}

// A player entry must belong to the same parent (club_member <-> club, event_participant <-> event)
async function playerBelongsToParent(player, parent) {
  if (player.club_member_id) {
    if (!parent.club_id) return false;
    const { data } = await supabase.from('club_members').select('id').eq('id', player.club_member_id).eq('club_id', parent.club_id).maybeSingle();
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

// The sport of a match's club (or of the club running its session).
async function parentSport(parent) {
  if (parent.club_id) return clubSport(parent.club_id);
  if (!parent.event_id) return 'pickleball';
  const { data } = await supabase.from('events').select('club_id').eq('id', parent.event_id).maybeSingle();
  return clubSport(data?.club_id);
}

// Badminton: the games (e.g. [[21,18],[19,21],[21,15]]) give the result; the team scores
// hold the games won. Pickleball: the two scores as typed.
function badmintonScores(body) {
  try {
    return badmintonResult(body.games, body.format);
  } catch (err) {
    throw badRequest(err.message);
  }
}

const blank = (v) => v === undefined || v === null || v === '';

// No score sent: the match is set up now (who plays whom) and scored later.
function noScore(body, badminton) {
  if (badminton) return blank(body.games) || (Array.isArray(body.games) && body.games.every((g) => !g || (blank(g[0]) && blank(g[1]))));
  return blank(body.team1_score) && blank(body.team2_score);
}

// Singles or doubles follows from the players: 1 per team = singles, 2 = doubles
// ('mixed' is kept when the caller says so).
function matchTypeFor(players, asked) {
  const n1 = players.filter((p) => p.team === 1).length;
  const n2 = players.filter((p) => p.team === 2).length;
  if (n1 !== n2 || ![1, 2].includes(n1)) throw badRequest('Each team needs the same number of players: 1 (singles) or 2 (doubles).');
  if (n1 === 1) return 'singles';
  return asked === 'mixed' ? 'mixed' : 'doubles';
}

// Validates and stores a match. `parent` = { club_id } or { event_id } — ownership
// (host or staff) must already have been checked by the caller.
async function createMatch(parent, body) {
  const players = body.players;
  if (!Array.isArray(players)) throw badRequest('players[] is required.');
  if (players.some((p) => ![1, 2].includes(p.team))) throw badRequest('each player needs team 1 or 2.');
  const match_type = matchTypeFor(players, body.match_type);
  const badminton = (await parentSport(parent)) === 'badminton';
  // Not scored yet: both scores stay empty (needs migration 20261014090000; before it,
  // an unscored match is saved as 0-0 like it always was).
  const later = noScore(body, badminton) && (await extrasReady());
  const result = later
    ? { team1_score: null, team2_score: null }
    : badminton
      ? badmintonScores(body)
      : { team1_score: cleanScore(body.team1_score), team2_score: cleanScore(body.team2_score) };
  const { team1_score, team2_score } = result;
  const video_url = cleanVideoUrl(body.video_url);
  const played_at = cleanDate(body.played_at);

  const keys = players.map((p) => p.club_member_id || p.event_participant_id);
  if (new Set(keys).size !== keys.length) throw badRequest('a player cannot appear twice in a match.');
  for (const p of players) {
    if (!(await playerBelongsToParent(p, parent))) throw badRequest('a player does not belong to this club/event.');
  }

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({
      club_id: parent.club_id || null,
      event_id: parent.event_id || null,
      match_type,
      team1_score,
      team2_score,
      ...(badminton && result.games ? { games: result.games } : {}),
      video_url,
      played_at,
    })
    .select()
    .single();
  if (mErr) throw mErr;

  const { error: pErr } = await supabase.from('match_players').insert(
    players.map((p) => ({
      match_id: match.id,
      team: p.team,
      club_member_id: p.club_member_id || null,
      event_participant_id: p.event_participant_id || null,
    }))
  );
  if (pErr) {
    await supabase.from('matches').delete().eq('id', match.id); // roll back
    throw pErr;
  }

  const { data: full, error: fErr } = await supabase.from('matches').select(PLAYER_SELECT).eq('id', match.id).single();
  if (fErr) throw fErr;
  return full;
}

// Score / video / time edits. match_type is fixed: changing it would break team sizes.
async function updateMatch(matchId, body, allowed = ['team1_score', 'team2_score', 'video_url', 'played_at']) {
  const fields = pick(body, allowed);
  if (body.games !== undefined) {
    const { data: m } = await supabase.from('matches').select('club_id, event_id').eq('id', matchId).single();
    if ((await parentSport(m)) === 'badminton') Object.assign(fields, badmintonScores(body));
  }
  if ('team1_score' in fields && body.games === undefined) fields.team1_score = cleanScore(fields.team1_score);
  if ('team2_score' in fields && body.games === undefined) fields.team2_score = cleanScore(fields.team2_score);
  if ('video_url' in fields) fields.video_url = cleanVideoUrl(fields.video_url);
  if ('played_at' in fields) fields.played_at = cleanDate(fields.played_at);
  const { data, error } = await supabase.from('matches').update(fields).eq('id', matchId).select(PLAYER_SELECT).single();
  if (error) throw error;
  return data;
}

module.exports = { TEAM_SIZE, PLAYER_SELECT, createMatch, updateMatch };
