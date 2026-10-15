// /api/host/security — the signed-in account's own security settings:
//   GET    /                       two-step status, devices, whether the account must use 2-step
//   POST   /mfa/setup              new secret + otpauth link (QR) — not active until confirmed
//   POST   /mfa/enable    {code}   confirm the setup → recovery codes (shown once)
//   POST   /mfa/verify    {code}   pass the second step for this sign-in session
//   POST   /mfa/disable   {code}   turn two-step off (not for owner / support accounts)
//   POST   /mfa/recovery  {code}   new recovery codes (old ones stop working)
//   POST   /mfa/reset-cancel       stop a reset the Owner started (needs this sign-in's code)
//   POST   /logout-all             sign out on every device
//   DELETE /devices/:id            forget a device (the next sign-in there emails again)
// These answer even before the second step is passed (see accountSecurity.gate).
const express = require('express');
const { supabase } = require('../supabase');
const security = require('../services/accountSecurity');
const support = require('../services/support');
const { rateLimit } = require('../services/rateLimit');

const router = express.Router();
const MIGRATION = '20261113090000_account_security.sql';

// Codes are 6 digits: at most 10 tries per account per 10 minutes (and per IP).
const codeTries = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => `mfa:${req.userId}` });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    if (/user_mfa|mfa_sessions|login_devices|sessions_revoked_at|does not exist|schema cache/i.test(err.message || '')) {
      return res.status(409).json({ error: `Run migration ${MIGRATION} first.`, code: 'migration_required' });
    }
    console.error('security', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// Owners and support staff must keep two-step sign-in on; so do club / community managers
// (HOST_MFA_REQUIRED).
const mustUseMfa = async (req) =>
  (security.consoleNeedsMfa() && !!(await support.consoleAccess(req.hostEmail))) || (security.hostNeedsMfa() && (await security.isManager(req)));

router.get('/', wrap(async (req, res) => {
  const row = await security.mfaRow(req.userId);
  const verifiedAt = row?.enabled_at ? await security.sessionVerifiedAt(req.userId, req.sessionKey) : null;
  res.json({
    mfa: {
      enabled: !!row?.enabled_at,
      enabled_at: row?.enabled_at || null,
      verified: !!verifiedAt,
      recovery_left: row?.enabled_at ? (row.recovery_hashes || []).length : 0,
      // An Owner reset waiting to take effect (lost phone): when, and when it was asked.
      reset: row?.enabled_at && row.reset_at ? { at: row.reset_at, requested_at: row.reset_requested_at } : null,
    },
    required: await mustUseMfa(req),
    devices: await security.devices(req.userId),
  });
}));

router.post('/mfa/setup', wrap(async (req, res) => {
  const { data: u } = await supabase.from('users').select('username, email').eq('id', req.userId).maybeSingle();
  res.json(await security.startSetup(req.userId, u?.username || u?.email || req.hostEmail || 'account'));
}));

router.post('/mfa/enable', codeTries, wrap(async (req, res) => {
  const codes = await security.confirmSetup(req.userId, req.body?.code, req.sessionKey);
  res.json({ ok: true, recovery_codes: codes });
}));

router.post('/mfa/verify', codeTries, wrap(async (req, res) => {
  res.json({ ok: true, ...(await security.verifySession(req.userId, req.body?.code, req.sessionKey)) });
}));

router.post('/mfa/disable', codeTries, wrap(async (req, res) => {
  if (await mustUseMfa(req)) return res.status(409).json({ error: 'Owner and support accounts must keep two-step sign-in on.', code: 'mfa_required_for_role' });
  await security.disable(req.userId, req.body?.code);
  res.json({ ok: true });
}));

router.post('/mfa/recovery', codeTries, wrap(async (req, res) => {
  res.json({ ok: true, recovery_codes: await security.regenerateRecovery(req.userId, req.body?.code) });
}));

router.post('/mfa/reset-cancel', wrap(async (req, res) => {
  // Only someone who still has the code (or a recovery code) for this sign-in can stop it.
  const at = await security.sessionVerifiedAt(req.userId, req.sessionKey);
  if (!at) return res.status(403).json({ error: 'Enter the code from your authenticator app.', code: 'mfa_required' });
  const stopped = await security.cancelReset(req.userId);
  if (stopped) {
    const { data: u } = await supabase.from('users').select('id, email').eq('id', req.userId).maybeSingle();
    await require('../services/owner').audit({ hostEmail: req.hostEmail }, { action: 'mfa.reset_cancel', host: u, note: 'Huỷ bởi chủ tài khoản' });
  }
  res.json({ ok: true, stopped });
}));

router.post('/logout-all', wrap(async (req, res) => {
  res.json({ ok: true, revoked_at: await security.signOutEverywhere(req.userId, req.accessToken) });
}));

router.delete('/devices/:id', wrap(async (req, res) => {
  await supabase.from('login_devices').delete().eq('id', req.params.id).eq('user_id', req.userId);
  res.json({ ok: true });
}));

module.exports = router;
