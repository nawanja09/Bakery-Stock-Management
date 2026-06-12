//server/controllers/authController.js

const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not defined. Authentication will fail.');
}

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (match) {
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ 
        message: 'Login successful!', 
        token,
        user: { id: user.id, email: user.email, role: user.role }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;  
  const userId = req.user.userId;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?', 
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?', 
      [hashedPassword, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

const registerUser = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)', 
      [name, email, hashedPassword]
    );
    
    res.status(201).json({ 
      message: 'User registered successfully', 
      userId: result.insertId 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};  

module.exports = { loginUser, changePassword, registerUser };