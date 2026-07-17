// routes/paymentMethodRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod
} = require('../controllers/paymentMethodController');

// NOTE: if your other routers apply an auth middleware (e.g. verifyToken)
// before their handlers, add the same middleware here to match — it was
// left out because the middleware file/name wasn't part of the uploaded
// files, so this router as-is defers entirely to your existing global
// auth setup (if any) rather than guessing at a middleware name.

router.get('/', getAllPaymentMethods);
router.post('/', createPaymentMethod);
router.put('/:id', updatePaymentMethod);
router.delete('/:id', deletePaymentMethod);

module.exports = router;