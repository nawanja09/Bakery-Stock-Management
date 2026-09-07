const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { rawMaterialAccess } = require('../middleware/moduleAccess');

router.use(...rawMaterialAccess);

// Helper function to validate VAT number
const validateVATNumber = (vatNumber, isVatRegistered) => {
  // If not registered, VAT number is not required
  if (!isVatRegistered) {
    return { isValid: true, message: '' };
  }
  
  // Check if VAT number is provided
  if (!vatNumber || vatNumber.trim() === '') {
    return { 
      isValid: false, 
      message: 'VAT Number is required for registered suppliers' 
    };
  }
  
  // Remove any whitespace
  const cleanVatNumber = vatNumber.trim();
  
  // Check if it contains only digits
  const digitsOnlyRegex = /^\d+$/;
  if (!digitsOnlyRegex.test(cleanVatNumber)) {
    return { 
      isValid: false, 
      message: 'VAT Number must contain only digits (0-9)' 
    };
  }
  
  // Check if it's exactly 9 digits
  if (cleanVatNumber.length !== 9) {
    return { 
      isValid: false, 
      message: 'VAT Number must be exactly 9 digits long' 
    };
  }
  
  return { isValid: true, message: '' };
};

// GET all suppliers
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, address, vat_number, vat_registered, city, 
             contact_name, contact_phone, contact_email 
      FROM supplier
      WHERE COALESCE(status, 1) = 1
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET all outstanding records across ALL suppliers
// Must be registered BEFORE the /:id route to avoid route conflicts
const supplierCreditController = require('../controllers/supplierCreditController');
router.get('/outstanding/all', supplierCreditController.getAllOutstandingRecords);

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
    console.error('Error fetching supplier:', error);
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

  // Validate required fields
  if (!name || !address || !city || !contact_name || !contact_phone) {
    return res.status(400).json({ 
      error: 'Name, address, city, contact name, and contact phone are required' 
    });
  }

  // Validate VAT number if registered
  const vatValidation = validateVATNumber(vat_number, vat_registered);
  if (!vatValidation.isValid) {
    return res.status(400).json({ error: vatValidation.message });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO supplier
      (name, address, vat_number, vat_registered, city, contact_name, contact_phone, contact_email) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(), 
        address.trim(), 
        vat_registered ? vat_number.trim() : null, 
        vat_registered || false, 
        city.trim(), 
        contact_name.trim(), 
        contact_phone.trim(), 
        contact_email ? contact_email.trim() : null
      ]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Supplier added successfully'
    });
  } catch (error) {
    console.error('Error adding supplier:', error);
    
    // Check for duplicate entry or other database errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Supplier with this information already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update supplier
router.put('/:id', async (req, res) => {
  const { id } = req.params;
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

  // Validate required fields
  if (!name || !address || !city || !contact_name || !contact_phone) {
    return res.status(400).json({ 
      error: 'Name, address, city, contact name, and contact phone are required' 
    });
  }

  // Validate VAT number if registered
  const vatValidation = validateVATNumber(vat_number, vat_registered);
  if (!vatValidation.isValid) {
    return res.status(400).json({ error: vatValidation.message });
  }

  try {
    // First check if supplier exists
    const [existing] = await pool.query('SELECT id FROM supplier WHERE id = ?', [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    await pool.query(
      `UPDATE supplier 
       SET name=?, address=?, vat_number=?, vat_registered=?, city=?, 
           contact_name=?, contact_phone=?, contact_email=? 
       WHERE id=?`,
      [
        name.trim(), 
        address.trim(), 
        vat_registered ? vat_number.trim() : null, 
        vat_registered || false, 
        city.trim(), 
        contact_name.trim(), 
        contact_phone.trim(), 
        contact_email ? contact_email.trim() : null, 
        id
      ]
    );

    res.json({ message: 'Supplier updated successfully' });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE supplier (soft delete)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Soft delete: mark as inactive/deleted instead of removing the row,
    // so the record is preserved for history/reference purposes.
    const [result] = await pool.query(
      'UPDATE supplier SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;