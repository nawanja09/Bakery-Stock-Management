const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ALLOWED_EXTENSIONS } = require('../utils/signedUploads');
const {
  getAssets,
  createAsset,
  deleteAsset,
  getAssetById,
  updateAsset
} = require('../controllers/cutleryAssetsController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/cutlery-assets');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'asset-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// The browser-sent MIME type alone is not trusted: the extension must be an
// image one too, or e.g. 'x.html' labelled image/png would be stored and served.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype.startsWith('image/') && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Routes
router.get('/', getAssets);
router.get('/:id', getAssetById); 
router.post('/', upload.single('image'), createAsset);
router.put('/:id', upload.single('image'), updateAsset); 
router.delete('/:id', deleteAsset);

module.exports = router;