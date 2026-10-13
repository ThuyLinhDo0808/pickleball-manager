// How often a player cancels / doesn't show up — shown to the Host on the participant
// list when that player signs up again, so the Host can decide whether to take them.
// Scope: the same club / community (or, for kèo without a club, the same Host's kèo),
// the last HISTORY_DAYS days, the current event left out.
const { supabase } = require('../supabase');
const { eventStartMs, refundShare, tiersReady } = require('./attendance');

const HISTORY_DAYS = 180;
const SHOW_ITEMS = 5;

function daysAgoYmd(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// rows: the event's participants (with user_id / member ids / phone; card.member_id
// optional). Returns Map participantId -> { cancels, late, no_shows, items } (people
// with nothing to report are left out).
async function cancelHistory(event, rows) {
  const out = new Map();
  const keys = { user_id: new Set(), member: new Set(), phone: new Set() };
  for (const p of rows) {
    if (p.user_id) keys.user_id.add(p.user_id);
    for (const m of [p.source_club_member_id, p.guest_member_id]) if (m) keys.member.add(m);
    if (p.phone && String(p.phone).length <= 20) keys.phone.add(String(p.phone));
  }
  const ors = [];
  if (keys.user_id.size) ors.push(`user_id.in.(${[...keys.user_id].join(',')})`);
  if (keys.member.size) {
    const ids = [...keys.member].join(',');
    ors.push(`source_club_member_id.in.(${ids})`, `guest_member_id.in.(${ids})`);
  }
  // Phones go into the filter quoted (digits, spaces, + only).
  const phones = [...keys.phone].filter((x) => /^[0-9 +]+$/.test(x));
  if (phones.length) ors.push(`phone.in.(${phones.map((x) => `"${x}"`).join(',')})`);
  if (!ors.length) return out;

  const tiers = await tiersReady();
  let q = supabase
    .from('event_participants')
    .select(
      `id, event_id, user_id, source_club_member_id, guest_member_id, phone, status, late_cancel, cancelled_at${tiers ? ', refund_percent, cancel_reason, cancelled_by' : ''}, events!inner(id, title, event_date, start_time, club_id, host_id)`
    )
    .in('status', ['cancelled', 'no_show'])
    .neq('event_id', event.id)
    .gte('events.event_date', daysAgoYmd(HISTORY_DAYS))
    .or(ors.join(','))
    .limit(1000);
  q = event.club_id ? q.eq('events.club_id', event.club_id) : q.eq('events.host_id', event.host_id).is('events.club_id', null);
  const { data, error } = await q;
  if (error) throw error;

  for (const p of rows) {
    const mine = (data || []).filter(
      (h) =>
        (p.user_id && h.user_id === p.user_id) ||
        [p.source_club_member_id, p.guest_member_id].some((m) => m && (h.source_club_member_id === m || h.guest_member_id === m)) ||
        (p.phone && h.phone === p.phone)
    );
    if (!mine.length) continue;
    // One row per event (a player may have several for the same kèo).
    const byEvent = new Map();
    for (const h of mine) if (!byEvent.has(h.event_id)) byEvent.set(h.event_id, h);
    const list = [...byEvent.values()].sort((a, b) => b.events.event_date.localeCompare(a.events.event_date));
    const cancels = list.filter((h) => h.status === 'cancelled');
    out.set(p.id, {
      days: HISTORY_DAYS,
      cancels: cancels.length,
      late: cancels.filter((h) => refundShare(h) < 100).length,
      no_shows: list.filter((h) => h.status === 'no_show').length,
      items: list.slice(0, SHOW_ITEMS).map((h) => ({
        title: h.events.title,
        event_date: h.events.event_date,
        status: h.status,
        cancelled_at: h.cancelled_at || null,
        hours_before: h.cancelled_at ? Math.round(((eventStartMs(h.events) - Date.parse(h.cancelled_at)) / 3600000) * 10) / 10 : null,
        refund_percent: h.status === 'cancelled' ? refundShare(h) : null,
        reason: h.cancel_reason || null,
        by: h.cancelled_by || null,
      })),
    });
  }
  return out;
}

module.exports = { cancelHistory, HISTORY_DAYS };
