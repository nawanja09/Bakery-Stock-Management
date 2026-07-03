import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './AddAssetForm.css';

const AddAssetForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    asset_name: '',
    description: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      setFormData(prev => ({ ...prev, image: file }));

      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, image: null }));
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.asset_name.trim()) {
      alert('Please enter an asset name');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  const inner = (
    <div className="add-asset-overlay" onClick={onCancel}>
      <div className="add-asset-card" onClick={(e) => e.stopPropagation()}>
        <div className="add-asset-header">
          <h2>Add New Asset</h2>
          <button className="btn-close" onClick={onCancel} disabled={submitting}>×</button>
        </div>

        <form className="add-asset-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="asset_name">Asset Name *</label>
            <input
              type="text"
              id="asset_name"
              name="asset_name"
              value={formData.asset_name}
              onChange={handleChange}
              placeholder="Enter asset name"
              disabled={submitting}
            />
            <small>Asset ID will be automatically generated (A001, A002, etc.)</small>
          </div>

          <div className="form-group">
            <label>Asset Image</label>
            <div className="image-upload-wrapper" onClick={triggerFileInput}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="file-input"
                disabled={submitting}
              />

              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button
                    type="button"
                    className="btn-remove-image"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveImage();
                    }}
                    disabled={submitting}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="image-placeholder">
                  <div className="upload-icon">📁</div>
                  <p>Click to upload image</p>
                  <small>JPG, PNG, GIF (Max 5MB)</small>
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-submit" disabled={submitting || !formData.asset_name.trim()}>
              {submitting ? 'Adding...' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return inner;
  return ReactDOM.createPortal(inner, document.body);
};

export default AddAssetForm;
