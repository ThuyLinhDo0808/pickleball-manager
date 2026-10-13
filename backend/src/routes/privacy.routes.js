// /api/host/privacy — the signed-in account's personal data:
//   GET  /consent   which Terms / Privacy version was accepted, whether a new one is due
//   POST /consent   accept the current version
//   GET  /export    "download my data" (JSON)
const express = require('express');
const privacy = require('../services/privacy');
const { rateLimit } = require('../services/rateLimit');

const router = express.Router();
const exportsPerHour = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: (req) => `export:${req.userId}` });

router.get('/consent', async (req, res) => {
  res.json(await privacy.consentOf(req.userId));
});

router.post('/consent', async (req, res) => {
  if (req.body?.accept !== true) return res.status(400).json({ error: 'Accept the Terms and the Privacy Policy.', code: 'terms_required' });
  try {
    res.json({ ok: true, ...(await privacy.accept(req.userId)) });
  } catch {
    res.status(409).json({ error: 'Run migration 20261114090000_privacy_consent.sql first.', code: 'migration_required' });
  }
});

router.get('/export', exportsPerHour, async (req, res) => {
  try {
    const data = await privacy.exportMyData(req.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="du-lieu-cua-toi.json"');
    res.json(data);
  } catch (err) {
    console.error('export', err.message);
    res.status(500).json({ error: 'Could not prepare your data. Please try again.' });
  }
});

module.exports = router;
