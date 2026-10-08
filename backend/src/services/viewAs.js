// "View as host": the owner opens the app exactly as one Host sees it, to help with
// support. Read-only — the server refuses every change — phone numbers are masked, and
// each viewing session is written to the owner audit log. Owners and support staff with
// the view_as permission may use it.
const { supabase } = require('../supabase');
const owner = require('./owner');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIT_EVERY_MS = 30 * 60 * 1000; // one audit entry per owner+host per 30 minutes
const lastAudit = new Map();

// 0901234123 -> 09xx xxx 123
function maskPhone(v) {
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  return `${digits.slice(0, 2)}xx xxx ${digits.slice(-3)}`;
}

// Every string under a key that looks like a phone number, at any depth.
function maskPhones(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => maskPhones(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = /phone/i.test(k) && typeof v === 'string' && v ? maskPhone(v) : maskPhones(v, depth + 1);
  }
  return out;
}

// Called from requireAuth once the signed-in user is known. Returns true when the
// request was answered here (refused), false to carry on.
async function apply(req, res) {
  const target = req.headers['x-view-as'];
  if (!target) return false;
  const path = (req.originalUrl || '').split('?')[0];
  if (/^\/api\/owner(\/|$)/.test(path)) return false; // the owner console itself
  // Owners, and support staff given "view as host".
  const support = require('./support');
  if (!support.can(await support.consoleAccess(req.hostEmail), 'view_as')) {
    res.status(403).json({ error: 'Not allowed.', code: 'view_as_forbidden' });
    return true;
  }
  if (!UUID.test(String(target))) {
    res.status(400).json({ error: 'Bad X-View-As.', code: 'view_as_bad' });
    return true;
  }
  if (req.method !== 'GET') {
    res.status(403).json({ error: 'Read-only: you are viewing as another account.', code: 'read_only' });
    return true;
  }
  const { data: host } = await supabase.from('users').select('id, email').eq('id', target).maybeSingle();
  if (!host) {
    res.status(404).json({ error: 'Account not found.', code: 'view_as_bad' });
    return true;
  }
  const ownerEmail = req.hostEmail;
  const key = `${ownerEmail}|${host.id}`;
  if (!lastAudit.has(key) || Date.now() - lastAudit.get(key) > AUDIT_EVERY_MS) {
    lastAudit.set(key, Date.now());
    await owner.audit({ hostEmail: ownerEmail }, { action: 'host.view_as', host, note: path });
  }
  req.viewAs = { owner: ownerEmail };
  req.hostId = host.id;
  req.userId = host.id;
  req.hostEmail = host.email;
  req.emailVerified = true;
  const json = res.json.bind(res);
  res.json = (body) => json(maskPhones(body));
  res.set('X-View-As-Read-Only', '1');
  return false;
}

module.exports = { apply, maskPhone, maskPhones };
