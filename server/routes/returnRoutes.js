const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, returnController.createReturn);
router.get('/', authenticate, returnController.getAllReturns);
router.get('/:id', authenticate, returnController.getReturnById);
router.get('/item-stock/:itemId', authenticate, returnController.getItemCurrentStock);

module.exports = router;