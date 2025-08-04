const express = require('express');
const { loginUser,changePassword } = require('../controllers/authController');

const router = express.Router();

router.post('/login', loginUser);
router.post('/change-password', changePassword);

module.exports = router;