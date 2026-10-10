// Handing everything an account runs to another account before it is deleted.
//
// An account that owns clubs or Xé Vé events cannot simply be deleted (the clubs and
// their members, money and history would go with it). The Host names the account that
// takes over; the app owner checks that this person is real and approves; then the clubs
// and Xé Vé events move over and the Host may delete their own account.
const { supabase } = require('../supabase');
const { forgetPlan } = require('./plan');

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

// What the account runs: its clubs and its Xé Vé (no-club) events.
async function ownedBy(userId) {
  const [{ data: clubs, error }, { count, error: e2 }] = await Promise.all([
    supabase.from('clubs').select('id, name').eq('host_id', userId).order('name'),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('host_id', userId).is('club_id', null),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  return { clubs: clubs || [], xeve_events: count || 0 };
}

// The account taking over, by email or username.
async function findAccount(login) {
  const v = String(login || '').trim().toLowerCase();
  if (!v) throw fail(400, 'Enter the email or username of the new owner.', 'to_required');
  const q = supabase.from('users').select('id, email, username, full_name');
  const { data, error } = await (v.includes('@') ? q.ilike('email', v) : q.ilike('username', v)).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(404, 'No account with that email or username. They must sign up first.', 'no_account');
  return data;
}

async function latest(userId) {
  const { data, error } = await supabase.from('account_handovers').select('*').eq('from_user', userId).order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return data[0] || null;
}

async function request(user, { to, note }) {
  const owned = await ownedBy(user.id);
  if (!owned.clubs.length && !owned.xeve_events) throw fail(400, 'You have no club or Xé Vé event to hand over.', 'nothing_to_handover');
  const target = await findAccount(to);
  if (target.id === user.id) throw fail(400, 'Choose another account.', 'self');
  const cur = await latest(user.id);
  if (cur?.status === 'pending') throw fail(409, 'A handover is already waiting for approval.', 'pending_exists');
  const { data, error } = await supabase
    .from('account_handovers')
    .insert({
      from_user: user.id,
      from_email: user.email || null,
      to_user: target.id,
      to_email: target.email,
      note: String(note || '').trim().slice(0, 1000) || null,
      clubs: owned.clubs,
      xeve_events: owned.xeve_events,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cancel(userId) {
  const { data, error } = await supabase
    .from('account_handovers')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('from_user', userId)
    .eq('status', 'pending')
    .select();
  if (error) throw error;
  if (!data.length) throw fail(404, 'No handover is waiting.', 'none');
  return data[0];
}

// Owner console: the requests, with what the owner needs to check the new owner is real.
async function list(status = 'pending') {
  let q = supabase.from('account_handovers').select('*').order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  const ids = [...new Set(data.flatMap((h) => [h.from_user, h.to_user]).filter(Boolean))];
  const [{ data: users }, { data: profs }, { data: subs }, { data: clubs }] = ids.length
    ? await Promise.all([
        supabase.from('users').select('id, email, username, full_name, created_at').in('id', ids),
        supabase.from('player_profiles').select('user_id, full_name, phone, birth_date').in('user_id', ids),
        supabase.from('host_subscriptions').select('host_id, tier, tier_paid_until').in('host_id', ids),
        supabase.from('clubs').select('id, host_id').in('host_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const person = (id) => {
    if (!id) return null;
    const u = (users || []).find((x) => x.id === id) || {};
    const p = (profs || []).find((x) => x.user_id === id) || {};
    const s = (subs || []).find((x) => x.host_id === id) || {};
    return {
      id,
      email: u.email || null,
      username: u.username || null,
      full_name: p.full_name || u.full_name || null,
      phone: p.phone || null,
      birth_date: p.birth_date || null,
      joined_at: u.created_at || null,
      tier: s.tier || null,
      clubs_owned: (clubs || []).filter((c) => c.host_id === id).length,
    };
  };
  return data.map((h) => ({ ...h, from: person(h.from_user), to: person(h.to_user) }));
}

async function loadPending(id) {
  const { data, error } = await supabase.from('account_handovers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(404, 'Handover not found.', 'not_found');
  if (data.status !== 'pending') throw fail(409, 'This handover was already decided.', 'decided');
  return data;
}

// Approve: every club and Xé Vé event the account runs now moves to the new owner.
async function approve(id, actor, note) {
  const h = await loadPending(id);
  if (!h.from_user || !h.to_user) throw fail(409, 'One of the two accounts no longer exists.', 'account_gone');
  const owned = await ownedBy(h.from_user);
  for (const c of owned.clubs) {
    const { error } = await supabase.rpc('owner_transfer_club', { p_club: c.id, p_new_host: h.to_user });
    if (error) throw error;
  }
  const { data: evs, error: eErr } = await supabase.from('events').select('id').eq('host_id', h.from_user).is('club_id', null);
  if (eErr) throw eErr;
  const evIds = evs.map((e) => e.id);
  if (evIds.length) {
    for (const [table, col] of [['events', 'id'], ['transactions', 'event_id'], ['staff_grants', 'event_id']]) {
      const { error } = await supabase.from(table).update({ host_id: h.to_user }).in(col, evIds);
      if (error) throw error;
    }
  }
  // The Xé Vé ball store goes along.
  const { error: iErr } = await supabase.from('inventory_items').update({ host_id: h.to_user }).eq('host_id', h.from_user).is('club_id', null);
  if (iErr) throw iErr;
  forgetPlan(h.from_user);
  forgetPlan(h.to_user);
  const { data, error } = await supabase
    .from('account_handovers')
    .update({ status: 'approved', owner_note: String(note || '').trim().slice(0, 1000) || null, decided_by: actor, decided_at: new Date().toISOString(), clubs: owned.clubs, xeve_events: evIds.length })
    .eq('id', h.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function reject(id, actor, note) {
  await loadPending(id);
  const reason = String(note || '').trim();
  if (!reason) throw fail(400, 'Write the reason (the account sees it).', 'reason_required');
  const { data, error } = await supabase
    .from('account_handovers')
    .update({ status: 'rejected', owner_note: reason.slice(0, 1000), decided_by: actor, decided_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = { ownedBy, findAccount, latest, request, cancel, list, approve, reject };
