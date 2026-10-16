// Leaderboard across the whole app: every club and every Xé Vé game, one sport at a time.
// A player with an account is one row wherever they played; players without one are
// counted per club (or per game for walk-ins). Only names, clubs and results are shown.
const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const { PERIODS, periodBounds, localDate, isScored, winnerTeam } = require('../services/stats');
const { sportReady, SPORTS } = require('../services/sport');
const { todayYmd } = require('../services/memberships');
const { rankByWinRate } = require('../services/clubStats');
const { DEFAULT_MIN_MATCHES } = require('../services/stats');
const { guestsReady } = require('../services/guests');

const router = express.Router();

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

const shiftDay = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// scope=xeve: the xé vé ranking — Xé Vé games, every kèo of a community, and kèo a club opens
// outside its weekly schedule. A club's main sessions (weekly schedule) and its own internal
// matches stay in that club's ranking only.
const isMain = (ev) => !!ev && (ev.kind === 'weekly' || !!ev.series_id);
function isXeve(m) {
  if (m.event_id) {
    const c = m.events?.clubs;
    if (!m.events?.club_id || !c) return true;
    if ((c.kind || 'club') === 'community') return true;
    return !isMain(m.events);
  }
  return (m.clubs?.kind || 'club') === 'community';
}

router.get('/', async (req, res) => {
  const xeve = req.query.scope === 'xeve';
  const minMatches = Math.min(Math.max(parseInt(req.query.min_matches, 10) || DEFAULT_MIN_MATCHES, 1), 50);
  const period = PERIODS.includes(req.query.period) ? req.query.period : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayYmd();
  const bounds = periodBounds(period, date);
  const withSport = await sportReady();
  const sport = withSport && SPORTS.includes(req.query.sport) ? req.query.sport : 'pickleball';
  const club = withSport ? `clubs(name, sport${xeve ? ', kind' : ''})` : `clubs(name${xeve ? ', kind' : ''})`;
  try {
    const linkGuests = await guestsReady(); // community guests are linked by guest_member_id
    const matches = (
      await fetchAll(() => {
        let q = supabase
          .from('matches')
          .select(
            `id, played_at, team1_score, team2_score, club_id, event_id, ${club}, events(club_id, title${xeve ? ', kind, series_id' : ''}, ${club}), ` +
              'match_players(team, club_members(id, full_name, user_id, dupr_level), event_participants(id, full_name, user_id, source_club_member_id' + (linkGuests ? ', guest_member_id' : '') + '))'
          )
          .not('team1_score', 'is', null)
          .order('id');
        if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
        return q;
      })
    ).filter((m) => isScored(m) && (!xeve || isXeve(m)) && (!bounds || (localDate(m.played_at) >= bounds.from && localDate(m.played_at) <= bounds.to)));

    // Players met through a session: their club row tells who they are (account, name, level).
    const rowOf = (ep) => ep?.source_club_member_id || ep?.guest_member_id || null;
    const viaSession = [...new Set(matches.flatMap((m) => (m.match_players || []).map((p) => !p.club_members && rowOf(p.event_participants)).filter(Boolean)))];
    const memberById = new Map();
    for (let i = 0; i < viaSession.length; i += 500) {
      const { data: ms } = await supabase.from('club_members').select('id, full_name, user_id, dupr_level').in('id', viaSession.slice(i, i + 500));
      for (const x of ms || []) memberById.set(x.id, x);
    }

    const rows = new Map();
    const userIds = new Set();
    let count = 0;
    for (const m of matches) {
      const clubInfo = m.clubs || m.events?.clubs || null;
      if ((clubInfo?.sport || 'pickleball') !== sport) continue;
      count++;
      const where = clubInfo?.name || null; // null = a Xé Vé game
      const winner = winnerTeam(m);
      for (const p of m.match_players || []) {
        const ep = p.event_participants;
        const cm = p.club_members || (rowOf(ep) ? memberById.get(rowOf(ep)) : null) || null;
        const userId = cm?.user_id || ep?.user_id || null;
        const key = userId ? `u:${userId}` : cm ? `m:${cm.id}` : rowOf(ep) ? `m:${rowOf(ep)}` : `p:${ep?.id}`;
        if (userId) userIds.add(userId);
        if (!rows.has(key)) {
          rows.set(key, { key, user_id: userId, member_id: cm?.id || rowOf(ep), level: cm?.dupr_level ?? null, full_name: cm?.full_name || ep?.full_name || '?', clubs: new Set(), xeve: false, matches_played: 0, wins: 0, losses: 0, points_scored: 0, points_lost: 0 });
        }
        const r = rows.get(key);
        if (where) r.clubs.add(where);
        else r.xeve = true;
        r.matches_played++;
        if (winner === p.team) r.wins++;
        else if (winner !== 0) r.losses++;
        r.points_scored += p.team === 1 ? m.team1_score : m.team2_score;
        r.points_lost += p.team === 1 ? m.team2_score : m.team1_score;
      }
    }
    // Account holders go by the name on their own profile.
    if (userIds.size) {
      const { data: profiles } = await supabase.from('player_profiles').select('user_id, full_name, dupr_level').in('user_id', [...userIds]);
      const prof = new Map((profiles || []).map((p) => [p.user_id, p]));
      for (const r of rows.values()) {
        const p = r.user_id && prof.get(r.user_id);
        if (!p) continue;
        if (p.full_name) r.full_name = p.full_name;
        if (p.dupr_level != null) r.level = p.dupr_level; // the player's own level counts everywhere
      }
    }
    let out = [...rows.values()]
      .map(({ clubs, user_id, member_id, ...r }) => ({
        ...r,
        level: r.level == null ? null : Number(r.level),
        me: !!user_id && user_id === req.hostId,
        has_account: !!user_id,
        clubs: [...clubs].sort(),
        point_diff: r.points_scored - r.points_lost,
        win_rate: r.matches_played ? Math.round((1000 * r.wins) / r.matches_played) / 10 : 0,
      }))
      .sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate || b.point_diff - a.point_diff || a.full_name.localeCompare(b.full_name, 'vi'))
      .slice(0, xeve ? Infinity : 300);
    if (xeve) {
      // Ranked like a community: win rate, at least `min_matches` to get a place. Keep my row.
      out = rankByWinRate(out, minMatches);
      out = out.filter((r, i) => i < 300 || r.me);
    }
    res.json({ period, date, range: bounds, sport, scope: xeve ? 'xeve' : 'all', min_matches: xeve ? minMatches : undefined, match_count: count, rankings: out });
  } catch (err) {
    dbError(res, err);
  }
});

module.exports = router;
