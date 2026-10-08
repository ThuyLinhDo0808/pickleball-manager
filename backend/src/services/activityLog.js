// Club activity log (Pro): who changed what in a club. services/clubAccess.js marks a
// request with its club once access is granted; when the response is a success, one
// line is written here. Reads (GET) are never logged. Viewing the log needs the
// owner's plan to include `activity_log`; writing happens on every plan, so the history
// is there the day a club moves up to Pro.
const { supabase } = require('../supabase');

const ID = '[0-9a-fA-F-]{36}';
const r = (method, path, action) => ({ method, path: new RegExp(`^${path.replace(/:id/g, ID)}$`), action });
// First match wins.
const ACTIONS = [
  r('POST', '/api/clubs/:id/members/bulk', 'member.bulk'),
  r('POST', '/api/clubs/:id/members/:id/(approve)', 'member.approve'),
  r('POST', '/api/clubs/:id/members/:id/(reject)', 'member.reject'),
  r('POST', '/api/clubs/:id/members/:id/memberships', 'membership.add'),
  r('POST', '/api/clubs/:id/members', 'member.add'),
  r('PATCH', '/api/clubs/:id/members/:id', 'member.edit'),
  r('DELETE', '/api/clubs/:id/members/:id', 'member.delete'),
  r('POST', '/api/clubs/:id/memberships/:id/sessions', 'membership.session'),
  r('DELETE', '/api/clubs/:id/memberships/:id/sessions/last', 'membership.session_undo'),
  r('PATCH', '/api/clubs/:id/memberships/:id', 'membership.edit'),
  r('DELETE', '/api/clubs/:id/memberships/:id', 'membership.delete'),
  r('POST', '/api/clubs/:id/plans', 'plan.add'),
  r('PATCH', '/api/clubs/:id/plans/:id', 'plan.edit'),
  r('POST', '/api/clubs/:id/pending-payments/[^/]+/confirm', 'payment.confirm'),
  r('POST', '/api/clubs/:id/attendance/edits', 'attendance.edit'),
  r('(POST|PATCH|DELETE)', '/api/clubs/:id/inventory.*', 'inventory.update'),
  r('(POST|PATCH|DELETE)', '/api/clubs/:id/roster.*', 'roster.update'),
  r('PATCH', '/api/clubs/:id', 'club.edit'),
  r('POST', '/api/transactions', 'money.add'),
  r('PATCH', '/api/transactions/:id', 'money.edit'),
  r('POST', '/api/transactions/:id/void', 'money.void'),
  r('POST', '/api/events', 'event.create'),
  r('POST', '/api/events/weekly', 'event.weekly'),
  r('PATCH', '/api/events/:id', 'event.edit'),
  r('DELETE', '/api/events/:id', 'event.delete'),
  r('POST', '/api/events/:id/participants(/import)?', 'participant.add'),
  r('POST', '/api/events/:id/participants/:id/check-in', 'participant.checkin'),
  r('POST', '/api/events/:id/participants/:id/(fee|waive|confirm-payment|reject-payment)', 'participant.payment'),
  r('(POST|DELETE)', '/api/events/:id/participants/:id/.*', 'participant.update'),
  r('(PUT|POST|PATCH|DELETE)', '/api/events/:id/meeting/.*', 'meeting.money'),
  r('(POST|PATCH|DELETE)', '/api/(matches|live)(/.*)?', 'match.save'),
  r('(POST|PATCH|DELETE)', '/api/tournaments(/.*)?', 'tournament.update'),
];

function actionOf(method, path) {
  const hit = ACTIONS.find((a) => new RegExp(`^${a.method}$`).test(method) && a.path.test(path));
  return hit ? hit.action : 'other';
}

// A short, safe label for what was changed (a name or title; never a phone number).
function targetOf(body) {
  if (!body || typeof body !== 'object') return null;
  const v = body.full_name || body.title || body.name || body.category || body.note || null;
  if (v) return String(v).slice(0, 120);
  if (Array.isArray(body.members)) return `${body.members.length}`;
  return null;
}

function mark(req, club, role) {
  if (req.method === 'GET' || req.activityClub || !club?.id) return;
  req.activityClub = { id: club.id, role };
}

// Express middleware: write the line once the response went out successfully.
function recorder(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    const c = req.activityClub;
    if (!c || res.statusCode >= 400 || req.viewAs) return;
    const path = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
    supabase
      .from('club_activity_logs')
      .insert({ club_id: c.id, actor_id: req.userId || null, actor_email: req.hostEmail || null, actor_role: c.role, action: actionOf(req.method, path), method: req.method, path, target: targetOf(req.body) })
      .then(({ error }) => { if (error && !/does not exist|schema cache/.test(error.message)) console.error('activity log', error.message); });
  });
  next();
}

module.exports = { mark, recorder, actionOf, targetOf };
