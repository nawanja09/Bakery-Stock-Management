// server/routes/auditLogRoutes.js - Audit Trail (read-only; Admin / Super Admin).
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorizeApi = require('../middleware/authorizeApi');
const controller = require('../controllers/auditLogController');

router.use(authenticate, authorizeApi);

router.get('/', controller.listAuditLogs);
router.get('/summary', controller.getAuditSummary);
router.get('/filters', controller.getAuditFilters);
router.get('/:id', controller.getAuditLog);

module.exports = router;
