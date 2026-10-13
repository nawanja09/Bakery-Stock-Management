// server/routes/integrationRoutes.js
//
// The signed-in user's OWN RAVON POS / Restaurant access. Mounted at
// /api/integrations (server.js). Role rule '/integrations' in
// config/rolePermissions.js: roles with the Collection or FG Production module;
// read only.
//
//   GET  /access   which Collection sources / FG item list this user may use,
//                  validated against POS / Restaurant (never a token or password)
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorizeApi = require('../middleware/authorizeApi');
const integrationAccess = require('../services/integrationAccess');

router.get('/access', authenticate, authorizeApi, async (req, res) => {
  try {
    const access = await integrationAccess.getAccess(req.user?.userId || null);
    res.json(integrationAccess.getAccessSummary(access));
  } catch (error) {
    console.error('Failed to load POS / Restaurant access:', error.message);
    res.status(500).json({ error: 'Failed to load POS / Restaurant access' });
  }
});

module.exports = router;
