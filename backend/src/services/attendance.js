const { supabase } = require('../supabase');
const { consumeSession, releaseSession } = require('./memberships');

const ATTENDANCE_ACTIONS = ['check-in', 'no-show', 'reset'];

// Check-in / no-show / reset (back to registered) for one participant.
// Shared by the Host and by staff (coordinators) so both follow the same rules:
// checking in a club member uses one session of their pass; undoing gives it back.
async function setAttendance(event, prior, action) {
  const now = new Date().toISOString();
  const patch = {
    'check-in': { status: 'checked_in', checked_in_at: now },
    'no-show': { status: 'no_show', no_show_at: now },
    reset: { status: 'registered', checked_in_at: null, no_show_at: null },
  }[action];
  if (!patch) throw Object.assign(new Error(`Unknown action: ${action}`), { status: 400 });
  if (prior.status === 'cancelled') {
    throw Object.assign(new Error('This registration was cancelled.'), { status: 400 });
  }

  const { data: updated, error } = await supabase.from('event_participants').update(patch).eq('id', prior.id).select().single();
  if (error) throw error;

  let pass = null;
  const memberId = prior.source_club_member_id;
  if (memberId && event.club_id) {
    if (action === 'check-in' && prior.status !== 'checked_in') {
      pass = await consumeSession(memberId, event.event_date, event.id);
    } else if (action !== 'check-in' && prior.status === 'checked_in') {
      await releaseSession(memberId, event.id);
    }
  }

  return {
    ...updated,
    pass: pass && {
      period_label: pass.period_label,
      unlimited: pass.sessions_included === 0,
      sessions_remaining: pass.sessions_remaining,
    },
  };
}

module.exports = { ATTENDANCE_ACTIONS, setAttendance };
