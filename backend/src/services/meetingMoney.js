// A club meeting's own cash box (events.kind = 'meeting'): who came (votes), what each
// person transferred or sponsored, guests a member brings (one more share of the fee
// each, charged to the inviter), what was spent, and how the result was settled.
const { supabase } = require('../supabase');

const num = (v) => Number(v || 0);
// Shares are rounded up to the next 1.000đ.
const roundUp = (v) => Math.ceil(v / 1000) * 1000;

async function load(event) {
  const [members, votes, money, guests, expenses] = await Promise.all([
    supabase.from('club_members').select('id, full_name, member_type, is_active').eq('club_id', event.club_id).order('full_name'),
    supabase.from('event_votes').select('club_member_id, choice').eq('event_id', event.id),
    supabase.from('meeting_money').select('*').eq('event_id', event.id),
    supabase.from('meeting_guests').select('*').eq('event_id', event.id).order('created_at'),
    supabase.from('meeting_expenses').select('*').eq('event_id', event.id).order('created_at'),
  ]);
  for (const r of [members, votes, money, guests, expenses]) if (r.error) throw r.error;
  return { members: members.data, votes: votes.data, money: money.data, guests: guests.data, expenses: expenses.data };
}

// Everything the meeting page shows, with the sums.
async function summary(event) {
  const d = await load(event);
  const vote = new Map(d.votes.map((v) => [v.club_member_id, v.choice]));
  const money = new Map(d.money.map((m) => [m.club_member_id, m]));
  const guestsOf = (id) => d.guests.filter((g) => g.invited_by === id).length;
  const settlement = event.meeting_settlement || null;
  const extra = settlement?.mode === 'split' ? num(settlement.per_person) : 0;
  const fee = num(event.fee_amount);
  const name = new Map(d.members.map((m) => [m.id, m.full_name]));

  const rows = d.members
    .filter((m) => m.is_active || vote.has(m.id) || money.has(m.id) || guestsOf(m.id))
    .map((m) => {
      const coming = vote.get(m.id) === 'yes';
      const guests = guestsOf(m.id);
      const shares = coming || guests ? (coming ? 1 : 0) + guests : 0;
      return {
        club_member_id: m.id,
        full_name: m.full_name,
        member_type: m.member_type,
        choice: vote.get(m.id) || null,
        guests,
        due: shares * (fee + extra),
        paid_amount: num(money.get(m.id)?.paid_amount),
        sponsor_amount: num(money.get(m.id)?.sponsor_amount),
      };
    });
  const order = (r) => (r.choice === 'yes' ? 0 : r.guests || r.paid_amount || r.sponsor_amount ? 1 : r.choice === 'no' ? 3 : 2);
  rows.sort((a, b) => order(a) - order(b) || a.full_name.localeCompare(b.full_name, 'vi'));

  const paid = rows.reduce((s, r) => s + r.paid_amount, 0);
  const sponsor = rows.reduce((s, r) => s + r.sponsor_amount, 0);
  const spent = d.expenses.reduce((s, e) => s + num(e.amount), 0);
  const headcount = rows.filter((r) => r.choice === 'yes').length + d.guests.length;
  return {
    fee,
    extra_per_person: extra,
    rows,
    guests: d.guests.map((g) => ({ ...g, inviter_name: name.get(g.invited_by) || '?' })),
    expenses: d.expenses.map((e) => ({ ...e, amount: num(e.amount) })),
    settlement,
    totals: {
      headcount,
      due: rows.reduce((s, r) => s + r.due, 0),
      paid,
      sponsor,
      collected: paid + sponsor,
      spent,
      balance: paid + sponsor - spent,
      outstanding: rows.reduce((s, r) => s + Math.max(0, r.due - r.paid_amount), 0),
    },
  };
}

async function setMoney(eventId, memberId, patch) {
  const { data: prior } = await supabase.from('meeting_money').select('*').eq('event_id', eventId).eq('club_member_id', memberId).maybeSingle();
  const row = {
    event_id: eventId,
    club_member_id: memberId,
    paid_amount: 'paid_amount' in patch ? patch.paid_amount : num(prior?.paid_amount),
    sponsor_amount: 'sponsor_amount' in patch ? patch.sponsor_amount : num(prior?.sponsor_amount),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('meeting_money').upsert(row, { onConflict: 'event_id,club_member_id' });
  if (error) throw error;
}

function httpError(message, status = 400, code) {
  return Object.assign(new Error(message), { status, code });
}

// Settle the result. Surplus -> income in the club fund. Deficit -> one member sponsors
// it, the club fund pays it, or everyone who came pays an equal extra share.
async function settle(event, hostId, { mode, member_id: memberId }) {
  const s = await summary(event);
  const bal = s.totals.balance;
  const cur = event.meeting_settlement;
  if (cur && cur.mode !== 'split') throw httpError('Already settled — undo it first.', 409, 'settled');
  const ledger = async (type, amount, note) => {
    const { data, error } = await supabase
      .from('transactions')
      .insert({ host_id: hostId, owner_type: 'club', club_id: event.club_id, type, category: 'meeting', amount, note, occurred_on: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  };
  let next;
  if (mode === 'to_fund') {
    if (bal <= 0) throw httpError('Nothing left over to move into the fund.', 409, 'no_surplus');
    next = { mode, amount: bal, txn_id: await ledger('income', bal, `Số dư "${event.title}" chuyển vào quỹ`) };
  } else {
    if (bal >= 0) throw httpError('There is no shortfall to cover.', 409, 'no_deficit');
    const deficit = -bal;
    if (mode === 'from_fund') {
      next = { mode, amount: deficit, txn_id: await ledger('expense', deficit, `Quỹ bù thiếu "${event.title}"`) };
    } else if (mode === 'sponsor') {
      const row = s.rows.find((r) => r.club_member_id === memberId);
      if (!row) throw httpError('Pick a member of the club.', 400, 'member_required');
      await setMoney(event.id, memberId, { sponsor_amount: row.sponsor_amount + deficit });
      next = { mode, amount: deficit, member_id: memberId };
    } else if (mode === 'split') {
      if (!s.totals.headcount) throw httpError('Nobody is coming yet.', 409, 'nobody');
      const already = cur?.mode === 'split' ? num(cur.per_person) : 0;
      next = { mode, amount: deficit, per_person: already + roundUp(deficit / s.totals.headcount) };
    } else {
      throw httpError('mode must be to_fund, from_fund, sponsor or split.');
    }
  }
  next.at = new Date().toISOString();
  const { error } = await supabase.from('events').update({ meeting_settlement: next }).eq('id', event.id);
  if (error) throw error;
  return next;
}

async function undoSettle(event) {
  const cur = event.meeting_settlement;
  if (!cur) return;
  if (cur.txn_id) {
    await supabase.from('transactions').update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'meeting settlement undone' }).eq('id', cur.txn_id);
  }
  if (cur.mode === 'sponsor' && cur.member_id) {
    const { data } = await supabase.from('meeting_money').select('sponsor_amount').eq('event_id', event.id).eq('club_member_id', cur.member_id).maybeSingle();
    await setMoney(event.id, cur.member_id, { sponsor_amount: Math.max(0, num(data?.sponsor_amount) - num(cur.amount)) });
  }
  const { error } = await supabase.from('events').update({ meeting_settlement: null }).eq('id', event.id);
  if (error) throw error;
}

module.exports = { summary, setMoney, settle, undoSettle, httpError };
