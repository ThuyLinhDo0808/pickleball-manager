// Joining a player account to a member the Host typed in by hand, when the phone numbers
// don't match (no phone saved, a wrong number, a shared phone):
//  * a personal link for one member — whoever opens it and signs in becomes that member
//    (only a hash of the link is stored; one use; it expires);
//  * the Host names an account (username or email) — that player confirms or declines;
//  * merging a "join request" row into the member the Host already had, so one person
//    never ends up as two rows.
// Becoming a member needs a confirmed email, like every other way in.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { blanksFrom, phoneLinkReady } = require('./phoneLink');

const MIGRATION = '20261122090000_member_account_link.sql';
const LINK_DAYS = 7;
const REQUEST_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const nowIso = () => new Date().toISOString();

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

async function assertReady() {
  if (!(await ready())) throw fail(`Run migration ${MIGRATION} first.`, 409, 'migration_required');
}

// "Nguyễn Văn  An" -> "nguyen van an": names compared without accents, case or extra spaces.
function nameKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Same person by name? Equal names, or one ends with the other (at least two words: the
// Host often types "Văn An" for "Nguyễn Văn An"). Different birth years rule it out.
function looksLike(a, b) {
  const x = nameKey(a.full_name);
  const y = nameKey(b.full_name);
  if (!x || !y) return false;
  if (a.birth_year && b.birth_year && Number(a.birth_year) !== Number(b.birth_year)) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.split(' ').length >= 2 && (long.endsWith(` ${short}`) || long.startsWith(`${short} `));
}

// A row waiting for the Host: a join request, or an account linked but not yet confirmed.
const pending = (m) => !!m && !m.account_verified;

function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return null;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

function assertLinkable(member) {
  if (member.user_id && member.account_verified) throw fail('This member is already linked to an account.', 409, 'already_linked');
}

// Close the member's open links / requests (a new one replaces them).
async function revoke(memberId, kind) {
  let q = supabase
    .from('member_link_invites')
    .update({ expires_at: nowIso() })
    .eq('club_member_id', memberId)
    .is('used_at', null)
    .is('declined_at', null)
    .gt('expires_at', nowIso());
  if (kind) q = q.eq('kind', kind);
  const { error } = await q;
  if (error) throw error;
}

// What the member page shows: the open link (when it ends) and the last request.
async function status(member) {
  await assertReady();
  const { data, error } = await supabase
    .from('member_link_invites')
    .select('id, kind, created_at, expires_at, used_at, declined_at, target_user_id, users:target_user_id(username, email)')
    .eq('club_member_id', member.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  const now = Date.now();
  const open = (r) => !r.used_at && !r.declined_at && new Date(r.expires_at).getTime() > now;
  const link = (data || []).find((r) => r.kind === 'link' && open(r));
  const req = (data || []).find((r) => r.kind === 'request');
  return {
    linked: !!(member.user_id && member.account_verified),
    link: link ? { created_at: link.created_at, expires_at: link.expires_at } : null,
    request: req
      ? {
          username: req.users?.username || null,
          email: maskEmail(req.users?.email),
          created_at: req.created_at,
          expires_at: req.expires_at,
          state: req.used_at ? 'accepted' : req.declined_at ? 'declined' : open(req) ? 'pending' : 'expired',
        }
      : null,
  };
}

// 1) A personal link. The token is shown once; only its hash is kept.
async function createLink(club, member, by) {
  await assertReady();
  assertLinkable(member);
  await revoke(member.id, 'link');
  const token = crypto.randomBytes(24).toString('base64url');
  const expires_at = new Date(Date.now() + LINK_DAYS * DAY).toISOString();
  const { error } = await supabase
    .from('member_link_invites')
    .insert({ club_id: club.id, club_member_id: member.id, kind: 'link', token_hash: hash(token), created_by: by || null, expires_at });
  if (error) throw error;
  return { token, path: `/claim/${token}`, expires_at };
}

async function cancel(member) {
  await assertReady();
  await revoke(member.id);
  return { ok: true };
}

async function findAccount(login) {
  const q = String(login || '').trim().toLowerCase();
  if (!q) throw fail('Type a username or email.', 400, 'login_required');
  const col = q.includes('@') ? 'email' : 'username';
  const { data, error } = await supabase.from('users').select('id, username, email').eq(col, q).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('No account with this username or email.', 404, 'account_not_found');
  return data;
}

// 2) The Host names the account; the player confirms on their side.
async function requestByLogin(club, member, login, by) {
  await assertReady();
  assertLinkable(member);
  const user = await findAccount(login);
  if (user.id === club.host_id) throw fail('This is the club owner.', 409, 'own_club');
  const { data: other, error: oErr } = await supabase.from('club_members').select('id, full_name, account_verified, user_id').eq('club_id', club.id).eq('user_id', user.id).maybeSingle();
  if (oErr) throw oErr;
  if (other && other.id !== member.id && !pending(other)) throw fail('This account is already another member of the club.', 409, 'already_member');
  await revoke(member.id, 'request');
  const expires_at = new Date(Date.now() + REQUEST_DAYS * DAY).toISOString();
  const { error } = await supabase
    .from('member_link_invites')
    .insert({ club_id: club.id, club_member_id: member.id, kind: 'request', target_user_id: user.id, created_by: by || null, expires_at });
  if (error) throw error;
  const { data: profile } = await supabase.from('player_profiles').select('full_name').eq('user_id', user.id).maybeSingle();
  return { username: user.username, email: maskEmail(user.email), name: profile?.full_name || null, expires_at };
}

// Move everything that points at `source` to `target`, then drop `source` (DB function).
async function mergeRows(source, target) {
  const free = { user_id: null };
  if (source.dupr_id) free.dupr_id = null; // one DUPR ID per club
  const { error: fErr } = await supabase.from('club_members').update(free).eq('id', source.id);
  if (fErr) throw fErr;
  const { error } = await supabase.rpc('merge_club_member', { p_source: source.id, p_target: target.id });
  if (error) {
    await supabase.from('club_members').update({ user_id: source.user_id, ...(source.dupr_id ? { dupr_id: source.dupr_id } : {}) }).eq('id', source.id);
    throw error;
  }
}

// Join the account to the member (shared by the personal link and the confirmed request).
async function attach(invite, userId) {
  await require('./emailVerify').assertVerified(userId); // no rights before the email is confirmed
  const { data: member, error } = await supabase.from('club_members').select('*').eq('id', invite.club_member_id).maybeSingle();
  if (error) throw error;
  if (!member) throw fail('This member no longer exists.', 404, 'not_found');
  if (member.user_id && member.user_id !== userId) throw fail('This member is linked to another account.', 409, 'taken');
  const { data: club, error: cErr } = await supabase.from('clubs').select('id, name, host_id, sport').eq('id', member.club_id).single();
  if (cErr) throw cErr;
  if (club.host_id === userId) throw fail('This is your own club.', 409, 'own_club');

  // Already in this club under another row: a waiting one is merged in; a real one stops here.
  const { data: other, error: oErr } = await supabase.from('club_members').select('*').eq('club_id', club.id).eq('user_id', userId).neq('id', member.id).maybeSingle();
  if (oErr) throw oErr;
  if (other) {
    if (!pending(other)) throw fail('You are already a member of this club.', 409, 'already_member');
    await mergeRows(other, member);
  }

  const { data: profile } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  const patch = { user_id: userId, account_verified: true, ...blanksFrom(member, profile, club.sport) };
  if (!member.phone && profile?.phone) patch.phone = profile.phone; // so the phone link works from now on
  if (await phoneLinkReady()) patch.unlinked_user_id = null;
  const { error: uErr } = await supabase.from('club_members').update(patch).eq('id', member.id);
  if (uErr) throw uErr;
  const { error: iErr } = await supabase.from('member_link_invites').update({ used_at: nowIso(), used_by: userId }).eq('id', invite.id);
  if (iErr) throw iErr;
  await revoke(member.id);
  return { club_id: club.id, club_name: club.name, member_id: member.id };
}

async function inviteByToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) throw fail('Link not found.', 404, 'not_found');
  const { data, error } = await supabase.from('member_link_invites').select('*').eq('token_hash', hash(token)).eq('kind', 'link').maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Link not found.', 404, 'not_found');
  return data;
}

function stateOf(invite) {
  if (invite.used_at) return 'used';
  if (invite.declined_at || new Date(invite.expires_at).getTime() <= Date.now()) return 'expired';
  return 'ok';
}

// Public view of a personal link: the club and the member's name (nothing else).
async function peek(token) {
  await assertReady();
  const invite = await inviteByToken(token);
  const [{ data: club }, { data: member }] = await Promise.all([
    supabase.from('clubs').select('id, name, sport, kind').eq('id', invite.club_id).maybeSingle(),
    supabase.from('club_members').select('full_name, user_id, account_verified').eq('id', invite.club_member_id).maybeSingle(),
  ]);
  if (!club || !member) throw fail('Link not found.', 404, 'not_found');
  const state = stateOf(invite);
  return { club, member_name: member.full_name, state: state === 'ok' && member.user_id && member.account_verified ? 'used' : state, expires_at: invite.expires_at };
}

async function claim(token, userId) {
  await assertReady();
  const invite = await inviteByToken(token);
  const state = stateOf(invite);
  if (state === 'used') throw fail('This link has already been used.', 410, 'link_used');
  if (state !== 'ok') throw fail('This link has expired. Ask the club for a new one.', 410, 'link_expired');
  return attach(invite, userId);
}

// Requests waiting for this player's answer.
async function pendingFor(userId) {
  if (!(await ready())) return [];
  const { data, error } = await supabase
    .from('member_link_invites')
    .select('id, club_id, club_member_id, created_at, expires_at, clubs(id, name, sport), club_members(full_name)')
    .eq('target_user_id', userId)
    .eq('kind', 'request')
    .is('used_at', null)
    .is('declined_at', null)
    .gt('expires_at', nowIso())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, club: r.clubs, member_name: r.club_members?.full_name || null, created_at: r.created_at, expires_at: r.expires_at }));
}

async function answer(userId, id, accept) {
  await assertReady();
  const { data: invite, error } = await supabase.from('member_link_invites').select('*').eq('id', id).eq('target_user_id', userId).eq('kind', 'request').maybeSingle();
  if (error) throw error;
  if (!invite || stateOf(invite) !== 'ok') throw fail('This request is no longer open.', 410, 'link_expired');
  if (!accept) {
    const { error: dErr } = await supabase.from('member_link_invites').update({ declined_at: nowIso() }).eq('id', invite.id);
    if (dErr) throw dErr;
    return { declined: true };
  }
  return attach(invite, userId);
}

// 4) Join requests that look like a member the Host typed in (not linked yet).
async function matchesFor(clubId, requests) {
  const asking = requests.filter((r) => r.user_id && !r.account_verified);
  if (!asking.length) return {};
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, birth_year, member_type, joined_on')
    .eq('club_id', clubId)
    .is('user_id', null)
    .eq('join_requested', false);
  if (error) throw error;
  const out = {};
  for (const r of asking) {
    const hits = (data || []).filter((m) => looksLike(m, r) || (r.account_name && looksLike(m, { ...r, full_name: r.account_name })));
    if (hits.length) out[r.id] = hits.slice(0, 5);
  }
  return out;
}

// The Host merges a waiting request (`source`) into the member they already had.
async function mergeInto(club, source, targetId) {
  await assertReady();
  if (!source.user_id || source.account_verified) throw fail('Only a waiting request with an account can be merged.', 400, 'not_pending');
  if (!targetId || targetId === source.id) throw fail('Pick the member to merge into.', 400, 'target_required');
  const { data: target, error } = await supabase.from('club_members').select('*').eq('id', targetId).eq('club_id', club.id).maybeSingle();
  if (error) throw error;
  if (!target) throw fail('Member not found.', 404, 'not_found');
  if (target.user_id && target.user_id !== source.user_id) throw fail('That member is linked to another account.', 409, 'taken');
  const fill = {};
  for (const k of ['phone', 'gender', 'birth_year', 'birth_date', 'dupr_level', 'dupr_id']) {
    if (target[k] == null && source[k] != null) fill[k] = source[k];
  }
  await mergeRows(source, target);
  const patch = { ...fill, user_id: source.user_id, account_verified: true };
  if (await phoneLinkReady()) patch.unlinked_user_id = null;
  const { data, error: uErr } = await supabase.from('club_members').update(patch).eq('id', target.id).select().single();
  if (uErr) throw uErr;
  await revoke(target.id);
  return data;
}

module.exports = { ready, MIGRATION, status, createLink, cancel, requestByLogin, peek, claim, pendingFor, answer, matchesFor, mergeInto, nameKey, looksLike };
