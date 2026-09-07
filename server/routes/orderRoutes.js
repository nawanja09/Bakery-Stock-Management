const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Fixed routes before parameterized routes (same convention as itemRoutes.js)
router.get('/low-stock', orderController.getLowStock);
router.get('/pending', orderController.getPendingOrders);
router.get('/completed', orderController.getCompletedOrders);
router.post('/', orderController.createOrder);
router.get('/:id/for-invoice', orderController.getOrderForInvoice);
router.patch('/:id/cancel', orderController.cancelOrder);
router.get('/:id', orderController.getOrderById);

module.exports = router;
