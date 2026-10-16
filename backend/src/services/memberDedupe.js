// One person, one record: a club often ends up with two rows for the same player (typed in by
// the Host, then the player signs up or comes through a link with another phone). Rows with
// the same name (accents, case and spaces ignored) are merged automatically — history,
// sign-ups, matches, passes and the account all move to one row.
// They stay apart only when something says they are two people: two different accounts,
// two different phone numbers, birth dates / years, genders or DUPR IDs.
// Only rows the Host already accepted are merged (a waiting join request or a member under
// review keeps its own row until the Host decides).
const { supabase } = require('../supabase');
const memberLink = require('./memberLink');

const digits = (p) => String(p || '').replace(/\D/g, '').slice(-9) || null;
const yearOf = (m) => (m.birth_date ? Number(String(m.birth_date).slice(0, 4)) : m.birth_year || null);
const pending = (m) => !!m.join_requested || (!!m.user_id && !m.account_verified) || (m.review_until && new Date(m.review_until) > new Date());

// Anything that tells the two rows apart?
function differ(a, b) {
  if (a.user_id && b.user_id && a.user_id !== b.user_id) return 'account';
  if (digits(a.phone) && digits(b.phone) && digits(a.phone) !== digits(b.phone)) return 'phone';
  if (a.birth_date && b.birth_date && String(a.birth_date) !== String(b.birth_date)) return 'birth';
  if (yearOf(a) && yearOf(b) && yearOf(a) !== yearOf(b)) return 'birth';
  if (a.gender && b.gender && a.gender !== b.gender) return 'gender';
  if (a.dupr_id && b.dupr_id && String(a.dupr_id).toUpperCase() !== String(b.dupr_id).toUpperCase()) return 'dupr';
  return null;
}

// The row that stays: the one with an account, then the club member (not a guest), then the oldest.
const keeperOrder = (a, b) =>
  (!!b.user_id - !!a.user_id) ||
  ((b.member_type === 'fixed') - (a.member_type === 'fixed')) ||
  String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
  String(a.id).localeCompare(String(b.id));

// Pure: which rows merge into which. Returns [{ source, target }] in order.
function plan(members) {
  const groups = new Map();
  for (const m of members) {
    if (pending(m)) continue;
    const key = memberLink.nameKey(m.full_name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const out = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const left = [...rows].sort(keeperOrder);
    while (left.length > 1) {
      const keep = { ...left.shift() };
      for (let i = 0; i < left.length; ) {
        const other = left[i];
        if (differ(keep, other)) { i++; continue; }
        out.push({ source: other, target: keep.id });
        // what the kept row knows after the merge (fills its blanks)
        for (const k of ['phone', 'gender', 'birth_year', 'birth_date', 'dupr_id', 'user_id']) if (keep[k] == null && other[k] != null) keep[k] = other[k];
        left.splice(i, 1);
      }
    }
  }
  return out;
}

const last = new Map();
const EVERY_MS = Number(process.env.MEMBER_DEDUPE_MS || 60 * 1000);

// Merge the club's duplicates. Cheap to call often: runs at most once a minute per club
// unless `force`. Never throws (a failed merge is logged and the rows stay as they were).
async function dedupe(club, { force = false } = {}) {
  if (!club?.id) return [];
  const now = Date.now();
  if (!force && now - (last.get(club.id) || 0) < EVERY_MS) return [];
  last.set(club.id, now);
  try {
    const { data, error } = await supabase.from('club_members').select('*').eq('club_id', club.id).limit(5000);
    if (error) throw error;
    const done = [];
    for (const { source, target } of plan(data || [])) {
      try {
        await memberLink.mergeInto(club, source, target, { any: true });
        done.push({ merged: source.id, into: target, name: source.full_name });
      } catch (err) {
        console.error('auto merge failed', source.id, '→', target, err.code || err.message);
      }
    }
    return done;
  } catch (err) {
    console.error('dedupe failed', club.id, err.message);
    return [];
  }
}

module.exports = { dedupe, plan, differ };
