const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { 
  getUsers, 
  createUser, 
  updateUser, 
  deleteUser 
} = require('../controllers/userController');

// Only admin can manage users
router.get('/', authenticate, getUsers);
router.post('/', authenticate, createUser);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, deleteUser);

module.exports = router;