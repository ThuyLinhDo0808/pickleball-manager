// Signing in with a username (or email), signing up with the required details, and
// "forgot password". No login needed. Supabase Auth only knows emails, so the server
// turns a username into its email here — the email is never sent back to the browser.
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../supabase');
const { rateLimit } = require('../services/rateLimit');

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
router.post('/login', tooMany, perLogin, async (req, res) => {
  const login = cleanLogin(req.body?.login);
  const password = String(req.body?.password || '');
  const bad = () => res.status(401).json({ error: 'Wrong username or password.', code: 'invalid_login' });
  if (!login || !password) return bad();
  try {
    const email = await emailFor(login);
    if (!email) return bad();
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')) {
        return res.status(403).json({ error: 'Email not confirmed yet.', code: 'email_not_confirmed' });
      }
      return bad();
    }
    const s = data.session;
    res.json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type } });
  } catch (err) {
    console.error('login', err.message);
    res.status(502).json({ error: 'Sign-in is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Sign up with everything we need: username, password, email, birth date, gender, region.
router.post('/signup', tooMany, mails, async (req, res) => {
  const b = req.body || {};
  const username = cleanLogin(b.username);
  const email = cleanLogin(b.email);
  const password = String(b.password || '');
  const fail = (code, error, status = 400) => res.status(status).json({ error, code });
  if (!USERNAME.test(username)) return fail('bad_username', 'Username: 3–30 characters, a–z, 0–9, . or _, starting with a letter.');
  if (password.length < 8 || password.length > 72) return fail('weak_password', 'Password: 8–72 characters.');
  if (!EMAIL.test(email)) return fail('bad_email', 'A valid email is required.');
  const today = new Date().toISOString().slice(0, 10);
  if (!YMD.test(String(b.birth_date || '')) || b.birth_date < '1900-01-01' || b.birth_date >= today) return fail('bad_birth_date', 'A valid birth date is required.');
  if (!GENDERS.includes(b.gender)) return fail('bad_gender', 'Gender is required.');
  const region = String(b.region || '').trim().slice(0, 80);
  if (!region) return fail('bad_region', 'Region is required.');
  try {
    const { data: taken } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (taken) return fail('username_taken', 'This username is taken.', 409);
    const origin = webOrigin(req);
    const details = { username, birth_date: b.birth_date, gender: b.gender, region };
    const { data, error } = await authClient().auth.signUp({
      email,
      password,
      options: { data: details, ...(origin ? { emailRedirectTo: `${origin}/welcome` } : {}) },
    });
    if (error) {
      if (error.code === 'user_already_exists' || /already registered/i.test(error.message || '')) return fail('email_taken', 'This email already has an account.', 409);
      if (error.code === 'weak_password') return fail('weak_password', error.message);
      if (/rate limit/i.test(error.message || '')) return fail('email_rate_limit', error.message, 429);
      throw error;
    }
    // With email confirmation on, an existing email comes back as a user with no identities.
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) return fail('email_taken', 'This email already has an account.', 409);
    // The new-user trigger copies the details; set them here too (older databases, races).
    const { error: uErr } = await supabase.from('users').upsert({ id: data.user.id, email, ...details }, { onConflict: 'id' });
    if (uErr?.code === '23505') {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      return fail('username_taken', 'This username is taken.', 409);
    }
    const s = data.session;
    res.status(201).json({
      needs_confirmation: !s,
      session: s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type } : null,
    });
  } catch (err) {
    console.error('signup', err.message);
    res.status(502).json({ error: 'Sign-up is unavailable right now.', code: 'auth_unavailable' });
  }
});

// Forgot password: email a reset link. Always answers ok (never says whether the
// account exists).
router.post('/forgot', tooMany, mails, async (req, res) => {
  try {
    const email = await emailFor(cleanLogin(req.body?.login));
    const origin = webOrigin(req);
    if (email) {
      const { error } = await authClient().auth.resetPasswordForEmail(email, origin ? { redirectTo: `${origin}/reset-password` } : {});
      if (error) console.error('forgot', error.message);
    }
  } catch (err) {
    console.error('forgot', err.message);
  }
  res.json({ ok: true });
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

module.exports = router;
