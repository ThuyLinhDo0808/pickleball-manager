// Đổi email đăng nhập (Hồ sơ): for a player whose address cannot receive mail, or who wants
// another one. Asks for the password, emails a 6-digit code to the NEW address, and only
// switches once that code is typed (so the new address is confirmed). The old address is
// told afterwards. The code is stored only as an HMAC with a server key.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const emailVerify = require('./emailVerify');
const security = require('./accountSecurity');

const MIGRATION = '20261219090000_email_change.sql';
const TTL_MIN = 30;
const MAX_TRIES = 5;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const key = () => crypto.createHash('sha256').update(`pbm-email-change:${process.env.MFA_ENC_KEY || ''}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest();
const hashOf = (userId, email, code) => crypto.createHmac('sha256', key()).update(`${userId}|${email}|${code}`).digest('hex');
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function taken(email, userId) {
  const { data, error } = await supabase.from('users').select('id').ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)).neq('id', userId).limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function status(userId) {
  const { data, error } = await supabase.from('users').select('pending_email, pending_email_until').eq('id', userId).maybeSingle();
  if (error) return { pending_email: null };
  const live = data?.pending_email && data.pending_email_until && new Date(data.pending_email_until).getTime() > Date.now();
  return { pending_email: live ? data.pending_email : null, pending_until: live ? data.pending_email_until : null };
}

async function checkPassword(email, password) {
  if (!password) throw fail('Enter your current password.', 400, 'password_required');
  const client = emailVerify.authClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw fail('Wrong password.', 400, 'bad_password');
  // Only a check: drop the extra session.
  supabase.auth.admin.signOut(data.session.access_token, 'local').catch(() => {});
}

async function start(userId, currentEmail, rawEmail, password) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw fail('Enter a valid email address.', 400, 'bad_email');
  if (email === String(currentEmail || '').toLowerCase()) throw fail('That is already your email.', 400, 'same_email');
  if (!process.env.RESEND_API_KEY) throw fail('Email sending is not set up yet.', 503, 'email_off');
  await checkPassword(currentEmail, password);
  if (await taken(email, userId)) throw fail('Another account already uses this email.', 409, 'email_taken');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const until = new Date(Date.now() + TTL_MIN * 60000).toISOString();
  const { error } = await supabase.from('users').update({ pending_email: email, pending_email_hash: hashOf(userId, email, code), pending_email_until: until, pending_email_tries: 0 }).eq('id', userId);
  if (error) throw error;
  const text = `Mã xác nhận đổi email NexusZone của bạn: ${code}\n\nNhập mã này ở Hồ sơ → Đổi email trong ${TTL_MIN} phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.`;
  const html = `<p>Mã xác nhận đổi email NexusZone của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Nhập mã này ở <b>Hồ sơ → Đổi email</b> trong ${TTL_MIN} phút.</p><p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`;
  const sent = await security.sendMail(email, 'Mã xác nhận đổi email', text, html);
  if (sent !== 'sent') throw fail('The code email could not be sent. Check the address and try again.', 502, 'send_failed');
  return { pending_email: email, pending_until: until };
}

async function confirm(userId, oldEmail, rawCode) {
  const code = String(rawCode || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) throw fail('Enter the 6-digit code.', 400, 'bad_code');
  const { data: u, error } = await supabase.from('users').select('pending_email, pending_email_hash, pending_email_until, pending_email_tries').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!u?.pending_email || !u.pending_email_hash || new Date(u.pending_email_until).getTime() <= Date.now()) throw fail('The code has expired. Ask for a new one.', 400, 'code_expired');
  if ((u.pending_email_tries || 0) >= MAX_TRIES) throw fail('Too many wrong codes. Ask for a new one.', 429, 'too_many_tries');
  const want = Buffer.from(u.pending_email_hash, 'hex');
  const got = Buffer.from(hashOf(userId, u.pending_email, code), 'hex');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    await supabase.from('users').update({ pending_email_tries: (u.pending_email_tries || 0) + 1 }).eq('id', userId);
    throw fail('Wrong code.', 400, 'bad_code');
  }
  const email = u.pending_email;
  if (await taken(email, userId)) throw fail('Another account already uses this email.', 409, 'email_taken');
  const { error: aErr } = await supabase.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (aErr) throw fail(/already|registered|exists/i.test(aErr.message || '') ? 'Another account already uses this email.' : aErr.message, /already|registered|exists/i.test(aErr.message || '') ? 409 : 500, /already|registered|exists/i.test(aErr.message || '') ? 'email_taken' : 'update_failed');
  const now = new Date().toISOString();
  const { error: uErr } = await supabase.from('users').update({ email, pending_email: null, pending_email_hash: null, pending_email_until: null, pending_email_tries: 0, email_unverified_since: null, email_verified_at: now }).eq('id', userId);
  if (uErr) throw uErr;
  emailVerify.forget(userId);
  // Tell the old address (it may be the owner's, if someone else got into the account).
  if (oldEmail) {
    const text = `Email đăng nhập tài khoản NexusZone của bạn vừa được đổi sang ${email}.\n\nNếu không phải bạn đổi, hãy liên hệ Ban quản trị ngay.`;
    const html = `<p>Email đăng nhập tài khoản NexusZone của bạn vừa được đổi sang <b>${esc(email)}</b>.</p><p>Nếu không phải bạn đổi, hãy liên hệ Ban quản trị ngay.</p>`;
    security.sendMail(oldEmail, 'Email tài khoản đã được đổi', text, html).catch(() => {});
  }
  try {
    await require('./owner').audit({ hostEmail: oldEmail || 'account' }, { action: 'account.email_change', host: { id: userId, email }, oldValue: { email: oldEmail }, newValue: { email } });
  } catch {
    /* the change itself is done */
  }
  return { email };
}

async function cancel(userId) {
  const { error } = await supabase.from('users').update({ pending_email: null, pending_email_hash: null, pending_email_until: null, pending_email_tries: 0 }).eq('id', userId);
  if (error) throw error;
  return { cancelled: true };
}

module.exports = { MIGRATION, status, start, confirm, cancel };
