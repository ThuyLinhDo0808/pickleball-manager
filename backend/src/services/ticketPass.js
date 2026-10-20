// Pass vé: a player with a place gives it to someone on the waitlist — through the Host.
//   1. The player presses "Liên hệ pass vé" (open). Only when the kèo has a waitlist.
//   2. The Host calls people on the waitlist (the player does not contact them) and picks who
//      takes the ticket (matched). That person transfers the ticket price to the player.
//   3. The player confirms with the Host: screenshot of the money received + agrees to the
//      terms (proof_submitted).
//   4. The Host confirms (done): the player's ticket is cancelled without refund (they were
//      paid by the receiver), the receiver gets the place and a ticket. The Host's ledger does
//      not change — the fee was already paid once.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { todayYmd } = require('./memberships');

const MIGRATION = '20261202090000_ticket_pass.sql';
const LIVE = ['open', 'matched', 'proof_submitted'];
const MAX_PROOF = 400000;

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
async function assertReady() {
  if (!(await ready())) throw fail(`Run migration ${MIGRATION} first.`, 409, 'migration_required');
}

const feeOf = (event, p) => Number(p?.fee_amount ?? event.fee_amount ?? 0);
const started = (event) => event.event_date < todayYmd() || !['draft', 'open', 'closed'].includes(event.status);

async function participant(id) {
  const { data, error } = await supabase.from('event_participants').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
async function eventOf(id) {
  const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function livePass(fromId) {
  const { data, error } = await supabase.from('event_ticket_passes').select('*').eq('from_participant_id', fromId).in('status', LIVE).maybeSingle();
  if (error) throw error;
  return data;
}
async function waitlistCount(eventId) {
  const { count } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'waitlisted');
  return count || 0;
}

// What the player's page shows about their pass (null = none going on).
async function viewForPlayer(p) {
  if (!(await ready())) return null;
  const { data } = await supabase.from('event_ticket_passes').select('*').eq('from_participant_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || data.status === 'cancelled') return null;
  const to = data.to_participant_id ? await participant(data.to_participant_id) : null;
  return { id: data.id, status: data.status, amount: Number(data.amount), to_name: to?.full_name || null, host_note: data.host_note, has_proof: !!data.proof };
}

// 1. The ticket holder asks to pass their ticket.
async function request(p) {
  await assertReady();
  const event = await eventOf(p.event_id);
  if (started(event)) throw fail('This kèo has started or ended.', 409, 'event_over');
  if (p.status !== 'registered') throw fail('Only a confirmed place can be passed.', 409, 'not_registered');
  if (!(await waitlistCount(event.id))) throw fail('Nobody is on the waitlist to take it. You can cancel instead.', 409, 'no_waitlist');
  if (await livePass(p.id)) throw fail('You already asked to pass this ticket.', 409, 'already_asked');
  const { data, error } = await supabase.from('event_ticket_passes').insert({ event_id: event.id, from_participant_id: p.id, amount: feeOf(event, p) }).select().single();
  if (error) throw error;
  return data;
}

// 3. The ticket holder: "I got the money" — screenshot + terms.
async function submitProof(p, { image, accept_terms } = {}) {
  await assertReady();
  const pass = await livePass(p.id);
  if (!pass || !['matched', 'proof_submitted'].includes(pass.status)) throw fail('The Host has not picked who takes your ticket yet.', 409, 'not_matched');
  if (accept_terms !== true) throw fail('Please agree to the pass terms.', 400, 'terms_required');
  if (!(typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length <= MAX_PROOF)) throw fail('Upload a JPEG/PNG/WebP screenshot.', 400, 'bad_image');
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('event_ticket_passes').update({ proof: image, terms_accepted_at: now, submitted_at: now, status: 'proof_submitted', host_note: null }).eq('id', pass.id).select().single();
  if (error) throw error;
  return data;
}

async function cancelByPlayer(p) {
  await assertReady();
  const pass = await livePass(p.id);
  if (!pass) throw fail('No pass to cancel.', 404, 'not_found');
  const { error } = await supabase.from('event_ticket_passes').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', pass.id);
  if (error) throw error;
  return { ok: true };
}

// ---- Host ---------------------------------------------------------------------------------

// The kèo's passes going on, with who is on the waitlist to offer them to (names + phones:
// the Host calls them).
async function listForHost(event) {
  if (!(await ready())) return { ready: false, passes: [], waitlist: [] };
  const { data: passes, error } = await supabase.from('event_ticket_passes').select('id, from_participant_id, to_participant_id, status, amount, host_note, created_at, matched_at, submitted_at, decided_at, terms_accepted_at, proof').eq('event_id', event.id).order('created_at', { ascending: false });
  if (error) throw error;
  const ids = [...new Set((passes || []).flatMap((x) => [x.from_participant_id, x.to_participant_id]).filter(Boolean))];
  const { data: people } = ids.length ? await supabase.from('event_participants').select('id, full_name, phone, status').in('id', ids) : { data: [] };
  const byId = new Map((people || []).map((x) => [x.id, x]));
  const { data: wl } = await supabase.from('event_participants').select('id, full_name, phone, joined_at, priority').eq('event_id', event.id).eq('status', 'waitlisted').order('joined_at', { ascending: true });
  return {
    ready: true,
    passes: (passes || []).filter((x) => x.status !== 'cancelled').map(({ proof, ...x }) => ({ ...x, amount: Number(x.amount), has_proof: !!proof, from: byId.get(x.from_participant_id) || null, to: byId.get(x.to_participant_id) || null })),
    waitlist: (wl || []).sort((a, b) => Number(!!b.priority) - Number(!!a.priority)),
  };
}

async function passOf(event, passId) {
  await assertReady();
  const { data, error } = await supabase.from('event_ticket_passes').select('*').eq('id', passId).eq('event_id', event.id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Pass not found.', 404, 'not_found');
  return data;
}

// 2. The Host picks the waitlisted person who takes the ticket (after calling them).
async function match(event, passId, toId) {
  const pass = await passOf(event, passId);
  if (!['open', 'matched'].includes(pass.status)) throw fail('This pass is already further along.', 409, 'bad_state');
  const to = toId ? await participant(toId) : null;
  if (!to || to.event_id !== event.id || to.status !== 'waitlisted') throw fail('Pick someone on this kèo\'s waitlist.', 400, 'not_waitlisted');
  const { data, error } = await supabase.from('event_ticket_passes').update({ to_participant_id: to.id, status: 'matched', matched_at: new Date().toISOString() }).eq('id', pass.id).select().single();
  if (error) throw error;
  return data;
}

// The Host asks for another screenshot (back to "matched") or cancels the pass.
async function reject(event, passId, note) {
  const pass = await passOf(event, passId);
  if (pass.status !== 'proof_submitted') throw fail('Nothing to check yet.', 409, 'bad_state');
  const { data, error } = await supabase.from('event_ticket_passes').update({ status: 'matched', host_note: String(note || '').slice(0, 300) || null }).eq('id', pass.id).select().single();
  if (error) throw error;
  return data;
}
async function cancelByHost(event, passId) {
  const pass = await passOf(event, passId);
  if (!LIVE.includes(pass.status)) throw fail('This pass is closed.', 409, 'bad_state');
  const { error } = await supabase.from('event_ticket_passes').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', pass.id);
  if (error) throw error;
  return { ok: true };
}

async function proof(event, passId) {
  const pass = await passOf(event, passId);
  return { image: pass.proof || null };
}

// 4. The Host confirms: the ticket moves from the holder to the waitlisted person.
async function confirm(event, passId) {
  const pass = await passOf(event, passId);
  if (pass.status !== 'proof_submitted') throw fail('The ticket holder has not confirmed the money yet.', 409, 'bad_state');
  const from = await participant(pass.from_participant_id);
  const to = pass.to_participant_id ? await participant(pass.to_participant_id) : null;
  if (!from || from.status !== 'registered') throw fail('The ticket is no longer active.', 409, 'from_gone');
  if (!to || to.status !== 'waitlisted') throw fail('The receiver is no longer on the waitlist.', 409, 'to_gone');
  const now = new Date().toISOString();
  // The holder: cancelled, nothing to refund (the receiver paid them).
  const { error: e1 } = await supabase
    .from('event_participants')
    .update({ status: 'cancelled', cancelled_at: now, late_cancel: false, refund_percent: 0, cancel_reason: `Pass vé cho ${to.full_name}`.slice(0, 300), cancelled_by: 'player' })
    .eq('id', from.id);
  if (e1) throw e1;
  const { data: got, error: e2 } = await supabase
    .from('event_participants')
    .update({ status: 'registered', fee_paid: true, fee_amount: Number(pass.amount), payment_status: 'confirmed', hold_expires_at: null, payment_note: null, transferred_from: from.full_name })
    .eq('id', to.id)
    .select()
    .single();
  if (e2) throw e2;
  const { error: e3 } = await supabase.from('event_ticket_passes').update({ status: 'done', decided_at: now }).eq('id', pass.id);
  if (e3) throw e3;
  if (got.user_id) require('./notify').notifyPaymentConfirmed(event, got);
  return { ok: true, to: got };
}

module.exports = { MIGRATION, ready, viewForPlayer, request, submitProof, cancelByPlayer, listForHost, match, reject, cancelByHost, confirm, proof, started };
