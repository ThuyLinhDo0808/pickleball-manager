// "To review" (Xem xét thêm): a club member who behaved badly is suspended for some days
// or months, then the Host brings them back (fixed / guest / waiting list) or removes
// them, optionally blocking them from the club's events (or all of the Host's events,
// Xé Vé included). The player sees each step on screen (player_notices). Every step is
// written to member_moderation_log, which is never edited and outlives the member, the
// account and a change of club owner — so whoever runs the club later sees that someone
// asking to join was removed before, and why.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');

const MIGRATION = '20261105090000_member_moderation_invites.sql';
const fail = (message, status = 400, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const text = (v, max = 500) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

async function ready() {
  const s = await require('./schemaCheck').schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

// Where the member sits now: fixed / guest / waiting (a join request not yet approved).
const placeOf = (m) => (m.join_requested && m.member_type === 'fixed' && !m.account_verified ? 'waiting' : m.member_type === 'guest' ? 'guest' : 'fixed');
const inReview = (m) => !!m.review_started_at;

// How long: { days } or { months } (whole numbers), at most a year.
function untilFrom({ days, months }) {
  const d = Number(days) || 0;
  const mo = Number(months) || 0;
  if (!(Number.isInteger(d) && Number.isInteger(mo)) || d < 0 || mo < 0 || (!d && !mo) || d > 366 || mo > 12) {
    throw fail('Choose how long: 1–366 days or 1–12 months.', 400, 'bad_duration');
  }
  const until = new Date();
  if (mo) until.setMonth(until.getMonth() + mo);
  if (d) until.setDate(until.getDate() + d);
  return until.toISOString();
}

async function log(club, m, entry, actor) {
  const { error } = await supabase.from('member_moderation_log').insert({
    club_id: club.id,
    member_id: m.id,
    user_id: m.user_id || null,
    phone: m.phone || null,
    full_name: m.full_name,
    actor_email: actor || null,
    ...entry,
  });
  if (error) throw error;
}

// The player hears about it on screen (only members linked to an account).
async function notify(club, m, kind, extra = {}) {
  if (!m.user_id) return;
  const { error } = await supabase.from('player_notices').insert({ user_id: m.user_id, club_id: club.id, club_name: club.name, kind, ...extra });
  if (error) console.error('player notice failed', error);
}

// Move a member to "to review": reason + how long they may not join the club's events.
async function review(club, m, body, actor) {
  if (inReview(m)) throw fail('This member is already under review.', 409, 'already_in_review');
  const reason = text(body.reason);
  if (!reason) throw fail('Write the reason.', 400, 'reason_required');
  const until = untilFrom(body);
  const from = placeOf(m);
  const { data, error } = await supabase
    .from('club_members')
    .update({ review_started_at: new Date().toISOString(), review_until: until, review_reason: reason, review_from: from })
    .eq('id', m.id)
    .select()
    .single();
  if (error) throw error;
  await log(club, m, { action: 'review', reason, until, from_type: from, to_type: 'review' }, actor);
  await notify(club, m, 'warning', { reason, until });
  return data;
}

// Back from review: as an official member, a guest, or into the waiting list.
async function restore(club, m, body, actor) {
  if (!inReview(m)) throw fail('This member is not under review.', 409, 'not_in_review');
  const to = ['fixed', 'guest', 'waiting'].includes(body.to) ? body.to : m.review_from || 'guest';
  if (to !== 'waiting') {
    const from = placeOf(m);
    await require('./plan').assertMemberRoom(club, to, from === to ? 0 : 1);
  }
  const patch = { review_started_at: null, review_until: null, review_reason: null, review_from: null };
  if (to === 'waiting') Object.assign(patch, { member_type: 'fixed', join_requested: true, account_verified: false, join_source: 'manual', join_requested_at: new Date().toISOString() });
  else Object.assign(patch, { member_type: to, join_requested: false, ...(to === 'guest' ? { tier: null } : {}), ...(m.user_id ? { account_verified: true } : {}) });
  const { data, error } = await supabase.from('club_members').update(patch).eq('id', m.id).select().single();
  if (error) throw error;
  await log(club, m, { action: 'restore', reason: text(body.note), from_type: 'review', to_type: to }, actor);
  await notify(club, m, 'restored', { reason: text(body.note) });
  return data;
}

// Remove from the club (the record goes; the history stays), optionally blocking them.
async function remove(club, m, body, actor) {
  const reason = text(body.reason);
  if (!reason) throw fail('Write the reason.', 400, 'reason_required');
  const scope = body.block_scope === 'all' ? 'all' : 'club';
  const block = !!body.block;
  await log(club, m, { action: 'remove', reason, from_type: inReview(m) ? 'review' : placeOf(m), to_type: 'removed', blocked: block, block_scope: block ? scope : null }, actor);
  if (block) {
    const { error } = await supabase.from('member_blocks').insert({
      host_id: club.host_id,
      club_id: club.id, // the club it came from (it stays with the club if the owner changes)
      scope,
      user_id: m.user_id || null,
      phone: m.phone || null,
      full_name: m.full_name,
      reason,
      created_by: actor || null,
    });
    if (error) throw error;
  }
  await notify(club, m, 'removed', { reason, blocked: block });
  const { error } = await supabase.from('club_members').delete().eq('id', m.id);
  if (error) throw error;
  return { removed: true, blocked: block };
}

// Blocks that apply to a club: made in this club (whoever owned it then), and the
// current owner's "all my events" ones from their other clubs.
async function blocksOf(club) {
  const { data, error } = await supabase
    .from('member_blocks')
    .select('*')
    .is('lifted_at', null)
    .or(`club_id.eq.${club.id},and(scope.eq.all,host_id.eq.${club.host_id})`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function unblock(club, blockId, actor) {
  const { data: b } = await supabase.from('member_blocks').select('*').eq('id', blockId).is('lifted_at', null).maybeSingle();
  if (!b || !(b.club_id === club.id || (b.scope === 'all' && b.host_id === club.host_id))) throw fail('Block not found.', 404, 'not_found');
  const { error } = await supabase.from('member_blocks').update({ lifted_at: new Date().toISOString(), lifted_by: actor || null }).eq('id', b.id);
  if (error) throw error;
  await log(club, { id: null, user_id: b.user_id, phone: b.phone, full_name: b.full_name }, { action: 'unblock', reason: b.reason, block_scope: b.scope }, actor);
  return { lifted: true };
}

// The club's whole moderation history (newest first).
async function history(club, { page = 1, size = 50 } = {}) {
  const from = (Math.max(1, page) - 1) * size;
  const { data, error, count } = await supabase
    .from('member_moderation_log')
    .select('*', { count: 'exact' })
    .eq('club_id', club.id)
    .order('created_at', { ascending: false })
    .range(from, from + size - 1);
  if (error) throw error;
  return { rows: data || [], total: count || 0, page, pages: Math.max(1, Math.ceil((count || 0) / size)) };
}

const samePerson = (row, p) => (p.user_id && row.user_id === p.user_id) || (normalizePhone(p.phone).length >= 9 && normalizePhone(row.phone) === normalizePhone(p.phone));

// For each person ({ key, user_id, phone }): their past in this club (removed, reviewed…)
// and whether they are blocked now. Shown next to join requests.
async function pastOf(club, people) {
  if (!people.length || !(await ready())) return {};
  const [{ data: rows }, blocks] = await Promise.all([
    supabase.from('member_moderation_log').select('action, reason, until, created_at, user_id, phone, blocked, block_scope').eq('club_id', club.id).order('created_at', { ascending: false }).limit(2000),
    blocksOf(club),
  ]);
  const out = {};
  for (const p of people) {
    const mine = (rows || []).filter((r) => samePerson(r, p));
    const block = blocks.find((b) => samePerson(b, p)) || null;
    if (mine.length || block) out[p.key] = { history: mine.slice(0, 10), blocked: block ? { reason: block.reason, scope: block.scope, since: block.created_at } : null };
  }
  return out;
}

// Before a player signs up for an event: blocked, or still under review in that club?
async function assertCanJoin(event, { userId = null, phone = null } = {}) {
  if (!(await ready())) return;
  const person = { user_id: userId, phone };
  let q = supabase.from('member_blocks').select('*').is('lifted_at', null);
  q = event.club_id ? q.or(`club_id.eq.${event.club_id},and(scope.eq.all,host_id.eq.${event.host_id})`) : q.eq('scope', 'all').eq('host_id', event.host_id);
  const { data: blocks } = await q;
  const hit = (blocks || []).find((b) => samePerson(b, person));
  if (hit) throw fail('You cannot sign up for events of this club.', 403, 'club_blocked', { reason: hit.reason });
  if (!event.club_id) return;
  const { data: members } = await supabase.from('club_members').select('user_id, phone, review_until, review_reason').eq('club_id', event.club_id).not('review_started_at', 'is', null);
  const m = (members || []).find((x) => samePerson(x, person));
  if (m && m.review_until && new Date(m.review_until) > new Date()) {
    throw fail('You are suspended from this club for now.', 403, 'club_suspended', { reason: m.review_reason, until: m.review_until });
  }
}

// ---- the player's notices -----------------------------------------------------------------

async function noticesFor(userId, { unreadOnly = false } = {}) {
  if (!(await ready())) return [];
  let q = supabase.from('player_notices').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
  if (unreadOnly) q = q.is('read_at', null);
  const { data } = await q;
  return data || [];
}

async function markRead(userId, id) {
  const { error } = await supabase.from('player_notices').update({ read_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id).is('read_at', null);
  if (error) throw error;
  return { ok: true };
}

module.exports = { MIGRATION, ready, placeOf, review, restore, remove, blocksOf, unblock, history, pastOf, assertCanJoin, noticesFor, markRead };
