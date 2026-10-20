// Liên hệ nhà phát triển: a Host asks for a paid feature that is not in the plans
// (Phân tích tài chính, Coach Manager, Tournament Manager). The Owner approves = switches the
// feature on for that Host (host_addons); the Owner can also switch any of them on / off by
// hand per Host. The plan then shows the pages instead of locking them (services/plan.js).
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { ADDONS, forgetPlan } = require('./plan');

const MIGRATION = '20261209090000_dev_requests.sql';
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
async function assertReady() {
  if (!(await ready())) throw fail(`Run migration ${MIGRATION} first.`, 409, 'migration_required');
}
const assertKind = (kind) => {
  if (!ADDONS.includes(kind)) throw fail(`kind must be one of ${ADDONS.join(', ')}.`, 400, 'bad_kind');
};

// ---- Host -----------------------------------------------------------------------------------

async function forHost(hostId) {
  if (!(await ready())) return { ready: false, addons: {}, requests: [] };
  const [{ data: rows, error }, { data: on }] = await Promise.all([
    supabase.from('dev_requests').select('id, kind, status, note, owner_note, created_at, decided_at').eq('host_id', hostId).order('created_at', { ascending: false }).limit(30),
    supabase.from('host_addons').select('addon, enabled').eq('host_id', hostId),
  ]);
  if (error) throw error;
  const addons = Object.fromEntries(ADDONS.map((a) => [a, !!(on || []).find((r) => r.addon === a && r.enabled)]));
  // The latest request of each feature (open, or the last answer).
  const latest = {};
  for (const r of rows || []) if (!latest[r.kind]) latest[r.kind] = r;
  return { ready: true, addons, requests: latest };
}

async function create(hostId, { kind, note, club_id: clubId } = {}, club = null) {
  await assertReady();
  assertKind(kind);
  const text = typeof note === 'string' ? note.trim().slice(0, 1000) : '';
  const { data: on } = await supabase.from('host_addons').select('enabled').eq('host_id', hostId).eq('addon', kind).maybeSingle();
  if (on?.enabled) throw fail('This feature is already on for you.', 409, 'already_on');
  const { data, error } = await supabase.from('dev_requests').insert({ host_id: hostId, club_id: club?.id || clubId || null, kind, note: text || null }).select().single();
  if (error?.code === '23505') throw fail('You already asked for this feature.', 409, 'already_open');
  if (error) throw error;
  require('./feedback').notifyFeedback({ message: `[Liên hệ nhà phát triển] Host đăng ký ${kind}${club?.name ? ` (${club.name})` : ''}${text ? `: ${text}` : ''}. Xem ở Trang quản trị → Tính năng theo Host.`, page: '/owner/addons' }).catch(() => {});
  return data;
}

async function cancel(hostId, kind) {
  await assertReady();
  assertKind(kind);
  const { data, error } = await supabase.from('dev_requests').update({ status: 'cancelled' }).eq('host_id', hostId).eq('kind', kind).eq('status', 'open').select('id');
  if (error) throw error;
  if (!data?.length) throw fail('Nothing to cancel.', 409, 'not_cancellable');
  return { ok: true };
}

// ---- Owner ----------------------------------------------------------------------------------

async function emails(ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase.from('users').select('id, email').in('id', ids);
  return new Map((data || []).map((u) => [u.id, u.email]));
}

// Requests (open first) and every Host that has a feature switched on.
async function listForOwner() {
  await assertReady();
  const [{ data: reqs, error }, { data: on, error: e2 }] = await Promise.all([
    supabase.from('dev_requests').select('*, clubs(name)').order('created_at', { ascending: false }).limit(300),
    supabase.from('host_addons').select('*').order('updated_at', { ascending: false }),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const mail = await emails([...new Set([...(reqs || []).map((r) => r.host_id), ...(on || []).map((r) => r.host_id)])]);
  const requests = (reqs || [])
    .map(({ clubs: c, ...r }) => ({ ...r, club_name: c?.name || null, host_email: mail.get(r.host_id) || null }))
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
  const hosts = new Map();
  for (const r of on || []) {
    if (!hosts.has(r.host_id)) hosts.set(r.host_id, { host_id: r.host_id, email: mail.get(r.host_id) || null, addons: Object.fromEntries(ADDONS.map((a) => [a, false])) });
    hosts.get(r.host_id).addons[r.addon] = !!r.enabled;
  }
  return { addons: ADDONS, requests, hosts: [...hosts.values()] };
}

// What a Host has switched on (the Owner's host page).
async function addonsOfHost(hostId) {
  await assertReady();
  const { data, error } = await supabase.from('host_addons').select('addon, enabled, updated_by, updated_at').eq('host_id', hostId);
  if (error) throw error;
  return Object.fromEntries(ADDONS.map((a) => [a, !!(data || []).find((r) => r.addon === a && r.enabled)]));
}

async function setAddon(hostId, addon, enabled, by, note) {
  await assertReady();
  assertKind(addon);
  const before = await addonsOfHost(hostId);
  const { error } = await supabase.from('host_addons').upsert({ host_id: hostId, addon, enabled: !!enabled, updated_by: by || null, updated_at: new Date().toISOString(), note: note ? String(note).slice(0, 500) : null }, { onConflict: 'host_id,addon' });
  if (error) throw error;
  forgetPlan(hostId);
  return { before: before[addon], after: !!enabled };
}

// approve = switch the feature on for the Host; reject (with a note the Host sees).
async function decide(id, action, { note } = {}, by) {
  await assertReady();
  const { data: row, error } = await supabase.from('dev_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) throw fail('Not found.', 404, 'not_found');
  if (row.status !== 'open') throw fail('This request was already answered.', 409, 'not_open');
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  if (action === 'reject' && !text) throw fail('Say why (the Host sees it).', 400, 'note_required');
  if (action === 'approve') await setAddon(row.host_id, row.kind, true, by, text || null);
  const { data, error: e2 } = await supabase.from('dev_requests').update({ status: action === 'approve' ? 'approved' : 'rejected', owner_note: text || null, decided_by: by || null, decided_at: new Date().toISOString() }).eq('id', id).select().single();
  if (e2) throw e2;
  return { before: row, after: data };
}

module.exports = { MIGRATION, ready, forHost, create, cancel, listForOwner, addonsOfHost, setAddon, decide };
