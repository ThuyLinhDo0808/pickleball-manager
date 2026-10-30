// Xoá mềm thành viên: "Xoá" puts the person in the club's recently-deleted list for 30 days
// (club_members_all.deleted_at); the club_members view everyone reads leaves them out, so
// they vanish everywhere at once — with their passes, matches and history kept. "Khôi phục"
// brings them back as they were; after 30 days a sweep deletes them for good. Before the
// migration, "Xoá" deletes at once (the page then keeps its short undo).
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20270110090000_member_soft_delete.sql';
const KEEP_DAYS = 30;
const DAY = 86400000;
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
const fail = (message, status, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });

// -> { soft: true, restore_until } or { soft: false } (deleted for good).
async function remove(club, member, actor) {
  if (!(await ready())) {
    const { error } = await supabase.from('club_members').delete().eq('id', member.id);
    if (error) throw error;
    return { soft: false };
  }
  const at = new Date();
  const { error } = await supabase.from('club_members_all').update({ deleted_at: at.toISOString(), deleted_by: actor || null }).eq('id', member.id).eq('club_id', club.id);
  if (error) throw error;
  return { soft: true, restore_until: new Date(at.getTime() + KEEP_DAYS * DAY).toISOString() };
}

// The club's recently deleted members, newest first, with the days left to restore them.
async function list(club) {
  if (!(await ready())) return { ready: false, keep_days: KEEP_DAYS, items: [] };
  const since = new Date(Date.now() - KEEP_DAYS * DAY).toISOString();
  const { data, error } = await supabase
    .from('club_members_all')
    .select('id, full_name, member_type, phone, dupr_id, user_id, deleted_at, deleted_by')
    .eq('club_id', club.id)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', since)
    .order('deleted_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const now = Date.now();
  return {
    ready: true,
    keep_days: KEEP_DAYS,
    items: (data || []).map((m) => ({ ...m, has_account: !!m.user_id, user_id: undefined, days_left: Math.max(0, Math.ceil((new Date(m.deleted_at).getTime() + KEEP_DAYS * DAY - now) / DAY)) })),
  };
}

async function deletedRow(club, id) {
  const { data } = await supabase.from('club_members_all').select('*').eq('id', id).eq('club_id', club.id).not('deleted_at', 'is', null).maybeSingle();
  if (!data) throw fail('Not in the recently deleted list.', 404, 'not_found');
  return data;
}

// Bring someone back, as they were. Refused when their account / DUPR ID is on someone
// else on the list now (they joined again meanwhile) or the plan has no room.
async function restore(club, id) {
  if (!(await ready())) throw fail('Run the database update first.', 503, 'migration_missing');
  const m = await deletedRow(club, id);
  const clash = async (col, v) => (v ? (await supabase.from('club_members').select('id, full_name').eq('club_id', club.id).eq(col, v).limit(1)).data?.[0] : null);
  const other = (await clash('user_id', m.user_id)) || (await clash('dupr_id', m.dupr_id));
  if (other) throw fail(`${other.full_name} is on the list with the same account / DUPR ID.`, 409, 'clash', { member: other });
  if (m.is_active !== false && !m.join_requested) await require('./plan').assertMemberRoom(club, m.member_type === 'fixed' ? 'fixed' : 'guest', 1);
  const { data, error } = await supabase.from('club_members_all').update({ deleted_at: null, deleted_by: null }).eq('id', m.id).select().single();
  if (error) throw error;
  return data;
}

// "Xoá hẳn" now (owner), instead of waiting 30 days.
async function purge(club, id) {
  if (!(await ready())) throw fail('Run the database update first.', 503, 'migration_missing');
  const m = await deletedRow(club, id);
  const { error } = await supabase.from('club_members_all').delete().eq('id', m.id);
  if (error) throw error;
  return { ok: true };
}

// Everyone deleted more than 30 days ago goes for good (passes, matches… cascade).
async function sweep(now = Date.now()) {
  if (!(await ready())) return 0;
  const { data, error } = await supabase.from('club_members_all').delete().lt('deleted_at', new Date(now - KEEP_DAYS * DAY).toISOString()).select('id');
  if (error) throw error;
  return (data || []).length;
}
function startTrashSweeper(everyMs = 6 * 3600000) {
  const run = () => sweep().catch((err) => console.error('member trash sweep failed', err));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, everyMs).unref();
}

module.exports = { MIGRATION, KEEP_DAYS, ready, remove, list, restore, purge, sweep, startTrashSweeper };
