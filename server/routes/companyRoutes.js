//server/routes/companyRoutes.js

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

router.get('/', companyController.getAllCompanies);
router.post('/', companyController.createCompany);

module.exports = router;
