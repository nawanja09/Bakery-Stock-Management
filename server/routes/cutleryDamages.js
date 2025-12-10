const express = require('express');
const router = express.Router();
const {
  getDamages,
  getDamageById,
  createDamage,
  updateDamage,
  deleteDamage,
  getDamageFormData
} = require('../controllers/cutleryDamagesController');

// Routes
router.get('/', getDamages);
router.get('/form-data', getDamageFormData);
router.get('/:id', getDamageById);
router.post('/', createDamage);
router.put('/:id', updateDamage);
router.delete('/:id', deleteDamage);

module.exports = router;