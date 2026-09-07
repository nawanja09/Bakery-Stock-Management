//server/routes/departmentRoutes.js

const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

router.get('/departments', departmentController.getAllDepartments);
router.post('/departments', departmentController.createDepartment);
router.put('/departments/:id', departmentController.updateDepartment);
router.delete('/departments/:id', departmentController.deleteDepartment);

module.exports = router;