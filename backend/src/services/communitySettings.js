// The community control panel (Social Manager): each Host sets their own rules.
//  * "Người mới" = the first 30 days after joining (club_members.newcomer_until). After that:
//    more than `regular.min` sessions in the last 30 days (default: more than 3) ->
//    khách thường xuyên (member_type fixed); no session for 3 weeks -> khách vãng lai
//    (guest); in between nobody moves. By default the Host gets suggestions (who should
//    move) and decides; with `regular.auto` on, members move by themselves.
//  * "Khách VIP" = holds a paid pass (month / quarter / year) — not a type: the pass pays
//    and loses a session at each check-in. "Khách ưu tiên" = guest_perk 'priority'.
//  * `active_days`: no session for that many days = "không hoạt động".
//  * Levels ("trình độ"), one of:
//      manual     — names the Host makes up (Series A, B, C…) and assigns by hand; each may
//                   carry a DUPR range (dupr_min – dupr_max) that fills a kèo's DUPR limits,
//      score      — from the member's DUPR (badminton: level 1-6), by lower bounds,
//      experience — from how long they have played (< 6 months, 6-12, 12-18, > 18).
//    `levels.by_gender` (manual / score): men and women have their own DUPR ranges — f_min /
//    f_max (manual) or f_min (score) for women; e.g. Series A: men 3.0-3.5, women 2.8-3.0.
//    Kèo can be marked for some levels; the overview counts members per level.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { todayYmd } = require('./memberships');

const MIGRATION = '20261123090000_community_settings.sql';
const MODES = ['none', 'manual', 'score', 'experience'];
const DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];
const PLAYED = ['registered', 'checked_in'];
const REGULAR_DAYS = 30; // "a month"
const NEW_GRACE_DAYS = 30; // someone just added is not moved down before they had a month
const NEWCOMER_DAYS = 30; // "Người mới": the first 30 days after joining
const AWAY_DAYS = 21; // no session for 3 weeks -> vãng lai
const MAX_LEVELS = 12;

// signup.auto_dupr: kèo sign-ups with a verified DUPR inside the kèo's range skip the
// Host's info check and go straight to payment (off = the Host checks everyone).
// refund: the refund rule new kèo start with (each kèo can still change it):
//   tiers — 100% back if cancelled `full` hours before, 50% if `half` hours before, else 0%
//   free  — cancel any time, everything back · none — "Không hoàn tiền", nothing back.
const REFUND_MODES = ['tiers', 'free', 'none'];
const DEFAULTS = { regular: { auto: false, min: 3 }, active_days: 30, levels: { mode: 'none', items: [] }, signup: { auto_dupr: false }, refund: { mode: 'tiers', full: 12, half: 6 } };

function cleanRefund(r) {
  const mode = REFUND_MODES.includes(r?.mode) ? r.mode : DEFAULTS.refund.mode;
  const num = (v, d) => (v === '' || v == null ? d : Number(v));
  const full = num(r?.full, DEFAULTS.refund.full);
  const half = num(r?.half, null);
  if (!(Number.isInteger(full) && full >= 0 && full <= 168)) throw fail('Hours must be a whole number from 0 to 168.', 'bad_refund_hours');
  if (half != null && !(Number.isInteger(half) && half >= 0 && half < full)) throw fail('The 50% hours must be fewer than the 100% hours.', 'bad_refund_hours');
  return { mode, full, half };
}

const fail = (message, code) => Object.assign(new Error(message), { status: 400, code });

async function newcomersReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261206090000_newcomers.sql');
}
const newcomerUntil = (from) => addDays(from || todayYmd(), NEWCOMER_DAYS - 1);

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Stored settings merged over the defaults (older rows, missing parts).
function resolve(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const regular = { ...DEFAULTS.regular, ...(s.regular || {}) };
  const mode = MODES.includes(s.levels?.mode) ? s.levels.mode : 'none';
  const levels = { mode, items: Array.isArray(s.levels?.items) ? s.levels.items : [], by_gender: ['manual', 'score'].includes(mode) && s.levels?.by_gender === true };
  let refund = DEFAULTS.refund;
  try {
    if (s.refund) refund = cleanRefund(s.refund);
  } catch {
    /* a broken stored rule falls back to the default */
  }
  return { regular, active_days: Number(s.active_days) || DEFAULTS.active_days, levels, signup: { auto_dupr: s.signup?.auto_dupr === true }, refund };
}

const intIn = (v, lo, hi, code) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw fail(`Must be a whole number from ${lo} to ${hi}.`, code);
  return n;
};
const newKey = () => crypto.randomBytes(4).toString('hex');

// Validate what the panel sends. `sport` decides the score range (DUPR 1-8, badminton 1-6).
function clean(body, sport) {
  const regular = {
    auto: body?.regular?.auto === true,
    min: intIn(body?.regular?.min ?? DEFAULTS.regular.min, 0, 30, 'bad_regular_min'),
  };
  const active_days = intIn(body?.active_days ?? DEFAULTS.active_days, 7, 180, 'bad_active_days');
  const mode = body?.levels?.mode ?? 'none';
  if (!MODES.includes(mode)) throw fail('Unknown level mode.', 'bad_level_mode');
  const raw = Array.isArray(body?.levels?.items) ? body.levels.items : [];
  if (raw.length > MAX_LEVELS) throw fail(`At most ${MAX_LEVELS} levels.`, 'too_many_levels');
  if (mode !== 'none' && !raw.length) throw fail('Add at least one level.', 'no_levels');
  const seenLabel = new Set();
  const seenKey = new Set();
  const usedBuckets = new Set();
  const top = sport === 'badminton' ? 6 : 8;
  const byGender = ['manual', 'score'].includes(mode) && body?.levels?.by_gender === true;
  let items = raw.map((it) => {
    const label = String(it?.label || '').trim().slice(0, 30);
    if (!label) throw fail('Every level needs a name.', 'level_label_required');
    const lower = label.toLowerCase();
    if (seenLabel.has(lower)) throw fail(`Two levels are called "${label}".`, 'level_label_taken');
    seenLabel.add(lower);
    let key = /^[a-z0-9_-]{1,20}$/i.test(String(it?.key || '')) ? String(it.key) : newKey();
    while (seenKey.has(key)) key = newKey();
    seenKey.add(key);
    const out = { key, label };
    if (mode === 'manual') {
      // Optional DUPR range of the level ("Series A: 3.0 – 3.5").
      const num = (v) => (v === '' || v == null ? null : Number(v));
      const lo = num(it?.dupr_min);
      const hi = num(it?.dupr_max);
      for (const v of [lo, hi]) if (v != null && !(Number.isFinite(v) && v >= 0 && v <= top)) throw fail(`Score must be from 0 to ${top}.`, 'bad_level_range');
      if (lo != null && hi != null && hi < lo) throw fail('The upper score is below the lower one.', 'bad_level_range');
      out.dupr_min = lo == null ? null : Math.round(lo * 100) / 100;
      out.dupr_max = hi == null ? null : Math.round(hi * 100) / 100;
      if (byGender) {
        const flo = num(it?.f_min);
        const fhi = num(it?.f_max);
        for (const v of [flo, fhi]) if (v != null && !(Number.isFinite(v) && v >= 0 && v <= top)) throw fail(`Score must be from 0 to ${top}.`, 'bad_level_range');
        if (flo != null && fhi != null && fhi < flo) throw fail("The women's upper score is below the lower one.", 'bad_level_range');
        out.f_min = flo == null ? null : Math.round(flo * 100) / 100;
        out.f_max = fhi == null ? null : Math.round(fhi * 100) / 100;
      }
    }
    if (mode === 'score') {
      const v = it?.min === '' || it?.min == null ? null : Number(it.min);
      if (v != null && !(Number.isFinite(v) && v >= 0 && v <= top)) throw fail(`Score must be from 0 to ${top}.`, 'bad_level_min');
      out.min = v == null ? null : Math.round(v * 100) / 100;
      if (byGender) {
        const f = it?.f_min === '' || it?.f_min == null ? null : Number(it.f_min);
        if (f != null && !(Number.isFinite(f) && f >= 0 && f <= top)) throw fail(`Score must be from 0 to ${top}.`, 'bad_level_min');
        out.f_min = f == null ? null : Math.round(f * 100) / 100;
      }
    }
    if (mode === 'experience') {
      const buckets = (Array.isArray(it?.buckets) ? it.buckets : []).filter((b) => DURATIONS.includes(b));
      for (const b of buckets) {
        if (usedBuckets.has(b)) throw fail('A playing time belongs to one level only.', 'bucket_taken');
        usedBuckets.add(b);
      }
      out.buckets = buckets;
    }
    return out;
  });
  if (mode === 'score') {
    // Lowest first; only the first may have no lower bound ("dưới …").
    items.sort((a, b) => (a.min ?? -1) - (b.min ?? -1));
    if (items.slice(1).some((i) => i.min == null)) throw fail('Only the lowest level may have no lower bound.', 'bad_level_min');
    for (let i = 1; i < items.length; i += 1) if (items[i].min === items[i - 1].min) throw fail('Two levels start at the same score.', 'bad_level_min');
  }
  if (mode === 'none') items = [];
  return { regular, active_days, levels: { mode, items, by_gender: byGender }, signup: { auto_dupr: body?.signup?.auto_dupr === true }, refund: cleanRefund(body?.refund) };
}

// The level a member is in under these settings (null = none).
function levelOf(member, settings) {
  const { mode, items } = settings.levels;
  if (!items.length) return null;
  let hit = null;
  if (mode === 'manual') hit = items.find((i) => i.key === member.level_key);
  else if (mode === 'score') {
    // "Theo điểm": the Host's own Điểm trình (skill_score), not the DUPR a player typed.
    const v = member.skill_score == null ? null : Number(member.skill_score);
    // Women's own lower bounds when levels are split by gender (lowest level: none).
    const women = settings.levels.by_gender && member.gender === 'female';
    if (v != null) items.forEach((i, n) => {
      const lo = women ? (n === 0 ? null : i.f_min ?? i.min) : i.min;
      if (lo == null || lo <= v) hit = i;
    });
  } else if (mode === 'experience') hit = items.find((i) => (i.buckets || []).includes(member.play_duration));
  return hit ? { key: hit.key, label: hit.label } : null;
}

async function forClub(clubId) {
  if (!(await ready())) return resolve(null);
  const { data, error } = await supabase.from('clubs').select('community_settings').eq('id', clubId).maybeSingle();
  if (error) throw error;
  return resolve(data?.community_settings);
}

async function save(club, body) {
  if (!(await ready())) throw Object.assign(new Error(`Run migration ${MIGRATION} first.`), { status: 409, code: 'migration_required' });
  const settings = clean(body, club.sport);
  const { error } = await supabase.from('clubs').update({ community_settings: settings }).eq('id', club.id);
  if (error) throw error;
  // Levels that are gone: members assigned to them go back to "no level".
  if (settings.levels.mode === 'manual') {
    const keys = settings.levels.items.map((i) => i.key);
    const { error: e2 } = await supabase.from('club_members').update({ level_key: null }).eq('club_id', club.id).not('level_key', 'is', null).not('level_key', 'in', `(${keys.join(',')})`);
    if (e2) throw e2;
  }
  forget(club.id);
  return settings;
}

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Sessions each member played in the last 30 days: kèo already held (today or before) they
// were on and did not cancel / miss. One per kèo, even if listed twice.
async function recentCounts(clubId) {
  const today = todayYmd();
  const since = addDays(today, -REGULAR_DAYS);
  const events = await all(() => supabase.from('events').select('id, event_date').eq('club_id', clubId).gte('event_date', since).lte('event_date', today).neq('status', 'cancelled').order('id'));
  const dateOf = new Map(events.map((e) => [e.id, e.event_date]));
  const seen = new Map(); // member -> Set(event)
  const ids = events.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 150) {
    const rows = await all(() => supabase.from('event_participants').select('event_id, status, source_club_member_id, guest_member_id').in('event_id', ids.slice(i, i + 150)).order('id'));
    for (const p of rows) {
      const mid = p.source_club_member_id || p.guest_member_id;
      if (!mid || !PLAYED.includes(p.status)) continue;
      if (!seen.has(mid)) seen.set(mid, new Set());
      seen.get(mid).add(p.event_id);
    }
  }
  const counts = new Map([...seen].map(([k, v]) => [k, v.size]));
  // Last day each one played in the window (none in 30 days = longer ago than 3 weeks).
  counts.last = new Map([...seen].map(([k, v]) => [k, [...v].map((e) => dateOf.get(e)).sort().pop()]));
  return counts;
}

// Who should move, by the Host's rule (more than `min` sessions = regular). Nobody new
// (added this month) or holding a pass for today is suggested down.
async function proposals(club) {
  const settings = await forClub(club.id);
  const today = todayYmd();
  const graceFrom = addDays(today, -NEW_GRACE_DAYS);
  const newCol = (await newcomersReady()) ? ', newcomer_until' : '';
  const [members, counts] = await Promise.all([
    all(() => supabase.from('club_members').select(`id, full_name, member_type, is_active, join_requested, review_started_at, created_at${newCol}`).eq('club_id', club.id).order('id')),
    recentCounts(club.id),
  ]);
  const roster = members.filter((m) => m.is_active && !m.join_requested && !m.review_started_at);
  const awaySince = addDays(today, -AWAY_DAYS);
  const up = [];
  const down = [];
  // "Người mới" whose 30 days are over and who did not come back often enough: they are
  // drop-ins already (approved as guest), so they only stop being "new" (Vãng lai tab).
  const settle = [];
  for (const m of roster) {
    // "Người mới": nobody moves during the first 30 days.
    if (m.newcomer_until && m.newcomer_until >= today) continue;
    const n = counts.get(m.id) || 0;
    const last = counts.last?.get(m.id) || null;
    const regular = n > settings.regular.min;
    const away = !last || last < awaySince; // no session for 3 weeks
    const wasNew = !!m.newcomer_until;
    if (regular && m.member_type === 'guest') up.push({ id: m.id, full_name: m.full_name, sessions: n, newcomer: wasNew });
    else if (!regular && away && m.member_type === 'fixed' && String(m.created_at).slice(0, 10) < graceFrom) down.push({ id: m.id, full_name: m.full_name, sessions: n, newcomer: wasNew });
    else if (wasNew) settle.push(m.id);
  }
  if (down.length) {
    const { data: passes, error } = await supabase.from('memberships').select('club_member_id').in('club_member_id', down.map((d) => d.id)).eq('status', 'paid').lte('starts_on', today).gte('ends_on', today);
    if (error) throw error;
    const keep = new Set((passes || []).map((p) => p.club_member_id));
    down.splice(0, down.length, ...down.filter((d) => !keep.has(d.id)));
  }
  return { settings, roster, up, down, settle };
}

// Move members between regular (fixed) and drop-in (guest) by the Host's rule. Never moves
// down someone added in the last month, or who holds a membership pass for today.
const lastRun = new Map();
const THROTTLE_MS = 10 * 60 * 1000;
const forget = (clubId) => lastRun.delete(clubId);

async function reclassify(club, { force = false } = {}) {
  if ((club.kind || 'club') !== 'community' || !(await ready())) return null;
  if (!force && Date.now() - (lastRun.get(club.id) || 0) < THROTTLE_MS) return null;
  lastRun.set(club.id, Date.now());
  const settings = await forClub(club.id);
  if (!settings.regular.auto && !force) return null;
  const { roster, up, down, settle } = await proposals(club);
  const clearNew = (await newcomersReady()) ? { newcomer_until: null } : {};
  // "Khách ưu tiên" stays ưu tiên either way (the Host chose it).
  if (up.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'fixed', ...clearNew }).in('id', up.map((x) => x.id));
    if (error) throw error;
  }
  if (down.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'guest', tier: null, ...clearNew }).in('id', down.map((x) => x.id));
    if (error) throw error;
  }
  // Past their 30 days, played lately but not enough to be regular: no longer "new".
  if (settle.length && clearNew.newcomer_until === null) {
    const { error } = await supabase.from('club_members').update(clearNew).in('id', settle);
    if (error) throw error;
  }
  return { checked: roster.length, to_regular: up.length, to_dropin: down.length, min: settings.regular.min };
}

module.exports = { MIGRATION, MODES, DURATIONS, DEFAULTS, NEWCOMER_DAYS, newcomersReady, newcomerUntil, ready, resolve, clean, levelOf, forClub, save, reclassify, proposals, recentCounts, forget };
