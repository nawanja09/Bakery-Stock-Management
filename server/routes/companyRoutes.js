//server/routes/companyRoutes.js

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

router.get('/', companyController.getAllCompanies);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.delete('/:id', companyController.deleteCompany);

module.exports = router;
