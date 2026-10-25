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

// Our own email (Resend) that shows only the code: Supabase makes the one-time code
// (generateLink, the same code verifyOtp checks), we send it. Returns false when there is
// no mail sender or it failed, so Supabase's own email is used instead.
async function mailCode(email) {
  if (!process.env.RESEND_API_KEY) return false;
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp;
  if (error || !/^\d{6}$/.test(String(code || ''))) return false;
  const text = `Mã xác nhận email NexusZone của bạn là: ${code}\n\nNhập mã này trên màn hình xác nhận email. Mã dùng được một lần và sớm hết hạn.\n\nNếu không phải bạn đăng ký, hãy bỏ qua email này.`;
  const html = `<p>Mã xác nhận email NexusZone của bạn:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:Consolas,monospace;margin:16px 0">${esc(code)}</p>
<p>Nhập mã này trên màn hình xác nhận email. Mã dùng được một lần và sớm hết hạn.</p>
<p style="color:#64748b">Nếu không phải bạn đăng ký, hãy bỏ qua email này.</p>`;
  const r = await require('./accountSecurity').sendMail(email, `Mã xác nhận NexusZone: ${code}`, text, html);
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

module.exports = { MIGRATION, GRACE_HOURS, authClient, unverifiedSince, status, assertCanRegister, assertVerified, markVerified, sendCode, verifyCode, signedInByEmail, forget };
