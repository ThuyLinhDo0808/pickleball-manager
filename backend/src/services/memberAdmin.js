// The Host's own work on the member list: add a person by hand, upload the member Excel
// (the same file "Xuất Excel" gives: new rows are added, known rows updated), and move a
// player to another club / community of the same owner (e.g. Series B → Series A).
// One person, one record: a phone (last 9 digits) or a DUPR ID already in the club means
// the person is there — adding them again is refused, an upload updates that row.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
const { assertMemberRoom } = require('./plan');

const fail = (message, status, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const phoneKey = (p) => {
  const d = normalizePhone(p || '');
  return d.length >= 9 ? d.slice(-9) : null;
};
const cleanDupr = (v) => {
  const s = String(v || '').trim().toUpperCase();
  return /^[0-9A-Z]{4,12}$/.test(s) ? s : null;
};
const GENDERS = ['male', 'female', 'other'];
const ymd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// A member of this club with the same phone or DUPR ID (not `exceptId`).
async function findSame(clubId, { phone, dupr_id: dupr }, exceptId = null) {
  const key = phoneKey(phone);
  const id = cleanDupr(dupr);
  if (!key && !id) return null;
  const or = [key ? `phone_key.eq.${key}` : null, id ? `dupr_id.eq.${id}` : null].filter(Boolean).join(',');
  let q = supabase.from('club_members').select('id, full_name, phone, dupr_id').eq('club_id', clubId).or(or).limit(2);
  if (exceptId) q = q.neq('id', exceptId);
  const { data } = await q;
  return (data || [])[0] || null;
}

// The fields a row of the member file can set (blanks never wipe what is there).
function fieldsOf(r) {
  const out = {};
  const name = String(r.full_name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (name) out.full_name = name;
  const phone = String(r.phone || '').trim().slice(0, 30);
  if (phone) out.phone = phone;
  if (GENDERS.includes(r.gender)) out.gender = r.gender;
  const birth = ymd(r.birth_date);
  if (birth) {
    out.birth_date = birth;
    out.birth_year = Number(birth.slice(0, 4));
  } else if (Number.isInteger(Number(r.birth_year)) && Number(r.birth_year) > 1900 && Number(r.birth_year) < 2100) out.birth_year = Number(r.birth_year);
  const joined = ymd(r.joined_on);
  if (joined) out.joined_on = joined;
  if (['fixed', 'guest'].includes(r.member_type)) out.member_type = r.member_type;
  if (['vip', 'standard'].includes(r.tier)) out.tier = r.tier;
  const district = String(r.district || '').trim().slice(0, 80);
  if (district) out.district = district;
  const notes = String(r.notes || '').trim().slice(0, 2000);
  if (notes) out.notes = notes;
  if (r.is_active === false) out.is_active = false;
  if (r.is_active === true) out.is_active = true;
  return out;
}

// Upload of the member file. rows: [{ id?, full_name, phone, gender, birth_date, member_type,
// tier, district, notes, dupr_id, joined_on, is_active }]. A row is matched by its member ID
// (the file's last column), else by phone / DUPR ID; else it is a new member.
async function importRows(club, rows, { dryRun = false } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw fail('The file has no rows.', 400, 'no_rows');
  if (rows.length > 1000) throw fail('At most 1000 rows per file.', 400, 'too_many_rows');
  const { data: members, error } = await supabase.from('club_members').select('id, full_name, phone, dupr_id, member_type, user_id').eq('club_id', club.id).limit(10000);
  if (error) throw error;
  const byId = new Map((members || []).map((m) => [m.id, m]));
  const byPhone = new Map((members || []).filter((m) => phoneKey(m.phone)).map((m) => [phoneKey(m.phone), m]));
  const byDupr = new Map((members || []).filter((m) => m.dupr_id).map((m) => [String(m.dupr_id).toUpperCase(), m]));
  const plan = { create: [], update: [], skip: [] };
  const seenFile = new Set();
  rows.forEach((r, i) => {
    const line = Number(r.line) || i + 2;
    const f = fieldsOf(r);
    const dupr = cleanDupr(r.dupr_id);
    if (r.dupr_id && !dupr) return plan.skip.push({ line, name: f.full_name || '', reason: 'bad_dupr_id' });
    const hit = (r.id && byId.get(r.id)) || (dupr && byDupr.get(dupr)) || (phoneKey(f.phone) && byPhone.get(phoneKey(f.phone))) || null;
    const key = hit ? `m:${hit.id}` : dupr ? `d:${dupr}` : phoneKey(f.phone) ? `p:${phoneKey(f.phone)}` : null;
    if (key && seenFile.has(key)) return plan.skip.push({ line, name: f.full_name || '', reason: 'twice_in_file' });
    if (key) seenFile.add(key);
    if (hit) {
      // Another member already has this DUPR ID: keep the rest, leave the ID.
      const owner = dupr && byDupr.get(dupr);
      plan.update.push({ line, id: hit.id, name: f.full_name || hit.full_name, fields: f, dupr: dupr && (!owner || owner.id === hit.id) ? dupr : null });
      return;
    }
    if (!f.full_name) return plan.skip.push({ line, name: '', reason: 'no_name' });
    plan.create.push({ line, name: f.full_name, fields: { member_type: 'fixed', ...f }, dupr });
  });
  const summary = { create: plan.create.length, update: plan.update.length, skip: plan.skip, rows: [...plan.create.map((x) => ({ line: x.line, name: x.name, action: 'create' })), ...plan.update.map((x) => ({ line: x.line, name: x.name, action: 'update' }))].sort((a, b) => a.line - b.line) };
  if (dryRun) return summary;

  const count = (type) => plan.create.filter((x) => x.fields.member_type === type).length;
  await assertMemberRoom(club, 'fixed', count('fixed'));
  await assertMemberRoom(club, 'guest', count('guest'));
  for (const u of plan.update) {
    const patch = { ...u.fields, ...(u.dupr ? { dupr_id: u.dupr } : {}) };
    if (Object.keys(patch).length) {
      const { error: e } = await supabase.from('club_members').update(patch).eq('id', u.id).eq('club_id', club.id);
      if (e) throw e;
    }
  }
  for (let i = 0; i < plan.create.length; i += 200) {
    const batch = plan.create.slice(i, i + 200).map((c) => ({ club_id: club.id, ...c.fields, ...(c.dupr ? { dupr_id: c.dupr } : {}) }));
    const { error: e } = await supabase.from('club_members').insert(batch);
    if (e) throw e;
  }
  // Ratings of the new / changed DUPR IDs from the club's DUPR list.
  const withDupr = [...plan.update, ...plan.create].filter((x) => x.dupr);
  if (withDupr.length) {
    const dupr = require('./dupr');
    const { data: fresh } = await supabase.from('club_members').select('id, dupr_id').eq('club_id', club.id).in('dupr_id', withDupr.map((x) => x.dupr));
    for (const m of fresh || []) await dupr.attachFromRoster(club, m.id).catch(() => {});
  }
  return summary;
}

// Move a player to another club / community of the same owner. The new record copies who
// they are (name, contact, account, DUPR, level, notes); the old one is set inactive with a
// note, so its history (sessions, matches, passes) stays where it happened.
async function transfer(club, member, toClubId, { member_type, keep_source = false, actor } = {}) {
  if (!toClubId || toClubId === club.id) throw fail('Pick another club / community.', 400, 'same_club');
  const { data: to } = await supabase.from('clubs').select('id, name, host_id, kind, sport').eq('id', toClubId).maybeSingle();
  if (!to || to.host_id !== club.host_id) throw fail('You can only move players between your own clubs / communities.', 403, 'not_yours');
  const type = ['fixed', 'guest'].includes(member_type) ? member_type : member.member_type === 'fixed' ? 'fixed' : 'guest';
  const dupr = cleanDupr(member.dupr_id);
  // Already there (same account, phone or DUPR ID)? Bring that record back instead.
  let target = null;
  if (member.user_id) target = (await supabase.from('club_members').select('*').eq('club_id', to.id).eq('user_id', member.user_id).maybeSingle()).data;
  if (!target) {
    const same = await findSame(to.id, { phone: member.phone, dupr_id: dupr });
    if (same) target = (await supabase.from('club_members').select('*').eq('id', same.id).single()).data;
  }
  const copy = {};
  for (const k of ['full_name', 'phone', 'gender', 'birth_date', 'birth_year', 'dupr_level', 'district', 'notes', 'flags']) if (member[k] != null) copy[k] = member[k];
  if (to.sport === (club.sport || 'pickleball')) {
    for (const k of ['dupr_doubles', 'dupr_singles', 'dupr_doubles_rel', 'dupr_singles_rel', 'dupr_synced_at']) if (member[k] != null) copy[k] = member[k];
  } else delete copy.dupr_level; // a pickleball level means nothing in badminton
  if (target) {
    if (target.member_type !== type) await assertMemberRoom(to, type, 1);
    const patch = { ...Object.fromEntries(Object.entries(copy).filter(([k]) => target[k] == null)), member_type: type, is_active: true, ...(type === 'guest' ? { tier: null } : {}) };
    if (member.user_id && !target.user_id) Object.assign(patch, { user_id: member.user_id, account_verified: true });
    if (dupr && !target.dupr_id) patch.dupr_id = dupr;
    const { data, error } = await supabase.from('club_members').update(patch).eq('id', target.id).select().single();
    if (error) throw error;
    target = data;
  } else {
    await assertMemberRoom(to, type, 1);
    const row = { club_id: to.id, ...copy, member_type: type, joined_on: new Date().toISOString().slice(0, 10), is_active: true };
    if (member.user_id) Object.assign(row, { user_id: member.user_id, account_verified: !!member.account_verified });
    if (dupr) row.dupr_id = dupr;
    let { data, error } = await supabase.from('club_members').insert(row).select().single();
    // Columns a database without the latest migrations does not have: try the basics.
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const basic = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('dupr_') || k === 'dupr_level' || k === 'dupr_id'));
      ({ data, error } = await supabase.from('club_members').insert(basic).select().single());
    }
    if (error) throw error;
    target = data;
  }
  if (!keep_source) {
    const note = `Đã chuyển sang ${to.name} (${new Date().toISOString().slice(0, 10)})`;
    const patch = { is_active: false, notes: [member.notes, note].filter(Boolean).join('\n').slice(0, 2000) };
    // The account now belongs to the new record: the old one keeps its history only.
    if (member.user_id) patch.user_id = null;
    const { error } = await supabase.from('club_members').update(patch).eq('id', member.id);
    if (error) throw error;
  }
  return { member: target, to: { id: to.id, name: to.name, kind: to.kind }, source_kept: !!keep_source };
}

module.exports = { findSame, importRows, transfer, fieldsOf, cleanDupr, phoneKey };
