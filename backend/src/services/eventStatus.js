// Event status is one of: open (upcoming), completed, cancelled. A session becomes
// "completed" by itself once its time slot is over; cancelled stays cancelled.
// (draft / closed only exist on events created before this rule; they count as open.)
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');
const { eventEndMs } = require('./attendance');

const HOST_STATUSES = ['open', 'completed', 'cancelled'];
const LIVE = ['draft', 'open', 'closed'];

// Mark every finished session (optionally of one club / host) as completed.
async function completeFinished({ clubId = null, hostId = null, now = Date.now() } = {}) {
  try {
    let q = supabase.from('events').select('id, event_date, start_time, end_time').in('status', LIVE).lte('event_date', todayYmd());
    if (clubId) q = q.eq('club_id', clubId);
    if (hostId) q = q.eq('host_id', hostId);
    const { data, error } = await q.limit(1000);
    if (error) throw error;
    const done = (data || []).filter((e) => eventEndMs(e) <= now).map((e) => e.id);
    if (done.length) await supabase.from('events').update({ status: 'completed' }).in('id', done).in('status', LIVE);
    return done.length;
  } catch (err) {
    console.error('auto-complete events failed', err);
    return 0;
  }
}

// One event: completed if its slot is over (returns the up-to-date row).
async function completeIfFinished(event, now = Date.now()) {
  if (!LIVE.includes(event.status) || eventEndMs(event) > now) return event;
  const { data } = await supabase.from('events').update({ status: 'completed' }).eq('id', event.id).in('status', LIVE).select().maybeSingle();
  return data || { ...event, status: 'completed' };
}

module.exports = { HOST_STATUSES, completeFinished, completeIfFinished };
