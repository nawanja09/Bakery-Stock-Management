// server/routes/collectionRoutes.js
//
// Collection module. Mounted at /api/collections (see server.js).
// Access (config/rolePermissions.js, `collection` module):
//   Accountant                  -> view + approve / reject / restore
//   Admin, Super Admin          -> view + reject / restore (approve is Accountant only)
//   QB                          -> view only (every POST refused with 403)
//   any other role              -> 403 on every endpoint
// Enforced here on every route, independently of what the UI shows.
const express = require('express');
const router = express.Router();
const controller = require('../controllers/collectionController');
const { collectionReadAccess, collectionWriteAccess } = require('../middleware/moduleAccess');

// POS / Restaurant connection (rule /collections/integrations in rolePermissions.js:
// any signed-in role reaches the controller, which allows status to Collection
// users + Accountant / Admin / Super Admin and Connect to the latter
// only; QB is refused on POST by the view-only rule). Authenticated by the BSMS
// JWT in the Authorization header - no cookie, so a cross-site form cannot
// trigger it (no CSRF exposure). Connect is rate limited in the controller.
router.get('/integrations/status', ...collectionReadAccess, controller.getIntegrationsStatus);
router.post('/integrations/:provider/connect', ...collectionWriteAccess, controller.connectIntegration);

// Fixed paths BEFORE the parameterised '/:id'.
router.get('/', ...collectionReadAccess, controller.listCollections);
router.get('/departments', ...collectionReadAccess, controller.getDepartmentOptions);
router.get('/pending', ...collectionReadAccess, controller.getPending);
router.get('/completed', ...collectionReadAccess, controller.getCompleted);
router.get('/rejected', ...collectionReadAccess, controller.getRejected);

// Records the sync did not accept / approved collections that changed upstream (audit M4).
router.get('/data-issues', ...collectionReadAccess, controller.getDataIssues);
router.get('/data-issues/:id', ...collectionReadAccess, controller.getDataIssue);
router.post('/data-issues/:id/resolve', ...collectionWriteAccess, controller.resolveDataIssue);

router.post('/approve', ...collectionWriteAccess, controller.approve);
router.post('/reject', ...collectionWriteAccess, controller.reject);
router.post('/restore', ...collectionWriteAccess, controller.restore);

router.get('/:id', ...collectionReadAccess, controller.getCollectionById);

module.exports = router;
