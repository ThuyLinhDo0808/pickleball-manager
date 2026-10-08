// Club leaderboards (rankings, awards, weeks at No. 1) for a day / month / quarter /
// year / all time — used by the club's manager pages and by its members.
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');
const { guestsReady } = require('./guests');
const { PERIODS, DEFAULT_MIN_MATCHES, localDate, periodBounds, aggregate, awards, weeksAtTop, isScored } = require('./stats');

// Supabase caps a response at 1000 rows, so page through.
async function fetchAll(build) {
  const size = 1000;
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}

function shiftDay(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every scored-or-not match of the club in `bounds` (null = all time): club matches and
// matches inside the club's sessions (players linked back to club members by `personOf`).
// Each carries `day`, its local date.
async function clubMatches(clubId, bounds, personOf) {
  const inRange = (ymd) => !bounds || (ymd >= bounds.from && ymd <= bounds.to);
  // Pad the UTC window by a day each side, then filter exactly on the local date.
  const matches = (
    await fetchAll(() => {
      let q = supabase
        .from('matches')
        .select('id, played_at, team1_score, team2_score, match_players(team, club_member_id)')
        .eq('club_id', clubId)
        .order('id');
      if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
      return q;
    })
  )
    .map((m) => ({ ...m, day: localDate(m.played_at) }))
    .filter((m) => inRange(m.day));
  const linkGuests = await guestsReady();
  const sessionMatches = (
    await fetchAll(() => {
      let q = supabase
        .from('matches')
        .select(`id, played_at, team1_score, team2_score, events!inner(club_id), match_players(team, event_participants(source_club_member_id${linkGuests ? ', guest_member_id' : ''}))`)
        .eq('events.club_id', clubId)
        .order('id');
      if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
      return q;
    })
  )
    .map((m) => ({
      ...m,
      day: localDate(m.played_at),
      match_players: m.match_players.map((p) => ({ team: p.team, club_member_id: personOf(p.event_participants) })),
    }))
    .filter((m) => inRange(m.day));
  return [...matches, ...sessionMatches];
}

async function clubStats(club, query = {}) {
  const period = PERIODS.includes(query.period) ? query.period : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : todayYmd();
  const minMatches = Math.min(Math.max(parseInt(query.min_matches, 10) || DEFAULT_MIN_MATCHES, 1), 50);
  const bounds = periodBounds(period, date);

  // Two leaderboards: the club community (fixed members) and the guests. No group = all.
  const group = ['club', 'guest'].includes(query.group) ? query.group : null;
  const allMembers = await fetchAll(() =>
    supabase.from('club_members').select('id, full_name, gender, member_type').eq('club_id', club.id).order('id')
  );
  const members = allMembers.filter((m) => !group || (group === 'club' ? m.member_type === 'fixed' : m.member_type !== 'fixed'));
  const linkGuests = await guestsReady(); // guests in sessions are linked by guest_member_id
  const personOf = (p) => p?.source_club_member_id || (linkGuests ? p?.guest_member_id : null) || null;

  const matches = await clubMatches(club.id, bounds, personOf);

  const checkIns = await fetchAll(() => {
    let q = supabase
      .from('event_participants')
      .select(`source_club_member_id${linkGuests ? ', guest_member_id' : ''}, event_id, events!inner(club_id, event_date)`)
      .eq('status', 'checked_in')
      .eq('events.club_id', club.id)
      .order('id');
    if (bounds) q = q.gte('events.event_date', bounds.from).lte('events.event_date', bounds.to);
    return q;
  });
  const attendance = {};
  const seen = new Set();
  for (const c of checkIns) {
    const who = personOf(c);
    if (!who) continue;
    const key = `${who}:${c.event_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attendance[who] = (attendance[who] || 0) + 1;
  }

  const rankings = aggregate(matches, members);
  const ids = new Set(members.map((m) => m.id));
  return {
    period,
    date,
    group,
    range: bounds,
    // matches with a score that someone of this leaderboard played
    match_count: matches.filter((m) => isScored(m) && m.match_players.some((p) => ids.has(p.club_member_id))).length,
    rankings,
    awards: awards(rankings, attendance, members, minMatches),
    // Weeks at No. 1 of this leaderboard, since the club's first match.
    weeks_at_top: weeksAtTop(bounds ? await clubMatches(club.id, null, personOf) : matches, members),
  };
}

module.exports = { clubStats, clubMatches, fetchAll };
