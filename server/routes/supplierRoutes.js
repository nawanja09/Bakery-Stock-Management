const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all suppliers
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, address, vat_number, vat_registered, city, 
             contact_name, contact_phone, contact_email 
      FROM supplier
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single supplier
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const [rows] = await pool.query(`
      SELECT id, name, address, vat_number, vat_registered, city,
             contact_name, contact_phone, contact_email
      FROM supplier 
      WHERE id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST new supplier
router.post('/', async (req, res) => {
  const { 
    name, 
    address, 
    vat_number,
    vat_registered,
    city, 
    contact_name, 
    contact_phone, 
    contact_email
  } = req.body;

  // Validate VAT number if registered
  if (vat_registered && !vat_number) {
    return res.status(400).json({ error: 'VAT Number is required for registered suppliers' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO supplier
      (name, address, vat_number, vat_registered, city, contact_name, contact_phone, contact_email) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, address, vat_number || null, vat_registered || false, city, contact_name, contact_phone, contact_email]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Supplier added successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update supplier
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, address, vat_number, vat_registered, city, contact_name, contact_phone, contact_email } = req.body;

  // Validate VAT number if registered
  if (vat_registered && !vat_number) {
    return res.status(400).json({ error: 'VAT Number is required for registered suppliers' });
  }

  try {
    await pool.query(
      `UPDATE supplier 
       SET name=?, address=?, vat_number=?, vat_registered=?, city=?, contact_name=?, contact_phone=?, contact_email=? 
       WHERE id=?`,
      [name, address, vat_number || null, vat_registered || false, city, contact_name, contact_phone, contact_email, id]
    );

    res.json({ message: 'Supplier updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE supplier
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM supplier WHERE id=?', [id]);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;