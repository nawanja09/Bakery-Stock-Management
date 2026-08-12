const pool = require('../config/db');
const bcrypt = require('bcrypt');

// Get all users
const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, role FROM users WHERE COALESCE(status, 1) = 1');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create new user
const createUser = async (req, res) => {
  const { name, username, password, role } = req.body;

  try {
    // Check if user exists
    const [existing] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await pool.query(
      'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
      [name, username, hashedPassword, role]
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
  const { name, username, role } = req.body;

  try {
    // Check if user exists
    const [user] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If the username is changing, make sure it doesn't collide with another user
    if (username && username !== user[0].username) {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Update user
    await pool.query(
      'UPDATE users SET name = ?, username = ?, role = ? WHERE id = ?',
      [name, username, role, id]
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
    await pool.query('UPDATE users SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1', [id]);

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
