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
      const res = await api.get('/cutlery-assets');
      setAssets(res.data);
    } catch (err) {
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
      if (assetData.image) formData.append('image', assetData.image);

      const res = await api.post('/cutlery-assets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      showPopup('success', res.data.message);
      setShowAddForm(false);
      fetchAssets();
    } catch (err) {
      showPopup('error', 'Failed to add asset');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/cutlery-assets/${id}`);
      showPopup('success', 'Asset deleted');
      fetchAssets();
    } catch {
      showPopup('error', 'Delete failed');
    }
  };

  if (loading) return <div className="loading">Loading assets…</div>;

  return (
    <div className="assets-page">
      <header className="assets-header">
        <h2>Cutlery Assets</h2>
        <button className="primary-btn" onClick={() => setShowAddForm(true)}>
          + Add Asset
        </button>
      </header>

      {showAddForm && (
        <AddAssetForm
          onSubmit={handleAddAsset}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {assets.length === 0 ? (
        <div className="empty-state">
          <span>🍴</span>
          <p>No assets found</p>
        </div>
      ) : (
        <div className="assets-grid">
          {assets.map(asset => (
            <div key={asset.id} className="asset-card">
              <div
                className="asset-image"
                onClick={() => navigate(`/cutlery/assets/view/${asset.id}`)}
              >
                {asset.image_url ? (
                  <img src={asset.image_url} alt={asset.asset_name} />
                ) : (
                  <div className="image-placeholder">🍴</div>
                )}
              </div>

              <div className="asset-body">
                <span className="asset-code">{asset.asset_id}</span>
                <h3>{asset.asset_name}</h3>

                {asset.description && (
                  <p className="desc">{asset.description}</p>
                )}

                <div className="dates">
                  <span>Added: {new Date(asset.created_at).toLocaleDateString()}</span>
                  <span>Updated: {new Date(asset.updated_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="asset-actions">
                <button
                  className="icon-btn view"
                  onClick={() => navigate(`/cutlery/assets/view/${asset.id}`)}
                >
                  <FontAwesomeIcon icon={faEye} />
                </button>

                <button
                  className="icon-btn edit"
                  onClick={() => navigate(`/cutlery/assets/edit/${asset.id}`)}
                >
                  <FontAwesomeIcon icon={faPen} />
                </button>

                <button
                  className="icon-btn delete"
                  onClick={() => handleDelete(asset.id, asset.asset_name)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Assets;
