// Signing in with a username (or email), quick sign-up, and
// "forgot password". No login needed. Supabase Auth only knows emails, so the server
// turns a username into its email here — the email is never sent back to the browser.
const crypto = require('crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../supabase');
const { rateLimit } = require('../services/rateLimit');
const security = require('../services/accountSecurity');
const { LEGAL_VERSION } = require('../services/privacy');
const emailVerify = require('../services/emailVerify');
const dupr = require('../services/dupr');
const { requireCaptcha } = require('../services/captcha');
const { weakReason } = require('../services/passwordCheck');

const announcements = require('./announcements.routes');
const { isOwner } = require('../services/owner');
const router = express.Router();

const USERNAME = /^[a-z][a-z0-9._]{2,29}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = ['male', 'female', 'other'];

// A fresh Auth client per request: signing in must never change the shared service client.
const authClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const cleanLogin = (v) => String(v || '').trim().toLowerCase().slice(0, 200);

// username or email -> email (null when unknown).
async function emailFor(login) {
  if (!login) return null;
  if (login.includes('@')) return EMAIL.test(login) ? login : null;
  if (!USERNAME.test(login)) return null;
  const { data } = await supabase.from('users').select('email').eq('username', login).maybeSingle();
  return data?.email ? String(data.email).toLowerCase() : null;
}

// Where links in emails come back to: the page's origin when it is one of ours.
function webOrigin(req) {
  const allowed = [...String(process.env.CORS_ORIGIN || '').split(','), process.env.PUBLIC_WEB_URL || '']
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\//.test(s));
  let asked = null;
  try {
    asked = new URL(String(req.body?.origin || req.get('origin') || '')).origin;
  } catch {
    asked = null;
  }
  if (asked && (!allowed.length || allowed.includes(asked))) return asked;
  return allowed[0] || null;
}

const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, key: (req) => `ip:${req.ip}` });
const perLogin = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => `login:${cleanLogin(req.body?.login)}` });
const mails = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: (req) => `mail:${req.ip}` });

// Is this username free? (The sign-up form checks as you type.)
router.get('/username', tooMany, async (req, res) => {
  const u = cleanLogin(req.query.u);
  if (!USERNAME.test(u)) return res.json({ valid: false, available: false });
  const { data } = await supabase.from('users').select('id').eq('username', u).maybeSingle();
  res.json({ valid: true, available: !data });
});

// { login: username or email, password } -> { session }
router.post('/login', tooMany, perLogin, requireCaptcha, async (req, res) => {
  const login = cleanLogin(req.body?.login);
  const password = String(req.body?.password || '');
  const bad = () => res.status(401).json({ error: 'Wrong username or password.', code: 'invalid_login' });
  if (!login || !password) return bad();
  try {
    const email = await emailFor(login);
    // Under maintenance only the Owner signs in (the others see the maintenance page).
    const down = await announcements.maintenanceNow();
    if (down && !isOwner(email)) return res.status(503).json(announcements.maintenanceBody(down));
    if (!email) return bad();
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')) {
        return res.status(403).json({ error: 'Email not confirmed yet.', code: 'email_not_confirmed' });
      }
      return bad();
    }
    const s = data.session;
    // Remember the device; a sign-in from a device never seen before is emailed to the
    // account (not the very first device). Never blocks the sign-in.
    let mfa = false;
    try {
      const seen = await security.recordLogin(data.user.id, req.body?.device_id, req.get('user-agent'), req.ip);
      if (seen.isNew && !seen.firstEver) {
        security.emailNewDevice(email, { userAgent: req.get('user-agent'), ip: req.ip, webUrl: webOrigin(req) }).catch(() => {});
      }
      mfa = !!(await security.mfaRow(data.user.id))?.enabled_at;
    } catch {
      /* not migrated yet */
    }
    res.json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type }, mfa_required: mfa });
  } catch (err) {
    console.error('login', err.message);
    res.status(502).json({ error: 'Sign-in is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Quick sign-up: username, password, email and gender (birth date and region are asked
// later, when they are needed). The account works at once — the person is signed in
// and can hold one place — and the email is confirmed with a 6-digit code
// (services/emailVerify.js).
router.post('/signup', tooMany, mails, requireCaptcha, async (req, res) => {
  const b = req.body || {};
  const username = cleanLogin(b.username);
  const email = cleanLogin(b.email);
  const password = String(b.password || '');
  const fail = (code, error, status = 400) => res.status(status).json({ error, code });
  if (!USERNAME.test(username)) return fail('bad_username', 'Username: 3–30 characters, a–z, 0–9, . or _, starting with a letter.');
  if (password.length < 8 || password.length > 72) return fail('weak_password', 'Password: 8–72 characters.');
  if (!EMAIL.test(email)) return fail('bad_email', 'A valid email is required.');
  if (!GENDERS.includes(b.gender)) return fail('bad_gender', 'Gender is required.');
  // Optional now; checked when given.
  const today = new Date().toISOString().slice(0, 10);
  const birth = b.birth_date ? String(b.birth_date) : null;
  if (birth && (!YMD.test(birth) || birth < '1900-01-01' || birth >= today)) return fail('bad_birth_date', 'A valid birth date is required.');
  const region = String(b.region || '').trim().slice(0, 80) || null;
  // Optional DUPR ID; kept with the account and filled in on the welcome step.
  let duprId = null;
  try {
    duprId = dupr.cleanId(b.dupr_id);
  } catch (err) {
    return fail('bad_dupr_id', err.message);
  }
  if (b.accept_terms !== true) return fail('terms_required', 'Accept the Terms and the Privacy Policy to sign up.');
  const weak = await weakReason(password, { username, email });
  if (weak === 'password_like_name') return fail('password_like_name', 'The password must not contain your username or email.');
  if (weak === 'password_leaked') return fail('password_leaked', 'This password appears in leaked password lists. Choose another one.');
  try {
    const { data: taken } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (taken) return fail('username_taken', 'This username is taken.', 409);
    const details = { username, gender: b.gender, ...(birth ? { birth_date: birth } : {}), ...(region ? { region } : {}) };
    const meta = { ...details, ...(duprId ? { dupr_id: duprId } : {}) };
    const { data: created, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
    if (error) {
      if (error.code === 'email_exists' || error.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(error.message || '')) return fail('email_taken', 'This email already has an account.', 409);
      if (error.code === 'weak_password') return fail('weak_password', error.message);
      throw error;
    }
    const userId = created.user.id;
    // The new-user trigger copies the details; set them here too (older databases, races).
    const row = { id: userId, email, ...details, terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString(), email_unverified_since: new Date().toISOString() };
    let { error: uErr } = await supabase.from('users').upsert(row, { onConflict: 'id' });
    // Database without the newer columns yet: save the rest.
    if (uErr && uErr.code !== '23505') ({ error: uErr } = await supabase.from('users').upsert({ id: userId, email, ...details }, { onConflict: 'id' }));
    if (uErr?.code === '23505') {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return fail('username_taken', 'This username is taken.', 409);
    }
    emailVerify.forget(userId);
    const { data: signed, error: sErr } = await authClient().auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    try {
      await security.recordLogin(userId, b.device_id, req.get('user-agent'), req.ip);
    } catch {
      /* not migrated yet */
    }
    let codeSent = true;
    await emailVerify.sendCode(email, webOrigin(req)).catch((err) => {
      codeSent = false;
      console.error('signup code', err.message);
    });
    const s = signed.session;
    res.status(201).json({
      needs_confirmation: false,
      verify_email: true,
      code_sent: codeSent,
      session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type },
    });
  } catch (err) {
    console.error('signup', err.message);
    res.status(502).json({ error: 'Sign-up is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Forgot password: email a link that opens /reset-password on the web. Supabase makes the
// one-time recovery token (generateLink → hashed_token); our own mail sender (Resend)
// sends it. The link also carries `k` = the account id signed by the server, so the new
// password can be checked against the username / email before the one-time token is used.
const RESET_LINK_HOURS = 1;
const linkKey = () => crypto.createHash('sha256').update(`pbm-reset-link:${process.env.MFA_ENC_KEY || ''}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest();
const linkSig = (uid, exp) => crypto.createHmac('sha256', linkKey()).update(`${uid}.${exp}`).digest('base64url');
function signUser(uid) {
  const exp = Math.floor(Date.now() / 1000) + RESET_LINK_HOURS * 3600;
  return `${Buffer.from(uid).toString('base64url')}.${exp}.${linkSig(uid, exp)}`;
}
function readUser(k) {
  const [u, exp, sig] = String(k || '').split('.');
  if (!u || !exp || !sig) return null;
  const uid = Buffer.from(u, 'base64url').toString();
  if (Number(exp) < Date.now() / 1000) return null;
  const want = Buffer.from(linkSig(uid, Number(exp)));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? uid : null;
}

async function sendResetLink(email, origin) {
  if (!process.env.RESEND_API_KEY || !origin) return 'off';
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email });
  // Supabase lets one account ask once a minute; the link already sent still works.
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') return 'wait';
  if (error) console.error('forgot link', error.status || '', error.code || '', error.message);
  const hash = data?.properties?.hashed_token;
  const uid = data?.user?.id;
  if (error || !hash || !uid) return 'no_account';
  const url = `${origin}/reset-password?token_hash=${encodeURIComponent(hash)}&type=recovery&k=${encodeURIComponent(signUser(uid))}`;
  const { subject, text, html } = emailVerify.linkEmail(url, 'reset');
  const r = await security.sendMail(email, subject, text, html);
  if (r !== 'sent') console.error('forgot mail', r);
  return r;
}

// One email per login a minute, the same for every login typed (so the wait never tells
// whether the account exists). Supabase keeps the same one-minute rule per account.
const resendWait = rateLimit({ windowMs: 60 * 1000, max: 1, key: (req) => `forgot:${cleanLogin(req.body?.login)}`, code: 'code_wait' });

// Always answers ok (never says whether the account exists).
router.post('/forgot', tooMany, mails, requireCaptcha, resendWait, async (req, res) => {
  try {
    const email = await emailFor(cleanLogin(req.body?.login));
    const origin = webOrigin(req);
    const sent = email ? await sendResetLink(email, origin) : null;
    if (email && sent !== 'sent' && sent !== 'wait') {
      // No own mail sender (or it failed): Supabase's own "Reset Password" email, whose
      // link ({{ .ConfirmationURL }}) comes back to /reset-password. Its built-in sender
      // only reaches a few addresses an hour — set custom SMTP in Supabase for real use.
      const { error } = await authClient().auth.resetPasswordForEmail(email, origin ? { redirectTo: `${origin}/reset-password` } : {});
      if (error) console.error('forgot', error.status || '', error.code || '', error.message);
    }
  } catch (err) {
    console.error('forgot', err.message);
  }
  res.json({ ok: true, method: 'link' });
});

// The link from the email: { token_hash, k, password }. Sets the new password, signs every
// device out and counts the email as confirmed (the link came to it).
const linkTries = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => `reset-link:${req.ip}` });
router.post('/reset-link', tooMany, linkTries, async (req, res) => {
  const fail = (code, error, status = 400) => res.status(status).json({ error, code });
  const tokenHash = String(req.body?.token_hash || '').trim();
  const password = String(req.body?.password || '');
  const uid = readUser(req.body?.k);
  if (!tokenHash || tokenHash.length > 200 || !uid) return fail('bad_link', 'This link is wrong or has expired.');
  if (password.length < 8 || password.length > 72) return fail('weak_password', 'Password: 8–72 characters.');
  try {
    const { data: u } = await supabase.from('users').select('username, email').eq('id', uid).maybeSingle();
    const weak = await weakReason(password, { username: u?.username, email: u?.email });
    if (weak === 'password_like_name') return fail('password_like_name', 'The password must not contain your username or email.');
    if (weak === 'password_leaked') return fail('password_leaked', 'This password appears in leaked password lists. Choose another one.');
    const { data, error } = await authClient().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data?.user?.id || data.user.id !== uid) return fail('bad_link', 'This link is wrong or has expired.');
    const { error: pErr } = await supabase.auth.admin.updateUserById(uid, { password });
    if (pErr) {
      if (pErr.code === 'weak_password') return fail('weak_password', pErr.message);
      throw pErr;
    }
    await security.signOutEverywhere(uid, data.session?.access_token).catch(() => {});
    await emailVerify.markVerified(uid).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('reset link', err.message);
    res.status(502).json({ error: 'Password reset is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Older reset emails had a 6-digit code: { login, code, password }. Kept so a code already
// sent still works; new emails carry a link (above).
const resetTries = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: (req) => `reset:${cleanLogin(req.body?.login)}` });
router.post('/reset', tooMany, resetTries, async (req, res) => {
  const fail = (code, error, status = 400) => res.status(status).json({ error, code });
  const code = String(req.body?.code || '').replace(/\s+/g, '');
  const password = String(req.body?.password || '');
  if (!/^\d{6}$/.test(code)) return fail('bad_code', 'Enter the 6-digit code.');
  if (password.length < 8 || password.length > 72) return fail('weak_password', 'Password: 8–72 characters.');
  try {
    const email = await emailFor(cleanLogin(req.body?.login));
    if (!email) return fail('bad_code', 'Wrong or expired code.');
    const { data: u } = await supabase.from('users').select('username').eq('email', email).maybeSingle();
    const weak = await weakReason(password, { username: u?.username, email });
    if (weak === 'password_like_name') return fail('password_like_name', 'The password must not contain your username or email.');
    if (weak === 'password_leaked') return fail('password_leaked', 'This password appears in leaked password lists. Choose another one.');
    const { data, error } = await authClient().auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error || !data?.user?.id) return fail('bad_code', 'Wrong or expired code.');
    const userId = data.user.id;
    const { error: pErr } = await supabase.auth.admin.updateUserById(userId, { password });
    if (pErr) {
      if (pErr.code === 'weak_password') return fail('weak_password', pErr.message);
      throw pErr;
    }
    await security.signOutEverywhere(userId, data.session?.access_token).catch(() => {});
    await emailVerify.markVerified(userId).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('reset', err.message);
    res.status(502).json({ error: 'Password reset is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Send the confirmation email again (username or email). Always ok.
router.post('/resend', tooMany, mails, async (req, res) => {
  try {
    const email = await emailFor(cleanLogin(req.body?.login));
    const origin = webOrigin(req);
    if (email) await authClient().auth.resend({ type: 'signup', email, options: origin ? { emailRedirectTo: `${origin}/welcome` } : {} });
  } catch (err) {
    console.error('resend', err.message);
  }
  res.json({ ok: true });
});

// The link in the "reset two-step sign-in" email: the account holder stops a reset they
// did not ask for (no sign-in needed — they may not have their phone or the password).
router.post('/mfa-reset/cancel', tooMany, async (req, res) => {
  try {
    const userId = await security.cancelResetByToken(req.body?.token);
    if (!userId) return res.status(404).json({ error: 'This link is no longer valid.', code: 'reset_link_invalid' });
    const { data: u } = await supabase.from('users').select('id, email').eq('id', userId).maybeSingle();
    await require('../services/owner').audit({ hostEmail: u?.email || null }, { action: 'mfa.reset_cancel', host: u, note: 'Huỷ từ link trong email' });
    res.json({ ok: true });
  } catch (err) {
    console.error('mfa reset cancel', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
module.exports.webOrigin = webOrigin;
