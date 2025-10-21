const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, returnController.createReturn);
router.get('/', authenticate, returnController.getAllReturns);
router.get('/:id', authenticate, returnController.getReturnById);

module.exports = router;