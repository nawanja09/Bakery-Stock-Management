// server/routes/employeeRoutes.js

const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { employeeAccess } = require('../middleware/moduleAccess');

router.use(...employeeAccess);

router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', employeeController.createEmployee);
router.put('/:id', employeeController.updateEmployee);
router.patch('/:id/status', employeeController.updateEmployeeStatus);

module.exports = router;
