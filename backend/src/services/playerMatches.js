// "Hoạt động" of a player: every match they played — club matches, matches inside kèo /
// sessions, tournament pair matches and team-league sub-matches — newest first, with the
// partner, the opponents, the games, the result and where it was played (club / community).
const { supabase } = require('../supabase');
const { localDate, winnerTeam, isScored } = require('./stats');

const gamesOf = (m) => {
  const g = Array.isArray(m.games) ? m.games.filter((x) => Array.isArray(x) && x.length === 2) : [];
  if (g.length) return g.map(([a, b]) => [Number(a), Number(b)]);
  return m.team1_score == null || m.team2_score == null ? [] : [[Number(m.team1_score), Number(m.team2_score)]];
};

async function forUser(uid) {
  const { data: members } = await supabase.from('club_members').select('id, club_id').eq('user_id', uid);
  const memberIds = (members || []).map((m) => m.id);
  const orFilter = [`user_id.eq.${uid}`, memberIds.length ? `source_club_member_id.in.(${memberIds.join(',')})` : null].filter(Boolean).join(',');
  const { data: parts } = await supabase.from('event_participants').select('id').or(orFilter).limit(2000);
  const partIds = (parts || []).map((p) => p.id);
  const mine = new Set([...memberIds, ...partIds]);

  // 1. Club and event matches.
  const rows = [];
  for (const [col, ids] of [['club_member_id', memberIds], ['event_participant_id', partIds]]) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('match_players').select('match_id, team').in(col, ids.slice(i, i + 200));
      rows.push(...(data || []));
    }
  }
  const teamOf = new Map(rows.map((r) => [r.match_id, r.team]));
  const matchIds = [...teamOf.keys()];
  const matches = [];
  for (let i = 0; i < matchIds.length; i += 200) {
    const { data } = await supabase.from('matches').select('id, club_id, event_id, played_at, team1_score, team2_score, games, events(title, event_date, location, club_id)').in('id', matchIds.slice(i, i + 200));
    matches.push(...(data || []));
  }
  const players = [];
  for (let i = 0; i < matchIds.length; i += 200) {
    const { data } = await supabase.from('match_players').select('match_id, team, club_member_id, event_participant_id').in('match_id', matchIds.slice(i, i + 200));
    players.push(...(data || []));
  }

  // 2. Tournaments: pairs (teams) and team-league sub-matches.
  const tour = [];
  if (memberIds.length) {
    const list = memberIds.join(',');
    const { data: teams } = await supabase.from('tournament_teams').select('id, tournament_id, player1_id, player2_id').or(`player1_id.in.(${list}),player2_id.in.(${list})`);
    const teamIds = (teams || []).map((t) => t.id);
    if (teamIds.length) {
      const { data: tms } = await supabase.from('tournament_matches').select('id, tournament_id, team1_id, team2_id, team1_score, team2_score, games, played_at, is_bye').or(`team1_id.in.(${teamIds.join(',')}),team2_id.in.(${teamIds.join(',')})`).limit(1000);
      const allTeamIds = [...new Set((tms || []).flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean))];
      const { data: allTeams } = allTeamIds.length ? await supabase.from('tournament_teams').select('id, player1_id, player2_id').in('id', allTeamIds) : { data: [] };
      const byId = new Map((allTeams || []).map((t) => [t.id, t]));
      for (const m of tms || []) {
        if (m.is_bye || !m.team1_id || !m.team2_id) continue;
        const t1 = byId.get(m.team1_id) || {};
        const t2 = byId.get(m.team2_id) || {};
        tour.push({ kind: 'tournament', id: m.id, tournament_id: m.tournament_id, played_at: m.played_at, m, a: [t1.player1_id, t1.player2_id].filter(Boolean), b: [t2.player1_id, t2.player2_id].filter(Boolean) });
      }
    }
    const { data: subs } = await supabase
      .from('tournament_sub_matches')
      .select('id, fixture_id, team1_p1, team1_p2, team2_p1, team2_p2, team1_score, team2_score, games, played_at')
      .or(['team1_p1', 'team1_p2', 'team2_p1', 'team2_p2'].map((c) => `${c}.in.(${list})`).join(','))
      .limit(1000);
    const fixIds = [...new Set((subs || []).map((s) => s.fixture_id))];
    const { data: fixes } = fixIds.length ? await supabase.from('tournament_matches').select('id, tournament_id, played_at').in('id', fixIds) : { data: [] };
    const fixById = new Map((fixes || []).map((f) => [f.id, f]));
    for (const s of subs || []) {
      const f = fixById.get(s.fixture_id) || {};
      tour.push({ kind: 'sub', id: s.id, tournament_id: f.tournament_id, played_at: s.played_at || f.played_at, m: s, a: [s.team1_p1, s.team1_p2].filter(Boolean), b: [s.team2_p1, s.team2_p2].filter(Boolean) });
    }
  }
  const tourIds = [...new Set(tour.map((x) => x.tournament_id).filter(Boolean))];
  const { data: tours } = tourIds.length ? await supabase.from('tournaments').select('id, name, club_id, event_date, location').in('id', tourIds) : { data: [] };
  const tourById = new Map((tours || []).map((t) => [t.id, t]));

  // Names and clubs.
  const memberSet = new Set([...players.map((p) => p.club_member_id), ...tour.flatMap((x) => [...x.a, ...x.b])].filter(Boolean));
  const partSet = new Set(players.map((p) => p.event_participant_id).filter(Boolean));
  const { data: mem } = memberSet.size ? await supabase.from('club_members').select('id, full_name, user_id').in('id', [...memberSet]) : { data: [] };
  const { data: prt } = partSet.size ? await supabase.from('event_participants').select('id, full_name, user_id').in('id', [...partSet]) : { data: [] };
  const nameOf = new Map([...(mem || []), ...(prt || [])].map((x) => [x.id, { name: x.full_name, me: x.user_id === uid }]));
  const clubIds = new Set([...matches.map((m) => m.club_id || m.events?.club_id), ...(tours || []).map((t) => t.club_id)].filter(Boolean));
  const { data: clubs } = clubIds.size ? await supabase.from('clubs').select('id, name, kind').in('id', [...clubIds]) : { data: [] };
  const clubById = new Map((clubs || []).map((c) => [c.id, c]));
  const person = (id) => ({ name: nameOf.get(id)?.name || '?', me: mine.has(id) || !!nameOf.get(id)?.me });

  const out = [];
  for (const m of matches) {
    if (!isScored(m)) continue;
    const my = teamOf.get(m.id);
    const ps = players.filter((p) => p.match_id === m.id);
    const side = (n) => ps.filter((p) => p.team === n).map((p) => person(p.club_member_id || p.event_participant_id));
    const club = clubById.get(m.club_id || m.events?.club_id) || null;
    out.push({
      kind: 'match',
      id: m.id,
      date: m.events?.event_date || localDate(m.played_at),
      title: m.events?.title || null,
      location: m.events?.location || null,
      club_id: club?.id || null,
      club_name: club?.name || null,
      club_kind: club?.kind || 'club',
      mine: side(my),
      them: side(my === 1 ? 2 : 1),
      games: gamesOf(m).map(([a, b]) => (my === 1 ? [a, b] : [b, a])),
      result: winnerTeam(m) === my ? 'win' : 'loss',
    });
  }
  for (const x of tour) {
    if (!isScored(x.m)) continue;
    const t = tourById.get(x.tournament_id) || {};
    const onA = x.a.some((id) => mine.has(id));
    const my = onA ? 1 : 2;
    const club = clubById.get(t.club_id) || null;
    out.push({
      kind: x.kind,
      id: x.id,
      date: t.event_date || localDate(x.played_at),
      title: t.name || null,
      location: t.location || null,
      club_id: club?.id || null,
      club_name: club?.name || null,
      club_kind: club?.kind || 'club',
      mine: (onA ? x.a : x.b).map(person),
      them: (onA ? x.b : x.a).map(person),
      games: gamesOf(x.m).map(([a, b]) => (my === 1 ? [a, b] : [b, a])),
      result: winnerTeam(x.m) === my ? 'win' : 'loss',
    });
  }
  return out.filter((x) => x.date).sort((p, q) => String(q.date).localeCompare(String(p.date)));
}

// The coach sessions I was marked at (present / absent / excused), newest first.
async function coachHistory(uid) {
  const { data: studs } = await supabase.from('coach_students').select('id, coach_id').eq('user_id', uid);
  const ids = (studs || []).map((s) => s.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('coach_attendance')
    .select('status, late, coach_id, coach_sessions(session_date, start_time, duration_min, coach_classes(title)), coach_profiles(slug, display_name)')
    .in('student_id', ids)
    .order('checked_at', { ascending: false })
    .limit(300);
  if (error) return [];
  return (data || [])
    .filter((a) => a.coach_sessions)
    .map((a) => ({
      date: a.coach_sessions.session_date,
      start_time: a.coach_sessions.start_time,
      title: a.coach_sessions.coach_classes?.title || null,
      coach_id: a.coach_id,
      coach_name: a.coach_profiles?.display_name || null,
      coach_slug: a.coach_profiles?.slug || null,
      status: a.status,
      late: !!a.late,
    }))
    .sort((p, q) => String(q.date).localeCompare(String(p.date)));
}

module.exports = { forUser, coachHistory, gamesOf };
