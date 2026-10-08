const express = require('express');
const inventoryStore = require('../services/inventoryStore');

// The organiser's own ball store for Xé Vé kèo (no club): /api/inventory.
const router = express.Router();
inventoryStore.mount(router, '', (req) => ({ host_id: req.hostId, club_id: null }));

module.exports = router;
