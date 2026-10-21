import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditAsset.css';

const EditAsset = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [formData, setFormData] = useState({
    asset_name: '',
    description: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchAsset();
  }, [id]);

  const fetchAsset = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cutlery-assets/${id}`);
      const assetData = response.data;
      setAsset(assetData);
      setFormData({
        asset_name: assetData.asset_name,
        description: assetData.description || '',
        image: null
      });
      setImagePreview(assetData.image_url);
      setImageError(false);
    } catch (err) {
      console.error('Error fetching asset:', err);
      showPopup('error', 'Failed to load asset');
      navigate('/cutlery/assets');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showPopup('error', 'Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showPopup('error', 'File size must be less than 5MB');
        return;
      }
      setFormData(prev => ({ ...prev, image: file }));
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
        setImageError(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, image: null }));
    setImagePreview(asset?.image_url || null);
    setImageError(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.asset_name.trim()) {
      showPopup('error', 'Please enter an asset name');
      return;
    }
    setSubmitting(true);
    try {
      const submitData = new FormData();
      submitData.append('asset_name', formData.asset_name);
      submitData.append('description', formData.description || '');
      if (formData.image) submitData.append('image', formData.image);

      const response = await api.put(`/cutlery-assets/${id}`, submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showPopup('success', response.data.message);
      navigate('/cutlery/assets');
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update asset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => navigate('/cutlery/assets');
  const triggerFileInput = () => fileInputRef.current?.click();

  if (loading) return <div className="loading" role="status" aria-live="polite">Loading asset...</div>;
  if (!asset) return <div className="error">Asset not found</div>;

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Edit Asset</h2>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={handleCancel}>← Back</button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="edit-asset-form">
        <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Basic Info</h3>
          <div className="form-group">
            <label>Asset ID</label>
            <input type="text" value={asset.asset_id} disabled className="disabled-input"/>
            <small>Cannot be changed</small>
          </div>
          <div className="form-group">
            <label>Asset Name *</label>
            <input
              name="asset_name"
              value={formData.asset_name}
              onChange={handleChange}
              placeholder="Enter asset name"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Asset Image</h3>
          <div className="form-group">
            <label>Current / New Image</label>
            <div className="image-upload" onClick={triggerFileInput}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageChange}
                className="file-input"
                disabled={submitting}
              />
              {imagePreview && !imageError ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" onError={() => setImageError(true)} />
                  <button
                    type="button"
                    className="btn-remove-image"
                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                    disabled={submitting}
                  >×</button>
                </div>
              ) : (
                <div className="image-placeholder">
                  <div className="upload-icon">📁</div>
                  <p>Click to upload image</p>
                  <small>JPG, PNG, GIF (Max 5MB)</small>
                </div>
              )}
            </div>
            <small>Leave unchanged to keep current image</small>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={submitting || !formData.asset_name.trim()}>
            {submitting ? 'Updating...' : 'Update Asset'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditAsset;
