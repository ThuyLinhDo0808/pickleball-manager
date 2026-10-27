// Club leaderboards (rankings, awards, weeks at No. 1) for a day / month / quarter /
// year / all time — used by the club's manager pages and by its members.
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');
const { guestsReady } = require('./guests');
const cleanId = (v) => (v ? String(v).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
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

// A club's main session: part of its weekly schedule (made as a series, or a weekly session).
const isMainSession = (ev) => !!ev && (ev.kind === 'weekly' || !!ev.series_id);

function shiftDay(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every scored-or-not match of the club in `bounds` (null = all time): club matches and
// matches inside the club's sessions (players linked back to club members by `personOf`).
// Each carries `day`, its local date.
// mainOnly (clubs): only the club's main sessions — its weekly schedule. Kèo the club opens
// on other days count as xé vé, not for the club's internal ranking.
async function clubMatches(clubId, bounds, personOf, { mainOnly = false } = {}) {
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
        .select(`id, played_at, team1_score, team2_score, events!inner(club_id, kind, series_id), match_players(team, event_participants(id, full_name, gender, dupr_id, source_club_member_id${linkGuests ? ', guest_member_id' : ''}))`)
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
    .filter((m) => inRange(m.day) && (!mainOnly || isMainSession(m.events)));
  return [...matches, ...sessionMatches];
}

async function clubStats(club, query = {}) {
  const period = PERIODS.includes(query.period) ? query.period : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : todayYmd();
  // The Host's minimum (Thống kê → Bảng xếp hạng); ?min_matches= overrides for one view.
  const { data: cfg } = await supabase.from('clubs').select('*').eq('id', club.id).maybeSingle();
  const minMatches = Math.min(Math.max(parseInt(query.min_matches, 10) || cfg?.rank_min_matches || DEFAULT_MIN_MATCHES, 1), 50);
  const mainOnly = (cfg?.kind || 'club') !== 'community';
  const bounds = periodBounds(period, date);

  // Two leaderboards: the club community (fixed members) and the guests. No group = all.
  const group = ['club', 'guest'].includes(query.group) ? query.group : null;
  const allMembers = (await fetchAll(() =>
    supabase.from('club_members').select('id, full_name, gender, member_type, dupr_level, dupr_id, user_id').eq('club_id', club.id).order('id')
  )).map((m) => ({ ...m, kind: 'member' }));
  const linkGuests = await guestsReady(); // guests in sessions are linked by guest_member_id
  // People in a match who are not on the member list (quick sign-ups, names the Host typed
  // in): they play on the board too, as "Khách". One person across sessions = one DUPR ID
  // (else the same name); a DUPR ID that belongs to a member counts for that member.
  const memberByDupr = new Map(allMembers.filter((m) => m.dupr_id).map((m) => [cleanId(m.dupr_id), m.id]));
  const guests = new Map(); // key -> { id, full_name, gender, kind: 'guest' }
  const personOf = (p) => {
    if (!p) return null;
    const linked = p.source_club_member_id || (linkGuests ? p.guest_member_id : null);
    if (linked) return linked;
    const dupr = cleanId(p.dupr_id);
    if (dupr && memberByDupr.has(dupr)) return memberByDupr.get(dupr);
    const key = dupr ? `dupr:${dupr}` : p.full_name ? `name:${String(p.full_name).trim().toLowerCase().replace(/\s+/g, ' ')}` : p.id ? `p:${p.id}` : null;
    if (!key) return null;
    if (!guests.has(key)) guests.set(key, { id: key, full_name: String(p.full_name || '').trim() || '—', gender: p.gender || null, member_type: 'guest', kind: 'guest', dupr_id: dupr || null });
    return key;
  };

  const matches = await clubMatches(club.id, bounds, personOf, { mainOnly });
  // Everyone with a place to play for: members, then the guests found in the matches.
  const everyone = [...allMembers, ...guests.values()];
  const members = everyone.filter((m) => !group || (group === 'club' ? m.member_type === 'fixed' : m.member_type !== 'fixed'));

  const checkIns = await fetchAll(() => {
    let q = supabase
      .from('event_participants')
      .select(`id, full_name, gender, dupr_id, source_club_member_id${linkGuests ? ', guest_member_id' : ''}, event_id, events!inner(club_id, event_date)`)
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

  // Ranked by win rate (wins / matches) among players with enough matches; then more
  // matches, then point difference. The rest are listed after, without a place.
  const levelOf = new Map(members.map((m) => [m.id, m.dupr_level == null ? null : Number(m.dupr_level)]));
  const rankings = rankByWinRate(aggregate(matches, members).map((r) => ({ ...r, level: levelOf.get(r.club_member_id) ?? null })), minMatches);
  const ids = new Set(members.map((m) => m.id));
  const weeks = weeksAtTop(bounds ? await clubMatches(club.id, null, personOf, { mainOnly }) : matches, members, minMatches);
  // The players' own photos (latest version) on the rows.
  const userOf = new Map(allMembers.map((m) => [m.id, m.user_id || null]));
  const photoV = await require('./playerAvatars').versions([...userOf.values()]).catch(() => new Map());
  const withPhoto = (r) => {
    const uid = userOf.get(r.club_member_id);
    return uid && photoV.has(uid) ? { ...r, avatar_uid: uid, avatar_v: photoV.get(uid) } : r;
  };
  // Community: the Host's ranking tabs (Bảng điều khiển → Bảng xếp hạng); each row says which.
  const community = (cfg?.kind || 'club') === 'community';
  let rankGroups = [];
  let groupOf = () => null;
  if (community) {
    const CS = require('./communitySettings');
    const settings = CS.resolve(cfg?.community_settings);
    rankGroups = CS.rankGroups(settings);
    if (rankGroups.length) {
      // Level fields arrive with later migrations: without them nobody has a level yet.
      const pick = (cols) => supabase.from('club_members').select(cols).eq('club_id', club.id).then((r) => (r.error ? null : r.data), () => null);
      const extra = (await pick('id, level_key, skill_score, play_duration, gender, dupr_doubles')) || (await pick('id, level_key, skill_score, play_duration, gender'));
      const byId = new Map((extra || allMembers).map((m) => [m.id, m]));
      // DUPR bands: the verified DUPR (club list / DUPR app) first, else the level on the row.
      groupOf = (r) => {
        const m = byId.get(r.club_member_id) || {};
        return CS.rankGroupOf(m, m.dupr_doubles ?? r.level, settings);
      };
    }
  }
  return {
    period,
    date,
    group,
    community,
    rank_groups: rankGroups,
    range: bounds,
    // matches with a score that someone of this leaderboard played
    match_count: matches.filter((m) => isScored(m) && m.match_players.some((p) => ids.has(p.club_member_id))).length,
    rankings: rankings.map((r) => ({ ...withPhoto(r), rank_group: groupOf(r) })),
    awards: awards(rankings, attendance, members, minMatches),
    // Weeks at No. 1 of this leaderboard, since the club's first match.
    weeks_at_top: weeks.map(withPhoto),
    min_matches: minMatches,
    main_only: mainOnly,
  };
}

function rankByWinRate(rows, minMatches) {
  const order = (a, b) => b.win_rate - a.win_rate || b.matches_played - a.matches_played || b.point_diff - a.point_diff || a.full_name.localeCompare(b.full_name, 'vi');
  const ranked = rows.filter((r) => r.matches_played >= minMatches).sort(order).map((r, i) => ({ ...r, rank: i + 1, eligible: true }));
  const rest = rows.filter((r) => r.matches_played < minMatches).sort(order).map((r) => ({ ...r, rank: null, eligible: false }));
  return [...ranked, ...rest];
}

module.exports = { clubStats, clubMatches, fetchAll, rankByWinRate };
