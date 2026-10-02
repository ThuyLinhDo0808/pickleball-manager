// Leaderboard across the whole app: every club and every Xé Vé game, one sport at a time.
// A player with an account is one row wherever they played; players without one are
// counted per club (or per game for walk-ins). Only names, clubs and results are shown.
const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const { PERIODS, periodBounds, localDate, isScored, winnerTeam } = require('../services/stats');
const { sportReady, SPORTS } = require('../services/sport');
const { todayYmd } = require('../services/memberships');

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

router.get('/', async (req, res) => {
  const period = PERIODS.includes(req.query.period) ? req.query.period : 'month';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayYmd();
  const bounds = periodBounds(period, date);
  const withSport = await sportReady();
  const sport = withSport && SPORTS.includes(req.query.sport) ? req.query.sport : 'pickleball';
  const club = withSport ? 'clubs(name, sport)' : 'clubs(name)';
  try {
    const matches = (
      await fetchAll(() => {
        let q = supabase
          .from('matches')
          .select(
            `id, played_at, team1_score, team2_score, club_id, event_id, ${club}, events(club_id, title, ${club}), ` +
              'match_players(team, club_members(id, full_name, user_id), event_participants(id, full_name, user_id, source_club_member_id))'
          )
          .not('team1_score', 'is', null)
          .order('id');
        if (bounds) q = q.gte('played_at', `${shiftDay(bounds.from, -1)}T00:00:00Z`).lte('played_at', `${shiftDay(bounds.to, 1)}T23:59:59Z`);
        return q;
      })
    ).filter((m) => isScored(m) && (!bounds || (localDate(m.played_at) >= bounds.from && localDate(m.played_at) <= bounds.to)));

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
        const cm = p.club_members;
        const ep = p.event_participants;
        const userId = cm?.user_id || ep?.user_id || null;
        const key = userId ? `u:${userId}` : cm ? `m:${cm.id}` : ep?.source_club_member_id ? `m:${ep.source_club_member_id}` : `p:${ep?.id}`;
        if (userId) userIds.add(userId);
        if (!rows.has(key)) {
          rows.set(key, { key, user_id: userId, full_name: cm?.full_name || ep?.full_name || '?', clubs: new Set(), xeve: false, matches_played: 0, wins: 0, losses: 0, points_scored: 0, points_lost: 0 });
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
      const { data: profiles } = await supabase.from('player_profiles').select('user_id, full_name').in('user_id', [...userIds]);
      const name = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
      for (const r of rows.values()) if (r.user_id && name.get(r.user_id)) r.full_name = name.get(r.user_id);
    }
    const out = [...rows.values()]
      .map(({ clubs, user_id, ...r }) => ({
        ...r,
        has_account: !!user_id,
        clubs: [...clubs].sort(),
        point_diff: r.points_scored - r.points_lost,
        win_rate: r.matches_played ? Math.round((1000 * r.wins) / r.matches_played) / 10 : 0,
      }))
      .sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate || b.point_diff - a.point_diff || a.full_name.localeCompare(b.full_name, 'vi'))
      .slice(0, 300);
    res.json({ period, date, range: bounds, sport, match_count: count, rankings: out });
  } catch (err) {
    dbError(res, err);
  }
});

module.exports = router;
