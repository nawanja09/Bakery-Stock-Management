const pool = require('../config/db');
const bcrypt = require('bcrypt');

// Get all users
const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create new user
const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  
  try {
    // Check if user exists
    const [existing] = await pool.query(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
      [name, email, hashedPassword, role]
    );
    
    res.status(201).json({ 
      message: 'User created successfully', 
      userId: result.insertId 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update user
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role } = req.body;
  
  try {
    // Check if user exists
    const [user] = await pool.query(
      'SELECT * FROM users WHERE id = ?', 
      [id]
    );
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    await pool.query(
      'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?', 
      [name, email, role, id]
    );
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if user exists
    const [user] = await pool.query(
      'SELECT * FROM users WHERE id = ?', 
      [id]
    );
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting admin users
    if (user[0].role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser
};