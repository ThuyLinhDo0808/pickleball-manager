// The name a club / community uses for a player: the name on their member record. The Host
// can set it like a nickname (Thành viên → sửa tên); it never changes the player's own
// profile, and other clubs / communities keep using the name the player chose. Host-side
// pages (kèo, trận, chuông, điều phối viên) show it; the player's own pages keep theirs.
const { supabase } = require('../supabase');

const memberOf = (p) => p?.source_club_member_id || p?.guest_member_id || null;

async function memberNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < list.length; i += 300) {
    const { data } = await supabase.from('club_members').select('id, full_name').in('id', list.slice(i, i + 300));
    for (const m of data || []) if (m.full_name) out.set(m.id, m.full_name);
  }
  return out;
}

// Kèo rows: `full_name` becomes the club's name for them; `account_name` keeps the name
// they signed up with when it differs (shown small, so the Host still recognises them).
async function onRows(rows) {
  if (!rows?.length) return rows;
  const names = await memberNames(rows.map(memberOf)).catch(() => new Map());
  for (const r of rows) {
    const n = names.get(memberOf(r));
    if (n && n !== r.full_name) {
      r.account_name = r.full_name;
      r.full_name = n;
    }
  }
  return rows;
}

// Matches with match_players → event_participants(full_name, source_club_member_id, guest_member_id).
async function onMatches(matches) {
  const parts = (matches || []).flatMap((m) => (m.match_players || []).map((mp) => mp.event_participants).filter(Boolean));
  if (!parts.length) return matches;
  const names = await memberNames(parts.map(memberOf)).catch(() => new Map());
  for (const p of parts) {
    const n = names.get(memberOf(p));
    if (n) p.full_name = n;
  }
  return matches;
}

module.exports = { onRows, onMatches, memberNames };
