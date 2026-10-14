const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const { signedUploadUrl } = require('../utils/signedUploads');

const getAssets = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM cutlery_assets 
      WHERE COALESCE(status, 1) = 1
      ORDER BY created_at DESC
    `);
    
    // Convert image paths to full URLs
    const assetsWithImageUrls = rows.map(asset => ({
      ...asset,
      image_url: signedUploadUrl(req, 'cutlery-assets', asset.image_path)
    }));
    
    res.json(assetsWithImageUrls);
  } catch (err) {
    console.error('Error fetching assets:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createAsset = async (req, res) => {
  try {
    const { asset_name, description } = req.body;

    if (!asset_name) {
      return res.status(400).json({ error: 'Asset name is required' });
    }

    // Get the next asset ID (A001, A002, etc.)
    const [maxId] = await pool.query(`
      SELECT asset_id FROM cutlery_assets 
      ORDER BY id DESC LIMIT 1
    `);

    let nextId = 'A001';
    if (maxId.length > 0) {
      const lastId = maxId[0].asset_id;
      const lastNumber = parseInt(lastId.substring(1));
      nextId = 'A' + String(lastNumber + 1).padStart(3, '0');
    }

    // Prepare image path
    let imagePath = null;
    if (req.file) {
      imagePath = req.file.filename; // Store only filename
    }

    // Insert new asset
    const [result] = await pool.query(
      'INSERT INTO cutlery_assets (asset_id, asset_name, image_path, description) VALUES (?, ?, ?, ?)',
      [nextId, asset_name, imagePath, description]
    );

    // Get the created asset with image URL
    const [newAsset] = await pool.query(
      'SELECT * FROM cutlery_assets WHERE id = ?',
      [result.insertId]
    );

    const assetWithUrl = {
      ...newAsset[0],
      image_url: signedUploadUrl(req, 'cutlery-assets', newAsset[0].image_path)
    };

    res.status(201).json({ 
      message: 'Asset added successfully',
      asset: assetWithUrl
    });
  } catch (err) {
    console.error('Error adding asset:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Asset name already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;

    // Get asset info to delete the image file
    const [asset] = await pool.query(
      'SELECT image_path FROM cutlery_assets WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    const [result] = await pool.query(
      'UPDATE cutlery_assets SET status = 0 WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Delete the image file if it exists
    if (asset.length > 0 && asset[0].image_path) {
      const imagePath = path.join(__dirname, '../uploads/cutlery-assets', asset[0].image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.json({ message: 'Asset deleted successfully' });
  } catch (err) {
    console.error('Error deleting asset:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAssetById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM cutlery_assets WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = rows[0];
    const assetWithUrl = {
      ...asset,
      image_url: signedUploadUrl(req, 'cutlery-assets', asset.image_path)
    };

    res.json(assetWithUrl);
  } catch (err) {
    console.error('Error fetching asset:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { asset_name, description } = req.body;

    if (!asset_name) {
      return res.status(400).json({ error: 'Asset name is required' });
    }

    // Check if asset exists
    const [existingAsset] = await pool.query(
      'SELECT * FROM cutlery_assets WHERE id = ? AND COALESCE(status, 1) = 1',
      [id]
    );

    if (existingAsset.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    let imagePath = existingAsset[0].image_path;

    // If new image is uploaded, delete old image and use new one
    if (req.file) {
      // Delete old image if exists
      if (existingAsset[0].image_path) {
        const oldImagePath = path.join(__dirname, '../uploads/cutlery-assets', existingAsset[0].image_path);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imagePath = req.file.filename;
    }

    // Update asset
    const [result] = await pool.query(
      'UPDATE cutlery_assets SET asset_name = ?, description = ?, image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [asset_name, description, imagePath, id]
    );

    // Get updated asset
    const [updatedAsset] = await pool.query(
      'SELECT * FROM cutlery_assets WHERE id = ?',
      [id]
    );

    const assetWithUrl = {
      ...updatedAsset[0],
      image_url: signedUploadUrl(req, 'cutlery-assets', updatedAsset[0].image_path)
    };

    res.json({ 
      message: 'Asset updated successfully',
      asset: assetWithUrl
    });
  } catch (err) {
    console.error('Error updating asset:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Asset name already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAssets,
  createAsset,
  deleteAsset,
  getAssetById,
  updateAsset
};