const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { todayYmd } = require('../services/memberships');
const { localDate, winnerTeam, isScored } = require('../services/stats');
const { clubAccess } = require('../services/clubAccess');

const router = express.Router();

// Time-of-day buckets for the no-show heatmap (start time of the session).
const SLOTS = [
  { key: '05-08', from: 5, to: 8 },
  { key: '08-11', from: 8, to: 11 },
  { key: '11-14', from: 11, to: 14 },
  { key: '14-17', from: 14, to: 17 },
  { key: '17-19', from: 17, to: 19 },
  { key: '19-21', from: 19, to: 21 },
  { key: '21-24', from: 21, to: 24 },
];

function lastMonths(n) {
  const [y, m] = todayYmd().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

// The months of a calendar year (?year=2026): January to December, or to this month
// for the year in progress.
function yearMonths(year) {
  const [cy, cm] = todayYmd().split('-').map(Number);
  const last = year < cy ? 12 : year === cy ? cm : 1;
  return Array.from({ length: last }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}
// '2026-02' -> '2026-03-01' (end bound, exclusive).
function nextMonthStart(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
const cleanYear = (v) => {
  const y = parseInt(v, 10);
  return y >= 2000 && y <= 2100 ? y : null;
};

// Scope = a club I own or co-admin (?club_id=), or my standalone Xé Vé events (?scope=standalone).
// hostId is whose data it is: the club's owner (also for a co-admin), or me.
async function resolveScope(req) {
  if (req.query.scope === 'standalone') return { clubId: null, hostId: req.hostId };
  const access = await clubAccess(req, req.query.club_id);
  return access ? { clubId: access.club.id, hostId: access.club.host_id } : null;
}

async function scopeEvents(hostId, clubId, fields) {
  let q = supabase.from('events').select(fields).eq('host_id', hostId);
  q = clubId ? q.eq('club_id', clubId) : q.is('club_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Income / expense / net per month (club fund + the scope's events), voided entries excluded.
router.get('/finance', async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (!scope) return notFound(res, 'Club');
    const year = cleanYear(req.query.year);
    const months = year ? yearMonths(year) : lastMonths(Math.min(Math.max(parseInt(req.query.months, 10) || 12, 3), 36));
    const from = `${months[0]}-01`;
    const events = await scopeEvents(scope.hostId, scope.clubId, 'id');
    const filters = [];
    if (scope.clubId) filters.push(`and(owner_type.eq.club,club_id.eq.${scope.clubId})`);
    if (events.length) filters.push(`and(owner_type.eq.event,event_id.in.(${events.map((e) => e.id).join(',')}))`);
    let txns = [];
    if (filters.length) {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, category, amount, occurred_on, owner_type')
        .eq('host_id', scope.hostId)
        .eq('is_voided', false)
        .gte('occurred_on', from)
        .lt('occurred_on', nextMonthStart(months[months.length - 1]))
        .or(filters.join(','));
      if (error) throw error;
      txns = data;
    }
    const byMonth = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
    const byCategory = new Map();
    const byMonthCategory = new Map(months.map((m) => [m, new Map()])); // most clubs collect / spend month by month
    for (const t of txns) {
      const ym = t.occurred_on.slice(0, 7);
      const row = byMonth.get(ym);
      if (!row) continue;
      row[t.type] += Number(t.amount);
      const key = `${t.type}:${t.category || 'other'}`;
      byCategory.set(key, (byCategory.get(key) || 0) + Number(t.amount));
      const mc = byMonthCategory.get(ym);
      mc.set(key, (mc.get(key) || 0) + Number(t.amount));
    }
    const asList = (m) => [...m].map(([k, amount]) => ({ type: k.split(':')[0], category: k.split(':')[1], amount })).sort((a, b) => b.amount - a.amount);
    const rows = [...byMonth.values()].map((r) => ({ ...r, net: r.income - r.expense }));
    res.json({
      months: rows,
      totals: rows.reduce((a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense, net: a.net + r.net }), { income: 0, expense: 0, net: 0 }),
      categories: asList(byCategory),
      month_categories: Object.fromEntries([...byMonthCategory].map(([m, c]) => [m, asList(c)])),
    });
  } catch (err) {
    dbError(res, err);
  }
});

// Profit / loss per event (sessions of a club, or standalone Xé Vé events), newest first.
router.get('/events-pnl', async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (!scope) return notFound(res, 'Club');
    const year = cleanYear(req.query.year);
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 36);
    const [y, m] = todayYmd().split('-').map(Number);
    const since = year ? `${year}-01-01` : new Date(Date.UTC(y, m - 1 - months, 1)).toISOString().slice(0, 10);
    const until = year ? `${year}-12-31` : '9999-12-31';
    const events = (await scopeEvents(scope.hostId, scope.clubId, 'id, title, event_date, start_time, status')).filter((e) => e.event_date >= since && e.event_date <= until);
    if (!events.length) return res.json([]);
    const ids = events.map((e) => e.id);
    const [{ data: fin, error: fErr }, { data: parts, error: pErr }] = await Promise.all([
      supabase.from('v_event_finance').select('*').in('event_id', ids),
      supabase.from('event_participants').select('event_id, status').in('event_id', ids).in('status', ['registered', 'checked_in']),
    ]);
    if (fErr) throw fErr;
    if (pErr) throw pErr;
    const byEvent = new Map(fin.map((f) => [f.event_id, f]));
    res.json(
      events
        .map((e) => {
          const f = byEvent.get(e.id) || {};
          return {
            event_id: e.id,
            title: e.title,
            event_date: e.event_date,
            status: e.status,
            players: parts.filter((p) => p.event_id === e.id).length,
            income: Number(f.income || 0),
            expense: Number(f.expense || 0),
            net: Number(f.net || 0),
          };
        })
        .filter((e) => e.income || e.expense)
        .sort((a, b) => b.event_date.localeCompare(a.event_date))
    );
  } catch (err) {
    dbError(res, err);
  }
});

// No-show rate by weekday x start-time slot, over past sessions in the last N months.
router.get('/no-shows', async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (!scope) return notFound(res, 'Club');
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
    const today = todayYmd();
    const [y, m, d] = today.split('-').map(Number);
    const since = new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
    const events = (await scopeEvents(scope.hostId, scope.clubId, 'id, event_date, start_time')).filter(
      (e) => e.event_date >= since && e.event_date < today && e.start_time
    );
    const cells = new Map();
    for (let wd = 0; wd < 7; wd++) for (const s of SLOTS) cells.set(`${wd}|${s.key}`, { weekday: wd, slot: s.key, events: 0, total: 0, no_show: 0 });
    const slotOf = (time) => SLOTS.find((s) => Number(time.slice(0, 2)) >= s.from && Number(time.slice(0, 2)) < s.to)?.key || null;
    const eventCell = new Map();
    for (const e of events) {
      const slot = slotOf(e.start_time);
      if (!slot) continue;
      const wd = (new Date(`${e.event_date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      const cell = cells.get(`${wd}|${slot}`);
      cell.events++;
      eventCell.set(e.id, cell);
    }
    if (eventCell.size) {
      const { data: parts, error } = await supabase
        .from('event_participants')
        .select('event_id, status')
        .in('event_id', [...eventCell.keys()])
        .in('status', ['checked_in', 'no_show']);
      if (error) throw error;
      for (const p of parts) {
        const cell = eventCell.get(p.event_id);
        cell.total++;
        if (p.status === 'no_show') cell.no_show++;
      }
    }
    const out = [...cells.values()].map((c) => ({ ...c, rate: c.total ? Math.round((1000 * c.no_show) / c.total) / 10 : null }));
    const all = out.reduce((a, c) => ({ total: a.total + c.total, no_show: a.no_show + c.no_show }), { total: 0, no_show: 0 });
    res.json({
      slots: SLOTS.map((s) => s.key),
      cells: out,
      overall_rate: all.total ? Math.round((1000 * all.no_show) / all.total) / 10 : null,
      sessions: events.length,
    });
  } catch (err) {
    dbError(res, err);
  }
});

// One member's form per month: club matches + matches inside the club's sessions.
router.get('/player-form', async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (!scope?.clubId) return notFound(res, 'Club');
    if (!isUuid(req.query.member_id)) return notFound(res, 'Member');
    const { data: member } = await supabase.from('club_members').select('id').eq('id', req.query.member_id).eq('club_id', scope.clubId).maybeSingle();
    if (!member) return notFound(res, 'Member');

    const { data: direct, error: e1 } = await supabase.from('match_players').select('team, matches(played_at, team1_score, team2_score)').eq('club_member_id', member.id);
    if (e1) throw e1;
    const { data: parts, error: e2 } = await supabase.from('event_participants').select('id').eq('source_club_member_id', member.id);
    if (e2) throw e2;
    let viaEvents = [];
    if (parts.length) {
      const { data, error } = await supabase.from('match_players').select('team, matches(played_at, team1_score, team2_score)').in('event_participant_id', parts.map((p) => p.id));
      if (error) throw error;
      viaEvents = data;
    }
    const months = new Map();
    for (const row of [...direct, ...viaEvents]) {
      const mt = row.matches;
      if (!isScored(mt)) continue;
      const key = localDate(mt.played_at).slice(0, 7);
      const s = months.get(key) || { month: key, matches: 0, wins: 0, points_for: 0, points_against: 0 };
      s.matches++;
      if (winnerTeam(mt) === row.team) s.wins++;
      s.points_for += row.team === 1 ? mt.team1_score : mt.team2_score;
      s.points_against += row.team === 1 ? mt.team2_score : mt.team1_score;
      months.set(key, s);
    }
    res.json(
      [...months.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((s) => ({ ...s, win_rate: Math.round((1000 * s.wins) / s.matches) / 10, diff: s.points_for - s.points_against }))
    );
  } catch (err) {
    dbError(res, err);
  }
});

module.exports = router;
