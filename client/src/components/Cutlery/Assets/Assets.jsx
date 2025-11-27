import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddAssetForm from './AddAssetForm';
import './Assets.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

const Assets = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-assets');
      setAssets(response.data);
    } catch (err) {
      console.error('Error fetching assets:', err);
      showPopup('error', 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsset = async (assetData) => {
    try {
      const formData = new FormData();
      formData.append('asset_name', assetData.asset_name);
      formData.append('description', assetData.description || '');

      if (assetData.image) {
        formData.append('image', assetData.image);
      }

      const response = await api.post('/cutlery-assets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      showPopup('success', response.data.message);
      setShowAddForm(false);
      fetchAssets();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add asset');
    }
  };

  const handleViewAsset = (id) => {
    navigate(`/cutlery/assets/view/${id}`);
  };

  const handleEditAsset = (id) => {
    navigate(`/cutlery/assets/edit/${id}`);
  };

  const handleDeleteAsset = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await api.delete(`/cutlery-assets/${id}`);
        showPopup('success', 'Asset deleted successfully');
        fetchAssets();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete asset');
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading assets...</div>;
  }

  return (
    <div className="assets-container">
      <div className="assets-header">
        <h2>Cutlery Assets</h2>
        <button className="btn-add-asset" onClick={() => setShowAddForm(true)}>
          + Add New Asset
        </button>
      </div>

      {showAddForm && (
        <AddAssetForm
          onSubmit={handleAddAsset}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="assets-grid-container">
        {assets.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🍴</div>
            <p>No assets found. Add your first asset to get started.</p>
          </div>
        ) : (
          <div className="assets-grid">
            {assets.map(asset => (
              <div key={asset.id} className="asset-card">
                <div
                  className="asset-image clickable"
                  onClick={() => handleViewAsset(asset.id)}
                >
                  {asset.image_url ? (
                    <img
                      src={asset.image_url}
                      alt={asset.asset_name}
                      onError={(e) => {
                        e.target.src = '/images/cutlery-placeholder.png';
                        e.target.onerror = null;
                      }}
                    />
                  ) : (
                    <div className="asset-placeholder">
                      <div className="cutlery-icon">🍴</div>
                      <span>No Image</span>
                    </div>
                  )}
                </div>

                <div className="asset-info">
                  <div className="asset-id">{asset.asset_id}</div>
                  <h3
                    className="asset-name clickable"
                    onClick={() => handleViewAsset(asset.id)}
                  >
                    {asset.asset_name}
                  </h3>
                  {asset.description && (
                    <p className="asset-description">{asset.description}</p>
                  )}
                  <div className="asset-meta">
                    <span className="created-date">
                      Added: {new Date(asset.created_at).toLocaleDateString()}
                    </span>
                    <span className="updated-date">
                      Updated: {new Date(asset.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Buttons Now Horizontal */}
                <div className="asset-actions">
                  <button
                    className="btn-view"
                    onClick={() => handleViewAsset(asset.id)}
                    title="View Asset"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button
                className="btn-edit"
                onClick={() => handleEditAsset(asset.id)}
                title="Edit Asset"
              >
                <FontAwesomeIcon icon={faPen} />
              </button>

              <button
                className="btn-delete"
                onClick={() => handleDeleteAsset(asset.id, asset.asset_name)}
                title="Delete Asset"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Assets;
