const express = require('express');
const router = express.Router();
const issuanceController = require('../controllers/issuanceController');

router.post('/', issuanceController.createIssuance);
router.get('/', issuanceController.getAllIssuances);
router.get('/:id', issuanceController.getIssuanceById);
router.put('/:id', issuanceController.updateIssuance);

module.exports = router;