// The community control panel (Social Manager): each Host sets their own rules.
//  * Regulars ("khách thường xuyên") = more than `regular.min` sessions played in the last
//    30 days (default: more than 3); the rest are drop-ins ("vãng lai"). Stored as
//    member_type fixed / guest. By default the Host gets suggestions (who should move) and
//    decides; with `regular.auto` on, members move by themselves.
//  * "Khách VIP" = holds a paid pass (month / quarter / year) — not a type: the pass pays
//    and loses a session at each check-in. "Khách ưu tiên" = guest_perk 'priority'.
//  * `active_days`: no session for that many days = "không hoạt động".
//  * Levels ("trình độ"), one of:
//      manual     — names the Host makes up (Series A, B, C…) and assigns by hand; each may
//                   carry a DUPR range (dupr_min – dupr_max) that fills a kèo's DUPR limits,
//      score      — from the member's DUPR (badminton: level 1-6), by lower bounds,
//      experience — from how long they have played (< 6 months, 6-12, 12-18, > 18).
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
const MAX_LEVELS = 12;

// signup.auto_dupr: kèo sign-ups with a verified DUPR inside the kèo's range skip the
// Host's info check and go straight to payment (off = the Host checks everyone).
const DEFAULTS = { regular: { auto: false, min: 3 }, active_days: 30, levels: { mode: 'none', items: [] }, signup: { auto_dupr: false } };

const fail = (message, code) => Object.assign(new Error(message), { status: 400, code });

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
  const levels = { mode: MODES.includes(s.levels?.mode) ? s.levels.mode : 'none', items: Array.isArray(s.levels?.items) ? s.levels.items : [] };
  return { regular, active_days: Number(s.active_days) || DEFAULTS.active_days, levels, signup: { auto_dupr: s.signup?.auto_dupr === true } };
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
    }
    if (mode === 'score') {
      const v = it?.min === '' || it?.min == null ? null : Number(it.min);
      if (v != null && !(Number.isFinite(v) && v >= 0 && v <= top)) throw fail(`Score must be from 0 to ${top}.`, 'bad_level_min');
      out.min = v == null ? null : Math.round(v * 100) / 100;
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
  return { regular, active_days, levels: { mode, items }, signup: { auto_dupr: body?.signup?.auto_dupr === true } };
}

// The level a member is in under these settings (null = none).
function levelOf(member, settings) {
  const { mode, items } = settings.levels;
  if (!items.length) return null;
  let hit = null;
  if (mode === 'manual') hit = items.find((i) => i.key === member.level_key);
  else if (mode === 'score') {
    const v = member.dupr_level == null ? null : Number(member.dupr_level);
    if (v != null) for (const i of items) if (i.min == null || i.min <= v) hit = i;
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
  const events = await all(() => supabase.from('events').select('id').eq('club_id', clubId).gte('event_date', since).lte('event_date', today).neq('status', 'cancelled').order('id'));
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
  return new Map([...seen].map(([k, v]) => [k, v.size]));
}

// Who should move, by the Host's rule (more than `min` sessions = regular). Nobody new
// (added this month) or holding a pass for today is suggested down.
async function proposals(club) {
  const settings = await forClub(club.id);
  const today = todayYmd();
  const graceFrom = addDays(today, -NEW_GRACE_DAYS);
  const [members, counts] = await Promise.all([
    all(() => supabase.from('club_members').select('id, full_name, member_type, is_active, join_requested, review_started_at, created_at').eq('club_id', club.id).order('id')),
    recentCounts(club.id),
  ]);
  const roster = members.filter((m) => m.is_active && !m.join_requested && !m.review_started_at);
  const up = [];
  const down = [];
  for (const m of roster) {
    const n = counts.get(m.id) || 0;
    const regular = n > settings.regular.min;
    if (regular && m.member_type === 'guest') up.push({ id: m.id, full_name: m.full_name, sessions: n });
    if (!regular && m.member_type === 'fixed' && String(m.created_at).slice(0, 10) < graceFrom) down.push({ id: m.id, full_name: m.full_name, sessions: n });
  }
  if (down.length) {
    const { data: passes, error } = await supabase.from('memberships').select('club_member_id').in('club_member_id', down.map((d) => d.id)).eq('status', 'paid').lte('starts_on', today).gte('ends_on', today);
    if (error) throw error;
    const keep = new Set((passes || []).map((p) => p.club_member_id));
    down.splice(0, down.length, ...down.filter((d) => !keep.has(d.id)));
  }
  return { settings, roster, up, down };
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
  const { roster, up, down } = await proposals(club);
  // "Khách ưu tiên" stays ưu tiên either way (the Host chose it).
  if (up.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'fixed' }).in('id', up.map((x) => x.id));
    if (error) throw error;
  }
  if (down.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'guest', tier: null }).in('id', down.map((x) => x.id));
    if (error) throw error;
  }
  return { checked: roster.length, to_regular: up.length, to_dropin: down.length, min: settings.regular.min };
}

module.exports = { MIGRATION, MODES, DURATIONS, DEFAULTS, ready, resolve, clean, levelOf, forClub, save, reclassify, proposals, recentCounts, forget };
