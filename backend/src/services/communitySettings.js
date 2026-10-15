// The community control panel (Social Manager): each Host sets their own rules.
//  * Regulars ("khách thường xuyên") = at least `regular.min` sessions in the last 30 days;
//    with `regular.auto` on, members move between regular and drop-in ("vãng lai") by
//    themselves. Stored as member_type fixed / guest, like a club's fixed / guest members.
//  * `active_days`: no session for that many days = "không hoạt động".
//  * Levels ("trình độ"), one of:
//      manual     — names the Host makes up (Series A, B, C…) and assigns by hand,
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

const DEFAULTS = { regular: { auto: true, min: 3 }, active_days: 30, levels: { mode: 'none', items: [] } };

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
  return { regular, active_days: Number(s.active_days) || DEFAULTS.active_days, levels };
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
    auto: body?.regular?.auto !== false,
    min: intIn(body?.regular?.min ?? DEFAULTS.regular.min, 1, 31, 'bad_regular_min'),
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
  return { regular, active_days, levels: { mode, items } };
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

// Sessions each member played in the last 30 days (sign-ups that were not cancelled).
async function recentCounts(clubId) {
  const today = todayYmd();
  const since = addDays(today, -REGULAR_DAYS);
  const events = await all(() => supabase.from('events').select('id').eq('club_id', clubId).gte('event_date', since).lte('event_date', today).neq('status', 'cancelled').order('id'));
  const counts = new Map();
  const ids = events.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 150) {
    const rows = await all(() => supabase.from('event_participants').select('status, source_club_member_id, guest_member_id').in('event_id', ids.slice(i, i + 150)).order('id'));
    for (const p of rows) {
      const mid = p.source_club_member_id || p.guest_member_id;
      if (mid && PLAYED.includes(p.status)) counts.set(mid, (counts.get(mid) || 0) + 1);
    }
  }
  return counts;
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
  const today = todayYmd();
  const graceFrom = addDays(today, -NEW_GRACE_DAYS);
  const [members, counts] = await Promise.all([
    all(() => supabase.from('club_members').select('id, member_type, is_active, join_requested, created_at').eq('club_id', club.id).order('id')),
    recentCounts(club.id),
  ]);
  const roster = members.filter((m) => m.is_active && !m.join_requested);
  const up = [];
  const down = [];
  for (const m of roster) {
    const regular = (counts.get(m.id) || 0) >= settings.regular.min;
    if (regular && m.member_type === 'guest') up.push(m.id);
    if (!regular && m.member_type === 'fixed' && String(m.created_at).slice(0, 10) < graceFrom) down.push(m.id);
  }
  // Holding a pass for today keeps them regular.
  if (down.length) {
    const { data: passes, error } = await supabase.from('memberships').select('club_member_id').in('club_member_id', down).lte('starts_on', today).gte('ends_on', today);
    if (error) throw error;
    const keep = new Set((passes || []).map((p) => p.club_member_id));
    down.splice(0, down.length, ...down.filter((id) => !keep.has(id)));
  }
  if (up.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'fixed', guest_perk: null }).in('id', up);
    if (error) throw error;
  }
  if (down.length) {
    const { error } = await supabase.from('club_members').update({ member_type: 'guest', tier: null }).in('id', down);
    if (error) throw error;
  }
  return { checked: roster.length, to_regular: up.length, to_dropin: down.length, min: settings.regular.min };
}

// Type for a member approved with "---" in a community: by their sessions so far.
async function typeFor(club, memberId) {
  const settings = await forClub(club.id);
  const counts = await recentCounts(club.id);
  return (counts.get(memberId) || 0) >= settings.regular.min ? 'fixed' : 'guest';
}

module.exports = { MIGRATION, MODES, DURATIONS, DEFAULTS, ready, resolve, clean, levelOf, forClub, save, reclassify, typeFor, recentCounts, forget };
