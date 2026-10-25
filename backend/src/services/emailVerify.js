// Email check with a 6-digit code. Sign-up makes the account right away (no wait for a
// link), then emails a code (Supabase's email OTP, "Magic Link" template with
// {{ .Token }}); the player types it on the same screen. Until then the account is
// "unverified" (users.email_unverified_since):
//   - it can hold ONE upcoming sign-up, and only for EMAIL_VERIFY_GRACE_HOURS (48 h);
//   - after that, no new sign-ups until the email is confirmed;
//   - its email gives no rights (owner, support staff, club roles given by email).
// Accounts made before this change (column null) count as verified.
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../supabase');

const MIGRATION = '20261116090000_email_verify.sql';
const GRACE_HOURS = Number(process.env.EMAIL_VERIFY_GRACE_HOURS || 48);
const ACTIVE = ['registered', 'checked_in', 'pending', 'waitlisted', 'requested'];

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

// A fresh Auth client per call: verifying a code must never change the shared client.
const authClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

// Looked up on every signed-in request, so cached briefly; verifying clears it.
const TTL_MS = Number(process.env.EMAIL_VERIFY_CACHE_MS ?? 30 * 1000);
const cache = new Map(); // userId -> { at, value: null | ISO time }
const forget = (userId) => cache.delete(userId);

async function unverifiedSince(userId) {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const { data, error } = await supabase.from('users').select('email_unverified_since').eq('id', userId).maybeSingle();
  const value = error ? null : data?.email_unverified_since || null; // not migrated yet: verified
  cache.set(userId, { at: Date.now(), value });
  return value;
}

const deadlineOf = (since) => (since ? new Date(new Date(since).getTime() + GRACE_HOURS * 3600000).toISOString() : null);

async function status(userId) {
  const since = await unverifiedSince(userId);
  const deadline = deadlineOf(since);
  return { verified: !since, unverified_since: since, deadline, expired: !!deadline && Date.now() > new Date(deadline).getTime(), grace_hours: GRACE_HOURS };
}

// Before a new sign-up (kèo, club join request, invite): an unverified account may hold
// one upcoming place, inside the grace period.
async function assertCanRegister(userId) {
  const s = await status(userId);
  if (s.verified) return;
  if (s.expired) throw httpError('Confirm your email to sign up for more sessions.', 403, 'email_verify_required');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TZ || 'Asia/Ho_Chi_Minh' }).format(new Date());
  const { data } = await supabase.from('event_participants').select('id, events!inner(event_date)').eq('user_id', userId).in('status', ACTIVE).gte('events.event_date', today).limit(1);
  if ((data || []).length) throw httpError('Confirm your email to hold more than one place.', 403, 'email_unverified_limit');
}

// For things that need a real email (asking to open a club, paying for a plan).
async function assertVerified(userId) {
  if (await unverifiedSince(userId)) throw httpError('Confirm your email first.', 403, 'email_verify_required');
}

async function markVerified(userId) {
  const { error } = await supabase.from('users').update({ email_unverified_since: null, email_verified_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw error;
  forget(userId);
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The code email, laid out like other account-code emails: one card with the title, the
// code in a large spaced box, how long it lasts, what to do if it was not you, and a small
// footer saying why the email was sent. Inline styles and tables only (email clients).
// docs/email-templates/verify-code.html is the same layout with {{ .Token }} for Supabase.
function codeEmail(code) {
  const c = esc(code);
  const subject = 'Mã xác nhận NexusZone của bạn';
  const text =
    `Mã xác nhận NexusZone của bạn\n\n${code}\n\n` +
    `Nhập mã này trên NexusZone để hoàn tất xác nhận email. Mã sẽ hết hạn sau vài phút.\n\n` +
    `Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này. Không ai có thể dùng email của bạn nếu không có mã này.\n\n` +
    `Đây là email tài khoản từ NexusZone, được gửi vì địa chỉ này vừa được dùng để đăng ký trên NexusZone.`;
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0b1220">
<tr><td align="center" style="padding:36px 32px 8px;font-size:15px;font-weight:800;letter-spacing:2px;color:#0b1220">NEXUSZONE</td></tr>
<tr><td align="center" style="padding:8px 32px 0;font-size:26px;line-height:1.3;font-weight:700">Mã xác nhận NexusZone của bạn</td></tr>
<tr><td align="center" style="padding:24px 32px">
<div style="display:inline-block;background:#f1f3f5;border-radius:12px;padding:16px 28px;font-size:36px;font-weight:700;letter-spacing:10px;color:#0b1220;font-family:'Segoe UI',Helvetica,Arial,sans-serif">${c}</div>
</td></tr>
<tr><td align="center" style="padding:0 32px 20px;font-size:16px;line-height:1.6;color:#1f2937">Nhập mã này trên NexusZone để hoàn tất xác nhận email. Mã sẽ hết hạn sau vài phút.</td></tr>
<tr><td align="center" style="padding:0 32px 32px;font-size:14px;line-height:1.6;color:#6b7280">Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này. Không ai có thể dùng email của bạn nếu không có mã này.</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px"><tr><td align="center" style="padding:20px 32px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af">Đây là email tài khoản từ NexusZone. Email được gửi vì địa chỉ này vừa được dùng để đăng ký trên NexusZone.</td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

// Our own email (Resend) that shows only the code: Supabase makes the one-time code
// (generateLink, the same code verifyOtp checks), we send it. Returns false when there is
// no mail sender or it failed, so Supabase's own email is used instead.
async function mailCode(email) {
  if (!process.env.RESEND_API_KEY) return false;
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp;
  if (error || !/^\d{6}$/.test(String(code || ''))) return false;
  const { subject, text, html } = codeEmail(code);
  const r = await require('./accountSecurity').sendMail(email, subject, text, html);
  if (r !== 'sent') console.error('verify code mail', r);
  return r === 'sent';
}

// Email the 6-digit code. With our own mail sender the email shows only the code; without
// it, Supabase's "Magic Link" template is used (it must contain {{ .Token }}).
async function sendCode(email, origin) {
  if (await mailCode(email).catch(() => false)) return;
  const { error } = await authClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, ...(origin ? { emailRedirectTo: `${origin}/verify-email` } : {}) },
  });
  if (error) {
    if (/rate limit|seconds/i.test(error.message || '') || error.status === 429) throw httpError('Please wait a moment before asking for a new code.', 429, 'code_rate_limit');
    throw error;
  }
}

async function verifyCode(userId, email, code) {
  const token = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) throw httpError('Enter the 6-digit code.', 400, 'bad_code');
  const { data, error } = await authClient().auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data?.user || data.user.id !== userId) {
    // Supabase answers the same for a wrong and an expired code.
    throw httpError('Wrong or expired code.', 400, 'bad_code');
  }
  // The check signs in once more; that extra session is not needed.
  if (data.session?.access_token) supabase.auth.admin.signOut(data.session.access_token, 'local').catch(() => {});
  await markVerified(userId);
}

// Opened the link in the email instead of typing the code: that session was made by the
// one-time email sign-in (amr "otp" / "magiclink"), which proves the address.
function signedInByEmail(accessToken) {
  try {
    const p = JSON.parse(Buffer.from(String(accessToken).split('.')[1], 'base64url').toString());
    return (p.amr || []).some((a) => ['otp', 'magiclink'].includes(a?.method));
  } catch {
    return false;
  }
}

module.exports = { MIGRATION, GRACE_HOURS, authClient, unverifiedSince, status, assertCanRegister, assertVerified, markVerified, sendCode, verifyCode, signedInByEmail, forget, codeEmail };
