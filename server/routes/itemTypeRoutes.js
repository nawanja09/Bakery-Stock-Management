//server/routes/itemTypeRoutes.js

const express = require('express');
const router = express.Router();
const itemTypeController = require('../controllers/itemTypeController');

router.get('/', itemTypeController.getAllItemTypes);
router.post('/', itemTypeController.createItemType);

module.exports = router;
