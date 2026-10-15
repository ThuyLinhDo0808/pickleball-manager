// Cuộc đua Top tháng (Social Manager communities). Every active member (regular, drop-in,
// VIP…) scores points in the community's kèo of the month:
//   +1 per kèo checked in · +2 per match won · −2 per no-show (absent without notice).
// To win, a member needs at least the Host's minimum of kèo in the month (race_min_sessions,
// default MIN_SESSIONS) and must have been a member since the 15th. Ties: more kèo, then more wins. With level groups on,
// each group (by level) has its own top 3.
// When the month is over the app closes it (race_results) and gives the top 3 a
// voucher (Host's choice: free kèo / 50% off) that is taken off the fee at sign-up.
const { supabase } = require('../supabase');
const { winnerTeam, APP_TZ } = require('./stats');
const { clubSport } = require('./sport');

const MIGRATION = '20261117090000_community_race.sql';
const MIN_SESSIONS = 4;
const JOIN_BY_DAY = 15;
const POINTS = { checkin: 1, win: 2, no_show: -2 };
const KINDS = ['free', 'half', 'none'];
const DEFAULT_REWARDS = { 1: 'free', 2: 'half', 3: 'half' };
// Level groups: DUPR for pickleball, steps 1–6 for badminton (no level = lowest group).
const GROUPS = {
  pickleball: [
    { key: 'low', max: 2.99 },
    { key: 'mid', max: 3.5 },
    { key: 'high', max: Infinity },
  ],
  badminton: [
    { key: 'low', max: 2 },
    { key: 'mid', max: 4 },
    { key: 'high', max: Infinity },
  ],
};

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

const localYmd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(d);
const thisMonth = () => localYmd().slice(0, 7);
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
// Fixed member since the 15th (end of that day, app time ≈ UTC+7).
const joinDeadline = (month) => new Date(`${month}-${String(JOIN_BY_DAY).padStart(2, '0')}T23:59:59+07:00`);

async function ready() {
  const { error } = await supabase.from('race_vouchers').select('id').limit(1);
  return !error;
}

function cleanRewards(raw) {
  const out = {};
  for (const r of ['1', '2', '3']) out[r] = KINDS.includes(raw?.[r]) ? raw[r] : DEFAULT_REWARDS[r];
  return out;
}

function settingsOf(club) {
  return {
    enabled: !!club.race_enabled,
    started_on: club.race_started_on || null,
    split_levels: !!club.race_split_levels,
    rewards: cleanRewards(club.race_rewards),
    voucher_days: club.race_voucher_days || 30,
    min_sessions: club.race_min_sessions || MIN_SESSIONS,
    join_by_day: JOIN_BY_DAY,
    points: POINTS,
  };
}

function groupOf(level, sport) {
  const list = GROUPS[sport] || GROUPS.pickleball;
  const n = level == null || level === '' ? null : Number(level);
  if (n == null || Number.isNaN(n)) return list[0].key;
  return list.find((g) => n <= g.max).key;
}

// The month's table: every active fixed member with their points, and who can win.
// In the community since: the earlier of joining and the date the Host set as "since" (fixed_since).
const sinceOf = (m) => [m.fixed_since, m.created_at].filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;

async function standings(club, month) {
  const sport = await clubSport(club.id);
  const from = `${month}-01`;
  const to = monthEnd(month);
  const [{ data: members, error: mErr }, { data: events, error: eErr }] = await Promise.all([
    supabase.from('club_members').select('id, full_name, user_id, dupr_level, member_type, is_active, fixed_since, created_at').eq('club_id', club.id).eq('is_active', true).limit(5000),
    supabase.from('events').select('id').eq('club_id', club.id).gte('event_date', from).lte('event_date', to).neq('status', 'cancelled').neq('kind', 'meeting').limit(2000),
  ]);
  if (mErr) throw mErr;
  if (eErr) throw eErr;
  const rows = new Map(
    (members || []).map((m) => [m.id, { club_member_id: m.id, full_name: m.full_name, user_id: m.user_id, level: m.dupr_level, sessions: 0, wins: 0, no_shows: 0, points: 0, member_since: sinceOf(m) }])
  );
  const eventIds = (events || []).map((e) => e.id);
  const byUser = new Map((members || []).filter((m) => m.user_id).map((m) => [m.user_id, m.id]));
  const partMember = new Map(); // participant id -> member id
  for (let i = 0; i < eventIds.length; i += 150) {
    const ids = eventIds.slice(i, i + 150);
    const { data: parts, error } = await supabase
      .from('event_participants')
      .select('id, status, user_id, source_club_member_id, guest_member_id')
      .in('event_id', ids)
      .in('status', ['checked_in', 'no_show'])
      .limit(20000);
    if (error) throw error;
    for (const p of parts || []) {
      const mid = [p.source_club_member_id, p.guest_member_id, p.user_id && byUser.get(p.user_id)].find((x) => x && rows.has(x));
      if (!mid) continue;
      partMember.set(p.id, mid);
      const r = rows.get(mid);
      if (p.status === 'checked_in') r.sessions += 1;
      else r.no_shows += 1;
    }
    const { data: matches, error: mtErr } = await supabase
      .from('matches')
      .select('team1_score, team2_score, match_players(team, event_participant_id, club_member_id)')
      .in('event_id', ids)
      .limit(20000);
    if (mtErr) throw mtErr;
    for (const mt of matches || []) {
      const w = winnerTeam(mt);
      if (!w) continue;
      for (const mp of mt.match_players || []) {
        if (mp.team !== w) continue;
        const mid = (mp.event_participant_id && partMember.get(mp.event_participant_id)) || (mp.club_member_id && rows.has(mp.club_member_id) ? mp.club_member_id : null);
        if (mid) rows.get(mid).wins += 1;
      }
    }
  }
  const deadline = joinDeadline(month);
  const list = [...rows.values()].map((r) => {
    const points = r.sessions * POINTS.checkin + r.wins * POINTS.win + r.no_shows * POINTS.no_show;
    const joinedInTime = !!r.member_since && new Date(r.member_since) <= deadline;
    return { ...r, points, group: club.race_split_levels ? groupOf(r.level, sport) : null, eligible: r.sessions >= (club.race_min_sessions || MIN_SESSIONS) && joinedInTime, joined_in_time: joinedInTime };
  });
  const order = (a, b) => b.points - a.points || b.sessions - a.sessions || b.wins - a.wins || String(a.full_name).localeCompare(String(b.full_name), 'vi');
  const keys = club.race_split_levels ? (GROUPS[sport] || GROUPS.pickleball).map((g) => g.key) : [null];
  const groups = keys.map((key) => {
    const people = list.filter((r) => r.group === key).sort(order);
    let place = 0;
    for (const r of people) r.prize_rank = r.eligible && place < 3 ? ++place : null;
    return { key, rows: people.filter((r) => r.sessions || r.no_shows || r.wins) };
  });
  return { month, sport, groups };
}

// ---- closing a month: final table + vouchers ---------------------------------------

async function closeMonth(club, month) {
  const table = await standings(club, month);
  const { error: claimErr } = await supabase.from('race_results').insert({ club_id: club.id, month, standings: table });
  if (claimErr) {
    if (claimErr.code === '23505') return { closed: false }; // someone else closed it
    throw claimErr;
  }
  const rewards = cleanRewards(club.race_rewards);
  const expires = new Date(Date.now() + (club.race_voucher_days || 30) * 86400000);
  const vouchers = [];
  for (const g of table.groups) {
    for (const r of g.rows) {
      if (!r.prize_rank || rewards[r.prize_rank] === 'none') continue;
      vouchers.push({
        club_id: club.id,
        club_member_id: r.club_member_id,
        user_id: r.user_id || null,
        full_name: r.full_name,
        month,
        level_group: g.key,
        rank: r.prize_rank,
        kind: rewards[r.prize_rank],
        expires_on: localYmd(expires),
      });
    }
  }
  if (vouchers.length) {
    const { error } = await supabase.from('race_vouchers').insert(vouchers);
    if (error) throw error;
    for (const v of vouchers) emailWinner(club, v).catch(() => {});
  }
  return { closed: true, vouchers: vouchers.length };
}

// Every community with the race on: close last month (and any month missed while the
// server slept), from the month the race was turned on.
async function closeDueMonths(now = new Date()) {
  if (!(await ready())) return 0;
  const current = localYmd(now).slice(0, 7);
  const { data: clubs, error } = await supabase.from('clubs').select('*').eq('race_enabled', true).limit(5000);
  if (error) throw error;
  let n = 0;
  for (const club of clubs || []) {
    const start = (club.race_started_on || `${current}-01`).slice(0, 7);
    const { data: done } = await supabase.from('race_results').select('month').eq('club_id', club.id);
    const closed = new Set((done || []).map((d) => d.month));
    for (let m = start, i = 0; m < current && i < 24; m = shiftMonth(m, 1), i++) {
      if (closed.has(m)) continue;
      const r = await closeMonth(club, m);
      if (r.closed) n++;
    }
  }
  return n;
}

function startRaceSweeper(everyMs = 60 * 60 * 1000) {
  const run = () => closeDueMonths().catch((err) => console.error('race sweep failed', err));
  setTimeout(run, 45 * 1000).unref();
  setInterval(run, everyMs).unref();
}

async function emailWinner(club, v) {
  const { emailSender, emailPlayer } = require('./notify');
  if (!v.user_id) return;
  const sender = await emailSender({ host_id: club.host_id, club_id: club.id });
  if (!sender) return;
  const what = v.kind === 'free' ? '1 kèo miễn phí' : 'giảm 50% một kèo';
  const [y, m] = v.month.split('-');
  const exp = v.expires_on.split('-').reverse().join('/');
  const text = `🏆 Chúc mừng ${v.full_name}! Bạn đứng Top ${v.rank} tháng ${Number(m)}/${y} của ${club.name}. Quà của bạn: ${what}, dùng trước ${exp}. Voucher tự áp dụng khi bạn đăng ký kèo của ${club.name}.`;
  await emailPlayer([v.user_id], {
    subject: `🏆 Top ${v.rank} tháng ${Number(m)}/${y} — quà của bạn: ${what}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><h2 style="color:#65a30d">🏆 Chúc mừng ${escapeHtml(v.full_name)}!</h2><p>Bạn đứng <b>Top ${v.rank}</b> tháng ${Number(m)}/${y} của <b>${escapeHtml(club.name)}</b>.</p><p>Quà của bạn: <b>${what}</b>, dùng trước <b>${exp}</b>. Voucher tự áp dụng khi bạn đăng ký kèo của cộng đồng.</p></div>`,
  }, sender);
}
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- vouchers ---------------------------------------------------------------------

// Free again when the sign-up that used it was cancelled in time (not a late cancel).
function voucherState(v, participant, today = localYmd()) {
  if (v.revoked_at) return 'revoked';
  if (v.used_at && !(participant && participant.status === 'cancelled' && !participant.late_cancel)) return 'used';
  if (v.expires_on < today) return 'expired';
  return 'available';
}

async function withParticipants(vouchers) {
  const ids = [...new Set(vouchers.map((v) => v.participant_id).filter(Boolean))];
  const { data } = ids.length ? await supabase.from('event_participants').select('id, status, late_cancel, event_id, events(title, event_date)').in('id', ids) : { data: [] };
  const byId = new Map((data || []).map((p) => [p.id, p]));
  return vouchers.map((v) => {
    const p = v.participant_id ? byId.get(v.participant_id) || null : null;
    return { ...v, state: voucherState(v, p), used_for: p && p.events ? { title: p.events.title, event_date: p.events.event_date } : null, _participant: p };
  });
}

// The player's vouchers (all communities, or one), newest first.
async function vouchersOf(userId, clubId = null) {
  if (!(await ready())) return [];
  const { data: mine } = await supabase.from('club_members').select('id, club_id').eq('user_id', userId);
  const memberIds = (mine || []).filter((m) => !clubId || m.club_id === clubId).map((m) => m.id);
  const filters = [`user_id.eq.${userId}`, ...(memberIds.length ? [`club_member_id.in.(${memberIds.join(',')})`] : [])];
  let q = supabase.from('race_vouchers').select('*, clubs(name)').or(filters.join(',')).order('created_at', { ascending: false }).limit(50);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  return (await withParticipants(data || [])).map(({ _participant, clubs, ...v }) => ({ ...v, club_name: clubs?.name || null }));
}

// The best voucher the player can use for this kèo (free before half, soonest expiry).
async function usableVoucher(event, userId) {
  if (!event.club_id || !userId) return null;
  const list = (await vouchersOf(userId, event.club_id).catch(() => [])).filter((v) => v.state === 'available');
  list.sort((a, b) => (a.kind === b.kind ? a.expires_on.localeCompare(b.expires_on) : a.kind === 'free' ? -1 : 1));
  return list[0] || null;
}

const discountFor = (kind, fee) => (kind === 'free' ? fee : Math.round(fee / 2));

// Take the voucher for a new sign-up. Returns { voucher, fee, discount } or null; the
// caller links it to the participant with attachVoucher (or gives it back on failure).
async function claimVoucher(event, userId, fee) {
  if (!(fee > 0)) return null;
  const v = await usableVoucher(event, userId);
  if (!v) return null;
  let q = supabase.from('race_vouchers').update({ used_at: new Date().toISOString(), participant_id: null }).eq('id', v.id);
  q = v.participant_id ? q.eq('participant_id', v.participant_id) : q.is('used_at', null);
  const { data } = await q.select('id').maybeSingle();
  if (!data) return null; // used meanwhile
  const discount = discountFor(v.kind, fee);
  return { voucher: v, fee: fee - discount, discount };
}

async function attachVoucher(voucherId, participantId) {
  await supabase.from('race_vouchers').update({ participant_id: participantId }).eq('id', voucherId);
}
async function releaseVoucher(voucherId) {
  await supabase.from('race_vouchers').update({ used_at: null, participant_id: null }).eq('id', voucherId);
}

// ---- Host ---------------------------------------------------------------------------

async function hostView(club, month) {
  const settings = settingsOf(club);
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : thisMonth();
  const [{ data: result }, { data: vouchers }, { data: closedMonths }] = await Promise.all([
    supabase.from('race_results').select('*').eq('club_id', club.id).eq('month', m).maybeSingle(),
    supabase.from('race_vouchers').select('*').eq('club_id', club.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('race_results').select('month, closed_at').eq('club_id', club.id).order('month', { ascending: false }).limit(24),
  ]);
  const table = result ? result.standings : await standings(club, m);
  const vs = (await withParticipants(vouchers || [])).map(({ _participant, ...v }) => v);
  const fees = await feesGiven(vs);
  return { settings, month: m, current_month: thisMonth(), closed: !!result, closed_at: result?.closed_at || null, table, vouchers: vs, closed_months: closedMonths || [], given: fees };
}

// What the vouchers used so far took off the fees (the cost of the prizes).
async function feesGiven(vouchers) {
  const ids = vouchers.filter((v) => v.state === 'used' && v.participant_id).map((v) => v.participant_id);
  if (!ids.length) return { used: 0, amount: 0 };
  const { data } = await supabase.from('event_participants').select('voucher_discount').in('id', ids);
  return { used: ids.length, amount: (data || []).reduce((s, p) => s + (p.voucher_discount || 0), 0) };
}

async function updateSettings(club, body) {
  const patch = {};
  if ('enabled' in body) {
    patch.race_enabled = !!body.enabled;
    if (body.enabled && !club.race_started_on) patch.race_started_on = `${thisMonth()}-01`;
  }
  if ('split_levels' in body) patch.race_split_levels = !!body.split_levels;
  if ('min_sessions' in body) {
    const n = Number(body.min_sessions);
    if (!Number.isInteger(n) || n < 1 || n > 31) throw httpError('min_sessions must be 1–31.', 400, 'bad_min_sessions');
    patch.race_min_sessions = n;
  }
  if ('rewards' in body) patch.race_rewards = cleanRewards(body.rewards);
  if ('voucher_days' in body) {
    const d = Number(body.voucher_days);
    if (!Number.isInteger(d) || d < 7 || d > 90) throw httpError('voucher_days must be 7–90.', 400, 'bad_days');
    patch.race_voucher_days = d;
  }
  if (!Object.keys(patch).length) throw httpError('Nothing to change.', 400);
  const { data, error } = await supabase.from('clubs').update(patch).eq('id', club.id).select('*').single();
  if (error) throw error;
  return settingsOf(data);
}

async function voucherAction(club, voucherId, body) {
  const { data: v } = await supabase.from('race_vouchers').select('*').eq('id', voucherId).eq('club_id', club.id).maybeSingle();
  if (!v) throw httpError('Voucher not found.', 404);
  let patch;
  if (body.action === 'revoke') patch = { revoked_at: new Date().toISOString() };
  else if (body.action === 'restore') {
    // Back to usable: not revoked, and free again if its sign-up is gone or was cancelled.
    patch = { revoked_at: null };
    const { data: p } = v.participant_id ? await supabase.from('event_participants').select('status').eq('id', v.participant_id).maybeSingle() : { data: null };
    if (v.used_at && (!p || p.status === 'cancelled')) Object.assign(patch, { used_at: null, participant_id: null });
  }
  else if (body.action === 'extend') {
    const days = Number(body.days || 30);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw httpError('days must be 1–90.', 400, 'bad_days');
    const base = v.expires_on > localYmd() ? new Date(`${v.expires_on}T12:00:00Z`) : new Date();
    patch = { expires_on: localYmd(new Date(base.getTime() + days * 86400000)) };
  } else throw httpError('action must be extend, revoke or restore.', 400);
  const { data, error } = await supabase.from('race_vouchers').update(patch).eq('id', v.id).select('*').single();
  if (error) throw error;
  return (await withParticipants([data])).map(({ _participant, ...x }) => x)[0];
}

// ---- Player -------------------------------------------------------------------------

// The current month's table for a member, names and points only (no levels / ids).
async function playerView(club, userId) {
  const settings = settingsOf(club);
  if (!settings.enabled) return { enabled: false };
  const { month, groups } = await standings(club, thisMonth());
  const { data: me } = await supabase.from('club_members').select('id').eq('club_id', club.id).eq('user_id', userId).maybeSingle();
  const strip = (r, i) => ({ place: i + 1, full_name: r.full_name, points: r.points, sessions: r.sessions, wins: r.wins, eligible: r.eligible, prize_rank: r.prize_rank, me: !!me && r.club_member_id === me.id });
  return { enabled: true, month, settings, groups: groups.map((g) => ({ key: g.key, rows: g.rows.map(strip) })) };
}

module.exports = {
  MIGRATION, MIN_SESSIONS, JOIN_BY_DAY, POINTS, DEFAULT_REWARDS, ready, settingsOf, standings, closeMonth, closeDueMonths, startRaceSweeper,
  vouchersOf, usableVoucher, claimVoucher, attachVoucher, releaseVoucher, discountFor, hostView, updateSettings, voucherAction, playerView, thisMonth, shiftMonth, voucherState,
};
