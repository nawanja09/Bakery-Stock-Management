import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './ViewAsset.css';

const ViewAsset = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    setImageError(false);
    fetchAsset();
  }, [id]);

  const fetchAsset = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cutlery-assets/${id}`);
      setAsset(response.data);
    } catch (err) {
      console.error('Error fetching asset:', err);
      showPopup('error', 'Failed to load asset');
      navigate('/cutlery/assets');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`/cutlery/assets/edit/${id}`);
  };

  const handleBack = () => {
    navigate('/cutlery/assets');
  };

  if (loading) {
    return <div className="loading">Loading asset details...</div>;
  }

  if (!asset) {
    return <div className="error">Asset not found</div>;
  }

  return (
    <div className="view-asset-container">
      <div className="view-asset-header">
        <button className="btn-back" onClick={handleBack}>
          ← Back to Assets
        </button>
        <h2>Asset Details</h2>
        <button className="btn-edit-main" onClick={handleEdit}>
          Edit Asset
        </button>
      </div>

      <div className="asset-details">
        <div className="asset-image-section">
          {asset.image_url && !imageError ? (
            <div className="asset-image-large">
              <img 
                src={asset.image_url} 
                alt={asset.asset_name}
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="asset-placeholder-large">
              <div className="cutlery-icon-large">🍴</div>
              <span>No Image Available</span>
            </div>
          )}
        </div>

        <div className="asset-info-section">
          <div className="info-card">
            <h3>Basic Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Asset ID:</label>
                <span className="asset-id">{asset.asset_id}</span>
              </div>
              <div className="info-item">
                <label>Asset Name:</label>
                <span className="asset-name">{asset.asset_name}</span>
              </div>
              <div className="info-item full-width">
                <label>Description:</label>
                <span className="asset-description">
                  {asset.description || 'No description provided'}
                </span>
              </div>
            </div>
          </div>

          <div className="info-card">
            <h3>Timestamps</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Created:</label>
                <span>{new Date(asset.created_at).toLocaleString()}</span>
              </div>
              <div className="info-item">
                <label>Last Updated:</label>
                <span>{new Date(asset.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-edit-secondary" onClick={handleEdit}>
              Edit Asset
            </button>
            <button className="btn-back-secondary" onClick={handleBack}>
              Back to List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAsset;