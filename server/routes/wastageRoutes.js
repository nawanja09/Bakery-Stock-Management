const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, wastageController.createWastage);
router.get('/', authenticate, wastageController.getAllWastages);
router.get('/:id', authenticate, wastageController.getWastageById);

module.exports = router;
