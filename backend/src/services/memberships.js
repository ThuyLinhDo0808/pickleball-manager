const { supabase } = require('../supabase');

const APP_TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';

// Today's date (YYYY-MM-DD) in the club's timezone, not the server's.
function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date());
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}

// Period N (0-based) of a plan starting at `startMonth` ("YYYY-MM").
// month -> 2026-08, quarter -> Q3-2026 (3 months), year -> 2026 (12 months).
function periodRange(period, startMonth, index = 0) {
  const months = { month: 1, quarter: 3, year: 12 }[period];
  if (!months) throw new Error('Unknown period');
  const [sy, sm] = startMonth.split('-').map(Number);
  const startIdx = sy * 12 + (sm - 1) + index * months;
  const endIdx = startIdx + months - 1;
  const y1 = Math.floor(startIdx / 12);
  const m1 = (startIdx % 12) + 1;
  const y2 = Math.floor(endIdx / 12);
  const m2 = (endIdx % 12) + 1;

  let label;
  if (period === 'month') label = `${y1}-${pad(m1)}`;
  else if (period === 'quarter') label = m1 % 3 === 1 ? `Q${Math.ceil(m1 / 3)}-${y1}` : `${y1}-${pad(m1)}→${y2}-${pad(m2)}`;
  else label = m1 === 1 ? `${y1}` : `${y1}-${pad(m1)}→${y2}-${pad(m2)}`;

  return {
    period_label: label,
    starts_on: `${y1}-${pad(m1)}-01`,
    ends_on: `${y2}-${pad(m2)}-${pad(lastDayOfMonth(y2, m2))}`,
  };
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// Link a sign-up to an existing club member by phone so check-in can use their pass.
async function findClubMemberByPhone(clubId, phone) {
  const wanted = normalizePhone(phone);
  if (!clubId || wanted.length < 9) return null;
  const { data } = await supabase.from('club_members').select('id, phone').eq('club_id', clubId).not('phone', 'is', null);
  return (data || []).find((m) => normalizePhone(m.phone) === wanted)?.id || null;
}

// VIP stars for a fixed member's current plan: ★ month, ★★ quarter, ★★★ year.
function vipStars(current) {
  let stars = 0;
  for (const m of current) {
    const days = (Date.parse(m.ends_on) - Date.parse(m.starts_on)) / 86400000;
    stars = Math.max(stars, days > 100 ? 3 : days > 40 ? 2 : 1);
  }
  return stars;
}

// Per-member pass summary used by the members table.
function summarize(memberships, today = todayYmd()) {
  const current = memberships.filter((m) => m.starts_on <= today && m.ends_on >= today);
  const paidNow = current.filter((m) => m.status === 'paid');
  const unlimited = paidNow.some((m) => m.sessions_included === 0);
  let state = 'none';
  if (paidNow.length) state = 'active';
  else if (current.length) state = 'unpaid';
  else if (memberships.some((m) => m.ends_on < today)) state = 'expired';

  return {
    membership_state: state,
    vip_stars: vipStars(current),
    current_period: (paidNow[0] || current[0])?.period_label || null,
    sessions_unlimited: unlimited,
    sessions_remaining: paidNow.length ? paidNow.reduce((s, m) => s + (m.sessions_remaining || 0), 0) : null,
    debt: memberships.filter((m) => m.status !== 'paid').reduce((s, m) => s + Number(m.amount || 0), 0),
  };
}

// On check-in: use one session from the member's paid pass covering the event date.
// Unlimited passes (sessions_included = 0) still log the session, for attendance stats.
async function consumeSession(clubMemberId, eventDate, eventId) {
  const { data: passes, error } = await supabase
    .from('v_membership_status')
    .select('*')
    .eq('club_member_id', clubMemberId)
    .eq('status', 'paid')
    .lte('starts_on', eventDate)
    .gte('ends_on', eventDate)
    .order('ends_on', { ascending: true });
  if (error) throw error;
  if (!passes?.length) return null;

  const already = await supabase
    .from('membership_sessions')
    .select('id, membership_id')
    .eq('event_id', eventId)
    .in('membership_id', (passes || []).map((p) => p.membership_id));
  if (already.data?.length) return passes.find((p) => p.membership_id === already.data[0].membership_id);

  const pass = (passes || []).find((p) => p.sessions_included === 0 || p.sessions_remaining > 0);
  if (!pass) return null;
  const { error: insErr } = await supabase.from('membership_sessions').insert({ membership_id: pass.membership_id, event_id: eventId });
  if (insErr) throw insErr;
  return { ...pass, sessions_used: pass.sessions_used + 1, sessions_remaining: Math.max(pass.sessions_remaining - 1, 0) };
}

// Undo a check-in (cancel / no-show afterwards): give the session back.
async function releaseSession(clubMemberId, eventId) {
  const { data: mine } = await supabase.from('memberships').select('id').eq('club_member_id', clubMemberId);
  const ids = (mine || []).map((m) => m.id);
  if (!ids.length) return;
  await supabase.from('membership_sessions').delete().eq('event_id', eventId).in('membership_id', ids);
}

// Keep the club fund in step with a membership's payment status.
async function syncMembershipTxn({ membership, hostId, clubId, memberName }) {
  if (membership.status === 'paid' && !membership.transaction_id) {
    const { data: txn, error } = await supabase
      .from('transactions')
      .insert({
        host_id: hostId,
        owner_type: 'club',
        club_id: clubId,
        type: 'income',
        category: 'membership',
        amount: membership.amount,
        note: `${memberName} · ${membership.period_label}`,
      })
      .select('id')
      .single();
    if (error) throw error;
    await supabase.from('memberships').update({ transaction_id: txn.id }).eq('id', membership.id);
    return { ...membership, transaction_id: txn.id };
  }
  if (membership.status !== 'paid' && membership.transaction_id) {
    await supabase
      .from('transactions')
      .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'membership marked unpaid' })
      .eq('id', membership.transaction_id);
    await supabase.from('memberships').update({ transaction_id: null }).eq('id', membership.id);
    return { ...membership, transaction_id: null };
  }
  return membership;
}

module.exports = {
  todayYmd,
  periodRange,
  normalizePhone,
  findClubMemberByPhone,
  summarize,
  consumeSession,
  releaseSession,
  syncMembershipTxn,
};
