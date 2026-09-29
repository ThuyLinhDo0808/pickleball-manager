const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { PLAYER_SELECT, createMatch, updateMatch } = require('../services/matches');

const router = express.Router();

function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message }) : dbError(res, err);
}

// Confirms club_id/event_id belongs to the authenticated host.
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

// Returns the match, or null after sending a 404/error response.
async function loadOwnedMatch(req, res) {
  if (!isUuid(req.params.matchId)) {
    notFound(res, 'Match');
    return null;
  }
  const { data: match, error } = await supabase.from('matches').select('*').eq('id', req.params.matchId).maybeSingle();
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!match || !(await ownsParent(req.hostId, match))) {
    notFound(res, 'Match');
    return null;
  }
  return match;
}

router.get('/', async (req, res) => {
  const { club_id, event_id } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  let query = supabase.from('matches').select(PLAYER_SELECT).order('played_at', { ascending: false }).limit(limit);
  if (club_id) {
    if (!isUuid(club_id)) return res.status(400).json({ error: 'invalid club_id' });
    if (!(await ownsParent(req.hostId, { club_id }))) return notFound(res, 'Club');
    // Include matches recorded inside this club's sessions (they count in rankings too).
    const { data: sessions, error: sErr } = await supabase.from('events').select('id').eq('club_id', club_id);
    if (sErr) return dbError(res, sErr);
    const ids = sessions.map((e) => e.id);
    query = ids.length ? query.or(`club_id.eq.${club_id},event_id.in.(${ids.join(',')})`) : query.eq('club_id', club_id);
  } else if (event_id) {
    if (!isUuid(event_id)) return res.status(400).json({ error: 'invalid event_id' });
    if (!(await ownsParent(req.hostId, { event_id }))) return notFound(res, 'Event');
    query = query.eq('event_id', event_id);
  } else {
    return res.status(400).json({ error: 'club_id or event_id query param is required.' });
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/', async (req, res) => {
  const { club_id, event_id } = req.body;
  if (!club_id && !event_id) return res.status(400).json({ error: 'club_id or event_id is required.' });
  if (club_id && event_id) return res.status(400).json({ error: 'match belongs to exactly one of club_id or event_id.' });
  const parent = club_id ? { club_id } : { event_id };
  if (!(await ownsParent(req.hostId, parent))) return res.status(403).json({ error: 'You do not own this club/event.' });
  try {
    res.status(201).json(await createMatch(parent, req.body));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:matchId', async (req, res) => {
  const match = await loadOwnedMatch(req, res);
  if (!match) return;
  try {
    res.json(await updateMatch(match.id, req.body));
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:matchId', async (req, res) => {
  const match = await loadOwnedMatch(req, res);
  if (!match) return;
  const { error } = await supabase.from('matches').delete().eq('id', match.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

module.exports = router;
