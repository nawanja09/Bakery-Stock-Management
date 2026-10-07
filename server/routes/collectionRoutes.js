// server/routes/collectionRoutes.js
//
// Collection module. Mounted at /api/collections (see server.js).
// Access (config/rolePermissions.js, `collection` module):
//   Accountant, Admin, Super Admin -> view + approve / reject / restore
//   QB                          -> view only (every POST refused with 403)
//   any other role              -> 403 on every endpoint
// Enforced here on every route, independently of what the UI shows.
const express = require('express');
const router = express.Router();
const controller = require('../controllers/collectionController');
const { collectionReadAccess, collectionWriteAccess } = require('../middleware/moduleAccess');

// Fixed paths BEFORE the parameterised '/:id'.
router.get('/', ...collectionReadAccess, controller.listCollections);
router.get('/departments', ...collectionReadAccess, controller.getDepartmentOptions);
router.get('/pending', ...collectionReadAccess, controller.getPending);
router.get('/completed', ...collectionReadAccess, controller.getCompleted);
router.get('/rejected', ...collectionReadAccess, controller.getRejected);

router.post('/approve', ...collectionWriteAccess, controller.approve);
router.post('/reject', ...collectionWriteAccess, controller.reject);
router.post('/restore', ...collectionWriteAccess, controller.restore);

router.get('/:id', ...collectionReadAccess, controller.getCollectionById);

module.exports = router;
