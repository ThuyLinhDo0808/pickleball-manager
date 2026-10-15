// Account security: two-step sign-in (authenticator app codes), "sign out on every
// device", and the devices an account signed in from.
//
// Two-step sign-in is TOTP (RFC 6238: 6 digits, 30 s, SHA-1 — what Google Authenticator,
// Microsoft Authenticator, 1Password… use), checked here on the server. A passed check
// is tied to the Supabase session (the token's session_id), so stealing a password is
// not enough, and signing in again on another device asks for a code again.
// Dependency-free on purpose (node:crypto only).
const crypto = require('crypto');
const { supabase } = require('../supabase');

const STEP = 30;
const DIGITS = 6;
const WINDOW = 1; // accept the previous / next code too (clock drift)
const RECOVERY_COUNT = 8;
const SESSION_DAYS = 30; // a verified session stays verified this long (normal accounts)
const CONSOLE_HOURS = Number(process.env.OWNER_MFA_HOURS || 12); // owner console asks again after this

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

// ---- base32 (RFC 4648, no padding) ------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---- TOTP ---------------------------------------------------------------------------
function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}
const stepNow = (now = Date.now()) => Math.floor(now / 1000 / STEP);
const totp = (secretB32, now = Date.now()) => hotp(base32Decode(secretB32), stepNow(now));

// The step a code belongs to (within ±WINDOW), or null.
function matchStep(secretB32, code, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32);
  const s = stepNow(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const want = hotp(key, s + d);
    if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return s + d;
  }
  return null;
}

// ---- secret at rest: AES-256-GCM ------------------------------------------------------
// MFA_ENC_KEY: 32 bytes as hex (64 chars) or base64. Without it the key is derived from
// the service role key (works, but rotating that key would then break every 2-step setup).
function encKey() {
  const raw = process.env.MFA_ENC_KEY || '';
  if (raw) {
    const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (k.length === 32) return k;
    throw new Error('MFA_ENC_KEY must be 32 bytes (64 hex characters or base64).');
  }
  return crypto.createHash('sha256').update(`pbm-mfa:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest();
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}
function decrypt(blob) {
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Unknown secret format.');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

// ---- recovery codes -------------------------------------------------------------------
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
function newRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => {
    const s = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

// ---- the session a token belongs to -----------------------------------------------------
// Supabase access tokens carry session_id (same across refreshes) and iat. The token was
// already accepted by Supabase (auth.getUser) before this is read.
function tokenInfo(token) {
  let payload = {};
  try {
    payload = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString());
  } catch {
    payload = {};
  }
  const sessionKey = payload.session_id ? `s:${payload.session_id}` : `t:${crypto.createHash('sha256').update(String(token)).digest('hex')}`;
  return { sessionKey, iat: Number(payload.iat) || null };
}

// ---- per-user state (cached briefly: checked on every request) --------------------------
const CACHE_MS = Number(process.env.SECURITY_CACHE_MS ?? 30_000);
const cache = new Map();
function forget(userId) {
  cache.delete(userId);
}
async function stateOf(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [{ data: u, error: uErr }, { data: m, error: mErr }] = await Promise.all([
    supabase.from('users').select('sessions_revoked_at').eq('id', userId).maybeSingle(),
    supabase.from('user_mfa').select('enabled_at').eq('user_id', userId).maybeSingle(),
  ]);
  // Database not migrated yet: no extra checks rather than locking everyone out.
  const value = uErr || mErr ? { ready: false } : { ready: true, revokedAt: u?.sessions_revoked_at || null, mfaOn: !!m?.enabled_at };
  cache.set(userId, { at: Date.now(), value });
  return value;
}

async function sessionVerifiedAt(userId, sessionKey) {
  const { data } = await supabase
    .from('mfa_sessions')
    .select('verified_at, expires_at')
    .eq('session_key', sessionKey)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || new Date(data.expires_at) <= new Date()) return null;
  return new Date(data.verified_at);
}

// requireAuth calls this once the user is known. Returns an error answer or null.
// Paths under ALWAYS_OPEN work before the second step (to enter the code, or sign out).
const ALWAYS_OPEN = [/^\/api\/host\/security(\/|$)/];
async function gate(req) {
  const st = await stateOf(req.userId);
  if (!st.ready) return null;
  if (st.revokedAt && req.tokenIat && req.tokenIat * 1000 < new Date(st.revokedAt).getTime() - 1000) {
    return { status: 401, body: { error: 'This session was signed out. Please sign in again.', code: 'session_revoked' } };
  }
  req.mfaOn = st.mfaOn;
  if (!st.mfaOn) return null;
  const at = await sessionVerifiedAt(req.userId, req.sessionKey);
  req.mfaVerifiedAt = at;
  const path = (req.originalUrl || '').split('?')[0];
  if (!at && !ALWAYS_OPEN.some((re) => re.test(path))) {
    return { status: 403, body: { error: 'Enter the code from your authenticator app.', code: 'mfa_required' } };
  }
  return null;
}

// Owner console / view-as: 2-step sign-in is required (production by default) and must
// be recent. Returns an error answer or null.
const consoleNeedsMfa = () => (process.env.OWNER_MFA_REQUIRED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
async function consoleGate(req) {
  if (!consoleNeedsMfa()) return null;
  const st = await stateOf(req.userId);
  // Fail closed: without the tables the console can't be protected.
  if (!st.ready) return { status: 503, body: { error: 'Run migration 20261113090000_account_security.sql to use the owner console.', code: 'migration_required' } };
  if (!st.mfaOn) return { status: 403, body: { error: 'Turn on two-step sign-in to use the owner console.', code: 'mfa_enroll_required' } };
  const at = req.mfaVerifiedAt ?? (await sessionVerifiedAt(req.userId, req.sessionKey));
  if (!at || Date.now() - at.getTime() > CONSOLE_HOURS * 3600_000) {
    return { status: 403, body: { error: 'Enter the code from your authenticator app again.', code: 'mfa_required' } };
  }
  return null;
}

// Club / community managers (owners of a club or community, club staff with a role, hosts
// of one-off kèo) must have two-step sign-in on before they manage anything, like the
// owner console. Players are not affected. HOST_MFA_REQUIRED (default: on in production).
const hostNeedsMfa = () => (process.env.HOST_MFA_REQUIRED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
// Manager APIs. The player side and the account pages (/api/host/me, account, plan,
// club requests, notifications, security, privacy…) stay open so they can turn it on.
const MANAGER_PATHS = [/^\/api\/(clubs|matches|transactions|staff-grants|staff|tournaments|analytics|live|inventory)(\/|$)/, /^\/api\/events(\/|$)(?!public\/)/, /^\/api\/host\/(payment-settings|subscription)(\/|$)/];
const managerCache = new Map();
async function isManager(req) {
  const hit = managerCache.get(req.userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [{ count: clubs }, { count: games }, grants] = await Promise.all([
    supabase.from('clubs').select('id', { count: 'exact', head: true }).eq('host_id', req.userId),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('host_id', req.userId).is('club_id', null),
    req.emailVerified && req.hostEmail
      ? supabase.from('staff_grants').select('id', { count: 'exact', head: true }).eq('email', req.hostEmail.toLowerCase()).in('role', ['co_admin', 'finance', 'operator'])
      : Promise.resolve({ count: 0 }),
  ]);
  const value = (clubs || 0) + (games || 0) + (grants.count || 0) > 0;
  managerCache.set(req.userId, { at: Date.now(), value });
  return value;
}
async function managerGate(req) {
  if (!hostNeedsMfa() || req.mfaOn !== false) return null; // on already (or tables not there yet)
  const path = (req.originalUrl || '').split('?')[0];
  if (!MANAGER_PATHS.some((re) => re.test(path))) return null;
  if (!(await isManager(req))) return null;
  return { status: 403, body: { error: 'Turn on two-step sign-in to manage your club / community.', code: 'mfa_enroll_required', scope: 'manager' } };
}

async function markVerified(userId, sessionKey) {
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const { error } = await supabase
    .from('mfa_sessions')
    .upsert({ session_key: sessionKey, user_id: userId, verified_at: new Date().toISOString(), expires_at: expires }, { onConflict: 'session_key' });
  if (error) throw error;
  // Old rows are useless after they expire.
  await supabase.from('mfa_sessions').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString());
}

async function mfaRow(userId) {
  const { data, error } = await supabase.from('user_mfa').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// A 6-digit code (or a recovery code) for this user. Burns the step / the recovery code.
async function checkCode(userId, code, { allowRecovery = true } = {}) {
  const row = await mfaRow(userId);
  if (!row) throw fail(409, 'Two-step sign-in is not set up.', 'mfa_not_setup');
  const secret = decrypt(row.secret_enc);
  const step = matchStep(secret, code);
  if (step != null) {
    // Only moves forward, in one statement: two requests with the same code can't both pass.
    const { data: moved } = await supabase
      .from('user_mfa')
      .update({ last_step: step })
      .eq('user_id', userId)
      .lt('last_step', step)
      .select('user_id');
    if (!moved?.length) throw fail(400, 'This code was already used. Wait for the next one.', 'mfa_code_reused');
    return { row, via: 'totp' };
  }
  if (allowRecovery && row.enabled_at) {
    const h = hashCode(code);
    if ((row.recovery_hashes || []).includes(h)) {
      // Removed only if still there (a second request with the same code finds nothing).
      const { data: used } = await supabase
        .from('user_mfa')
        .update({ recovery_hashes: row.recovery_hashes.filter((x) => x !== h) })
        .eq('user_id', userId)
        .contains('recovery_hashes', [h])
        .select('user_id');
      if (used?.length) return { row, via: 'recovery' };
    }
  }
  throw fail(400, 'Wrong code.', 'mfa_bad_code');
}

// Start (or restart) the setup: a new secret, not active until a code confirms it.
async function startSetup(userId, label) {
  const row = await mfaRow(userId);
  if (row?.enabled_at) throw fail(409, 'Two-step sign-in is already on.', 'mfa_already_on');
  const secret = base32Encode(crypto.randomBytes(20));
  const { error } = await supabase
    .from('user_mfa')
    .upsert({ user_id: userId, secret_enc: encrypt(secret), enabled_at: null, recovery_hashes: [], last_step: 0 }, { onConflict: 'user_id' });
  if (error) throw error;
  const issuer = 'Pickleball Manager';
  const otpauth = `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
  return { secret, otpauth };
}

async function confirmSetup(userId, code, sessionKey) {
  const row = await mfaRow(userId);
  if (!row) throw fail(409, 'Start the setup first.', 'mfa_not_setup');
  if (row.enabled_at) throw fail(409, 'Two-step sign-in is already on.', 'mfa_already_on');
  await checkCode(userId, code, { allowRecovery: false });
  const { codes, hashes } = newRecoveryCodes();
  const { error } = await supabase.from('user_mfa').update({ enabled_at: new Date().toISOString(), recovery_hashes: hashes }).eq('user_id', userId);
  if (error) throw error;
  await markVerified(userId, sessionKey);
  forget(userId);
  return codes;
}

async function verifySession(userId, code, sessionKey) {
  const { via, row } = await checkCode(userId, code);
  if (!row.enabled_at) throw fail(409, 'Two-step sign-in is not on.', 'mfa_not_setup');
  await markVerified(userId, sessionKey);
  return { via, recovery_left: via === 'recovery' ? (row.recovery_hashes || []).length - 1 : (row.recovery_hashes || []).length };
}

async function disable(userId, code) {
  await checkCode(userId, code);
  await supabase.from('user_mfa').delete().eq('user_id', userId);
  await supabase.from('mfa_sessions').delete().eq('user_id', userId);
  forget(userId);
}

async function regenerateRecovery(userId, code) {
  await checkCode(userId, code, { allowRecovery: false });
  const { codes, hashes } = newRecoveryCodes();
  await supabase.from('user_mfa').update({ recovery_hashes: hashes }).eq('user_id', userId);
  return codes;
}

// Sign out on every device: tokens issued before now are refused by the API; Supabase is
// asked to end every session too (refresh tokens stop working).
async function signOutEverywhere(userId, token) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('users').update({ sessions_revoked_at: now }).eq('id', userId);
  if (error) throw error;
  await supabase.from('mfa_sessions').delete().eq('user_id', userId);
  forget(userId);
  try {
    await supabase.auth.admin.signOut(token, 'global');
  } catch {
    /* the API check above already refuses old tokens */
  }
  return now;
}

// ---- devices ------------------------------------------------------------------------------
// 113.161.12.34 -> 113.161.12.x ; IPv6 -> first 3 groups. Enough to recognise, not to track.
function ipHint(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/\.\d+$/, '.x');
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}:…`;
  return null;
}
const deviceHash = (userId, deviceId) => crypto.createHash('sha256').update(`${userId}|${deviceId}`).digest('hex');

// After a successful password sign-in. Returns { isNew, firstEver }.
async function recordLogin(userId, deviceId, userAgent, ip) {
  const id = /^[A-Za-z0-9_-]{16,64}$/.test(String(deviceId || '')) ? deviceId : null;
  if (!id) return { isNew: false, firstEver: false };
  const h = deviceHash(userId, id);
  const ua = String(userAgent || '').slice(0, 300) || null;
  const { data: rows, error } = await supabase.from('login_devices').select('id, device_hash').eq('user_id', userId);
  if (error) return { isNew: false, firstEver: false }; // not migrated yet
  const known = (rows || []).find((r) => r.device_hash === h);
  if (known) {
    await supabase.from('login_devices').update({ last_seen: new Date().toISOString(), user_agent: ua, ip_hint: ipHint(ip) }).eq('id', known.id);
    return { isNew: false, firstEver: false };
  }
  await supabase.from('login_devices').insert({ user_id: userId, device_hash: h, user_agent: ua, ip_hint: ipHint(ip) });
  return { isNew: true, firstEver: (rows || []).length === 0 };
}

// "Chrome trên Windows" style label from a user agent.
function deviceLabel(ua) {
  const s = String(ua || '');
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /CocCoc/.test(s) ? 'Cốc Cốc' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Trình duyệt';
  const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

async function devices(userId) {
  const { data } = await supabase
    .from('login_devices')
    .select('id, user_agent, ip_hint, first_seen, last_seen')
    .eq('user_id', userId)
    .order('last_seen', { ascending: false })
    .limit(30);
  return (data || []).map((d) => ({ id: d.id, label: deviceLabel(d.user_agent), ip_hint: d.ip_hint, first_seen: d.first_seen, last_seen: d.last_seen }));
}

// Email the account owner about a sign-in from a new device (Resend, if configured).
async function emailNewDevice(email, { userAgent, ip, webUrl }) {
  if (!process.env.RESEND_API_KEY || !email) return 'off';
  const from = process.env.NOTIFY_FROM_EMAIL || process.env.FEEDBACK_FROM_EMAIL || 'Pickleball Manager <onboarding@resend.dev>';
  const when = new Date().toLocaleString('vi-VN', { timeZone: process.env.APP_TZ || 'Asia/Ho_Chi_Minh' });
  const device = deviceLabel(userAgent);
  const where = ipHint(ip) || '—';
  const link = webUrl ? `${webUrl}/p/profile#security` : null;
  const text =
    `Tài khoản Pickleball Manager của bạn vừa đăng nhập trên một thiết bị mới.\n\n` +
    `Thời gian: ${when}\nThiết bị: ${device}\nĐịa chỉ mạng: ${where}\n\n` +
    `Nếu là bạn, không cần làm gì thêm.\nNếu KHÔNG phải bạn: đổi mật khẩu ngay và bấm "Đăng xuất khỏi mọi thiết bị" ở Hồ sơ → Bảo mật${link ? ` (${link})` : ''}, rồi bật xác thực 2 lớp.`;
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<p>Tài khoản Pickleball Manager của bạn vừa đăng nhập trên <b>một thiết bị mới</b>.</p>
<p>Thời gian: <b>${esc(when)}</b><br>Thiết bị: <b>${esc(device)}</b><br>Địa chỉ mạng: <b>${esc(where)}</b></p>
<p>Nếu là bạn, không cần làm gì thêm.</p>
<p><b>Nếu không phải bạn:</b> đổi mật khẩu ngay và bấm <i>Đăng xuất khỏi mọi thiết bị</i> ở Hồ sơ → Bảo mật${link ? ` (<a href="${esc(link)}">mở trang</a>)` : ''}, rồi bật xác thực 2 lớp.</p>`;
  try {
    const r = await fetch(`${process.env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: '🔐 Đăng nhập từ thiết bị mới', text, html }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? 'sent' : `failed_${r.status}`;
  } catch {
    return 'failed';
  }
}

module.exports = {
  // pure helpers (tests)
  base32Encode,
  base32Decode,
  totp,
  matchStep,
  encrypt,
  decrypt,
  tokenInfo,
  ipHint,
  deviceLabel,
  hashCode,
  // flows
  gate,
  consoleGate,
  consoleNeedsMfa,
  managerGate,
  hostNeedsMfa,
  stateOf,
  forget,
  mfaRow,
  startSetup,
  confirmSetup,
  verifySession,
  disable,
  regenerateRecovery,
  signOutEverywhere,
  recordLogin,
  devices,
  emailNewDevice,
  sessionVerifiedAt,
  CONSOLE_HOURS,
};
