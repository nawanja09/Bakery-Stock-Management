const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, wastageController.createWastage);
router.get('/', authenticate, wastageController.getAllWastages);
router.get('/:id', authenticate, wastageController.getWastageById);
router.put('/:id', authenticate, wastageController.updateWastage);
router.delete('/:id', authenticate, wastageController.deleteWastage);

module.exports = router;