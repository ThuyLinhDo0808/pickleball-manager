// Top 10 cộng đồng uy tín: a community pays to be shown in the Top 10 on the club search
// (/discover); the Owner checks how trustworthy it is before it shows.
//   Host: pick 1 / 3 / 6 / 12 months -> transfer (operator's account, note = ref).
//   Owner: money received (in_review) -> look at the community's numbers -> approve with a
//   trust score and a place 1-10 (active until ends_on), or reject. At most 10 at a time.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { todayYmd } = require('./memberships');
const { vietqrUrl } = require('./payment');

const MIGRATION = '20261203090000_featured_communities.sql';
const MONTHS = [1, 3, 6, 12];
const SLOTS = 10;
const OPEN = ['awaiting_payment', 'in_review', 'active'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
async function extraReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261209090000_dev_requests.sql');
}
async function assertReady() {
  if (!(await ready())) throw fail(`Run migration ${MIGRATION} first.`, 409, 'migration_required');
}

// Price per month (FEATURED_PRICE_MONTH, đ); longer stays cost the same per month.
function pricePerMonth() {
  const v = Number(process.env.FEATURED_PRICE_MONTH);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : 300000;
}

function addMonths(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Placements whose time is over end by themselves.
async function expire() {
  await supabase.from('featured_communities').update({ status: 'ended' }).eq('status', 'active').lt('ends_on', todayYmd());
}

function payment(row) {
  if (row.status !== 'awaiting_payment') return null;
  const bank = require('./billing').operatorBank();
  return { ref: row.ref, amount: Number(row.amount), bank: { code: bank.bank_code, name: bank.bank_name, account: bank.bank_account, holder: bank.bank_holder }, qr_url: vietqrUrl(bank, row.amount, row.ref) };
}

// ---- Host -----------------------------------------------------------------------------------

async function forClub(club) {
  if (!(await ready())) return { ready: false };
  await expire();
  const { data, error } = await supabase.from('featured_communities').select('id, status, months, amount, ref, paid_at, position, trust_score, owner_note, starts_on, ends_on, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(5);
  if (error) throw error;
  let current = (data || []).find((r) => OPEN.includes(r.status)) || null;
  let reputation = null;
  try {
    reputation = await require('./communityBusiness').reputation(club);
  } catch {}
  // A request still waiting for the transfer from a community that does not (or no longer)
  // meet the conditions (e.g. made before they existed) is dropped: nothing was paid yet.
  let dropped = false;
  if (current?.status === 'awaiting_payment' && reputation && !reputation.eligible) {
    await supabase.from('featured_communities').update({ status: 'cancelled' }).eq('id', current.id).eq('status', 'awaiting_payment');
    current = null;
    dropped = true;
  }
  const last = !current && !dropped ? (data || []).find((r) => !OPEN.includes(r.status)) || null : null;
  const { count } = await supabase.from('featured_communities').select('id', { count: 'exact', head: true }).eq('status', 'active');
  return {
    ready: true,
    price_month: pricePerMonth(),
    months: MONTHS,
    slots_left: Math.max(SLOTS - (count || 0), 0),
    reputation,
    dropped_not_eligible: dropped,
    current: current ? { ...current, amount: Number(current.amount), payment: payment(current) } : null,
    // A rejected request shows its reason once (the Host can ask again).
    last: last && ['rejected'].includes(last.status) ? { status: last.status, owner_note: last.owner_note } : null,
  };
}

// Only a community that reaches every bar (communityBusiness.reputation) may register:
// 409 not_eligible with the bars it misses. The Host's note and the numbers at the time go
// with the request, for the Owner's review.
async function request(club, hostId, months, { note, info } = {}) {
  await assertReady();
  if ((club.kind || 'club') !== 'community') throw fail('Only communities can join the Top 10.', 400, 'not_community');
  const m = Number(months);
  if (!MONTHS.includes(m)) throw fail(`months must be one of ${MONTHS.join(', ')}.`, 400, 'bad_months');
  const rep = await require('./communityBusiness').reputation(club);
  if (!rep.eligible) throw Object.assign(fail('This community does not meet the Top 10 conditions yet.', 409, 'not_eligible'), { failing: rep.failing, reputation: rep });
  const text = typeof note === 'string' ? note.trim().slice(0, 1000) : '';
  // The Host may correct the name / say more; the numbers are always the computed ones.
  // What the Host typed (kept apart, for the Owner to compare).
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(1e6, Number(v))));
  const claimed = info && typeof info === 'object' ? Object.fromEntries(['members', 'sessions_held', 'active_pct', 'new_month_avg'].map((k) => [k, num(info[k])])) : null;
  const hostInfo = { ...rep.info, name: typeof info?.name === 'string' && info.name.trim() ? info.name.trim().slice(0, 120) : rep.info.name, claimed };
  const extra = (await extraReady()) ? { host_note: text || null, host_info: hostInfo } : {};
  const ref = `TOP${[...crypto.randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
  const { data, error } = await supabase.from('featured_communities').insert({ club_id: club.id, host_id: hostId, months: m, amount: pricePerMonth() * m, ref, ...extra }).select().single();
  if (error?.code === '23505') throw fail('This community already has a request or a place in the Top 10.', 409, 'already_open');
  if (error) throw error;
  require('./feedback').notifyFeedback({ message: `[Top 10] ${club.name} đăng ký ${m} tháng · ${(pricePerMonth() * m).toLocaleString('vi-VN')}đ · nội dung CK ${ref}. Khi nhận tiền, vào Trang quản trị → Top 10 uy tín.`, page: '/owner/featured' }).catch(() => {});
  return data;
}

async function cancelByHost(club) {
  await assertReady();
  const { data, error } = await supabase.from('featured_communities').update({ status: 'cancelled' }).eq('club_id', club.id).eq('status', 'awaiting_payment').select('id');
  if (error) throw error;
  if (!data?.length) throw fail('Nothing to cancel (a paid request is handled by the Owner).', 409, 'not_cancellable');
  return { ok: true };
}

// ---- Owner ----------------------------------------------------------------------------------

// What helps judge trust: size, activity, players' ratings, cancelled sessions.
async function stats(clubIds) {
  const out = new Map(clubIds.map((id) => [id, { members: 0, events_90d: 0, cancelled_90d: 0, rating: null, ratings: 0, age_days: null }]));
  if (!clubIds.length) return out;
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [{ data: members }, { data: events }, { data: clubs }] = await Promise.all([
    supabase.from('club_members').select('club_id').in('club_id', clubIds).eq('is_active', true),
    supabase.from('events').select('id, club_id, status').in('club_id', clubIds).gte('event_date', since),
    supabase.from('clubs').select('id, created_at').in('id', clubIds),
  ]);
  for (const m of members || []) out.get(m.club_id).members += 1;
  for (const e of events || []) {
    const s = out.get(e.club_id);
    if (e.status === 'cancelled') s.cancelled_90d += 1;
    else s.events_90d += 1;
  }
  for (const c of clubs || []) out.get(c.id).age_days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
  const evIds = (events || []).map((e) => e.id);
  if (evIds.length) {
    const clubOf = new Map((events || []).map((e) => [e.id, e.club_id]));
    const { data: surveys } = await supabase.from('event_surveys').select('event_id, rating').in('event_id', evIds.slice(0, 1000));
    const sum = new Map();
    for (const s of surveys || []) {
      const c = clubOf.get(s.event_id);
      const v = sum.get(c) || [0, 0];
      sum.set(c, [v[0] + s.rating, v[1] + 1]);
    }
    for (const [c, [total, n]] of sum) Object.assign(out.get(c), { rating: Math.round((total / n) * 10) / 10, ratings: n });
  }
  return out;
}

async function listForOwner() {
  await assertReady();
  await expire();
  const { data, error } = await supabase.from('featured_communities').select('*, clubs(name, province, district, host_id)').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const st = await stats([...new Set((data || []).map((r) => r.club_id))]);
  const hostIds = [...new Set((data || []).map((r) => r.host_id).filter(Boolean))];
  const { data: hosts } = hostIds.length ? await supabase.from('users').select('id, email').in('id', hostIds) : { data: [] };
  const emailOf = new Map((hosts || []).map((h) => [h.id, h.email]));
  const rows = (data || []).map(({ clubs: c, ...r }) => ({ ...r, amount: Number(r.amount), club: { name: c?.name, province: c?.province, district: c?.district }, host_email: emailOf.get(r.host_id) || null, stats: st.get(r.club_id) }));
  return { price_month: pricePerMonth(), slots: SLOTS, active: rows.filter((r) => r.status === 'active').length, rows };
}

async function rowOf(id) {
  const { data, error } = await supabase.from('featured_communities').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Request not found.', 404, 'not_found');
  return data;
}

async function decide(id, action, body, by) {
  await assertReady();
  await expire();
  const row = await rowOf(id);
  const note = body?.note == null ? row.owner_note : String(body.note).trim().slice(0, 500) || null;
  let patch;
  if (action === 'paid') {
    if (row.status !== 'awaiting_payment') throw fail('Not waiting for payment.', 409, 'bad_state');
    patch = { status: 'in_review', paid_at: new Date().toISOString() };
  } else if (action === 'approve') {
    if (!['in_review', 'active'].includes(row.status)) throw fail('Confirm the payment first.', 409, 'bad_state');
    const score = Number(body?.trust_score);
    const pos = Number(body?.position);
    if (!(Number.isInteger(score) && score >= 0 && score <= 100)) throw fail('trust_score must be 0-100.', 400, 'bad_score');
    if (!(Number.isInteger(pos) && pos >= 1 && pos <= SLOTS)) throw fail(`position must be 1-${SLOTS}.`, 400, 'bad_position');
    if (row.status !== 'active') {
      const { count } = await supabase.from('featured_communities').select('id', { count: 'exact', head: true }).eq('status', 'active');
      if ((count || 0) >= SLOTS) throw fail('The Top 10 is full: end or remove one first.', 409, 'top_full');
    }
    const starts = row.starts_on || todayYmd();
    patch = { status: 'active', trust_score: score, position: pos, owner_note: note, starts_on: starts, ends_on: row.ends_on || addMonths(starts, row.months) };
  } else if (action === 'reject') {
    if (!['awaiting_payment', 'in_review'].includes(row.status)) throw fail('Only a request under review can be rejected.', 409, 'bad_state');
    patch = { status: 'rejected', owner_note: note };
  } else if (action === 'remove') {
    if (row.status !== 'active') throw fail('Not in the Top 10.', 409, 'bad_state');
    patch = { status: 'cancelled', owner_note: note, ends_on: todayYmd() };
  } else throw fail(`Unknown action: ${action}`, 400, 'bad_action');
  const { data, error } = await supabase.from('featured_communities').update({ ...patch, decided_by: by || null }).eq('id', row.id).select().single();
  if (error) throw error;
  return { before: row, after: data };
}

// ---- Public: the Top 10 on the club search --------------------------------------------------

async function top() {
  if (!(await ready())) return [];
  await expire();
  const today = todayYmd();
  const { data, error } = await supabase.from('featured_communities').select('club_id, position, trust_score, starts_on, ends_on, clubs(id, name, province, district, sport, avatar_version, member_count_hint, is_listed)').eq('status', 'active').lte('starts_on', today).gte('ends_on', today).order('position', { ascending: true }).order('trust_score', { ascending: false }).limit(SLOTS);
  if (error) throw error;
  const rows = (data || []).filter((r) => r.clubs);
  const st = await stats(rows.map((r) => r.club_id));
  return rows.map((r, i) => ({
    rank: i + 1,
    id: r.clubs.id,
    name: r.clubs.name,
    province: r.clubs.province,
    district: r.clubs.district,
    sport: r.clubs.sport || 'pickleball',
    avatar_version: r.clubs.avatar_version,
    trust_score: r.trust_score,
    members: st.get(r.club_id).members || r.clubs.member_count_hint || 0,
    rating: st.get(r.club_id).rating,
    sessions_90d: st.get(r.club_id).events_90d,
  }));
}

module.exports = { MIGRATION, MONTHS, SLOTS, ready, pricePerMonth, forClub, request, cancelByHost, listForOwner, decide, top };
