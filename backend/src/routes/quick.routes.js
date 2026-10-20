// No login: quick booking by the Host's rotating invite link (services/quickBooking.js).
const express = require('express');
const { isUuid } = require('../utils/respond');
const quick = require('../services/quickBooking');
const { suspensionOf } = require('../services/owner');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

function fail(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.free != null ? { free: err.free } : {}) });
  console.error('quick booking', err);
  res.status(500).json({ error: 'Internal server error.' });
}

// A suspended Host's kèo takes no sign-ups.
async function hostActive(eventId) {
  const { supabase } = require('../supabase');
  const { data } = await supabase.from('events').select('host_id').eq('id', eventId).maybeSingle();
  if (data && (await suspensionOf(data.host_id).catch(() => null))) throw Object.assign(new Error('This organiser is not taking sign-ups right now.'), { status: 403, code: 'host_suspended' });
}

router.post('/:eventId/open', async (req, res) => {
  if (!isUuid(req.params.eventId)) return res.status(404).json({ error: 'Not found.' });
  try {
    await hostActive(req.params.eventId);
    res.json(await quick.open(req.params.eventId, req.body?.code));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:eventId/book', optionalAuth, async (req, res) => {
  if (!isUuid(req.params.eventId)) return res.status(404).json({ error: 'Not found.' });
  try {
    await hostActive(req.params.eventId);
    res.status(201).json(await quick.book(req.params.eventId, req.body || {}, req.userId || null));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/booking/:token', async (req, res) => {
  try {
    const { booking, event } = await quick.bookingByToken(req.params.token);
    res.json(await quick.view(event, booking));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/booking/:token/proof', async (req, res) => {
  try {
    res.json(await quick.submitProof(req.params.token, req.body?.image));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
