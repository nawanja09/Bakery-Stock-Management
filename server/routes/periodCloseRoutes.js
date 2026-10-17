// server/routes/periodCloseRoutes.js - Period Close: the open window + re-open requests.
// Admin / Super Admin; approve and reject are Super Admin only (config/rolePermissions.js).
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorizeApi = require('../middleware/authorizeApi');
const controller = require('../controllers/periodCloseController');

router.use(authenticate, authorizeApi);

router.get('/status', controller.getStatus);
router.get('/requests', controller.listRequests);
router.post('/requests', controller.createRequest);
router.post('/approve', controller.approveRequest);
router.post('/reject', controller.rejectRequest);
router.post('/close', controller.closeRequest);

module.exports = router;
