import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './AddTransferForm.css';

const AddTransferForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    transfer_date: new Date().toISOString().split('T')[0],
    location_from_id: '',
    location_to_id: '',
    transferred_by: '',
    status: 'Pending', // Add status field
    notes: '',
    assets: [{ // Change from single asset to array
      asset_id: '',
      quantity: 1
    }]
  });

  const [formOptions, setFormOptions] = useState({ locations: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchFormData();
  }, []);

  const fetchFormData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-transfers/form-data');
      setFormOptions(response.data);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle asset change for specific index
  const handleAssetChange = (index, field, value) => {
    const newAssets = [...formData.assets];
    newAssets[index] = { ...newAssets[index], [field]: value };
    setFormData(prev => ({ ...prev, assets: newAssets }));
  };

  // Add new asset row
  const addAsset = () => {
    setFormData(prev => ({
      ...prev,
      assets: [...prev.assets, { asset_id: '', quantity: 1 }]
    }));
  };

  // Remove asset row
  const removeAsset = (index) => {
    if (formData.assets.length > 1) {
      const newAssets = [...formData.assets];
      newAssets.splice(index, 1);
      setFormData(prev => ({ ...prev, assets: newAssets }));
    } else {
      showPopup('error', 'At least one asset is required');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const { transfer_date, location_from_id, location_to_id, transferred_by, assets } = formData;
    
    if (!transfer_date || !location_from_id || !location_to_id || !transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    if (location_from_id === location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }

    // Validate all assets
    const validAssets = assets.filter(asset => 
      asset.asset_id && asset.quantity > 0
    );
    
    if (validAssets.length === 0) {
      showPopup('error', 'Please add at least one asset with valid quantity');
      return;
    }

    // Check for duplicate assets
    const assetIds = validAssets.map(a => a.asset_id);
    const uniqueAssetIds = [...new Set(assetIds)];
    if (assetIds.length !== uniqueAssetIds.length) {
      showPopup('error', 'Duplicate assets found. Please select different assets.');
      return;
    }

    setSubmitting(true);
    try {
      // Prepare data for API - multiple assets
      const submitData = {
        transfer_date,
        location_from_id,
        location_to_id,
        transferred_by,
        status: formData.status,
        notes: formData.notes,
        assets: validAssets.map(asset => ({
          asset_id: asset.asset_id,
          quantity: parseInt(asset.quantity)
        }))
      };

      await onSubmit(submitData);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="form-overlay">
        <div className="form-container">
          <div className="loading">Loading form data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-overlay">
      <div className="form-container">
        <div className="form-header">
          <h3>Add New Transfer</h3>
          <button type="button" className="btn-close" onClick={onCancel} disabled={submitting}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="form-body">
          <section className="form-section">
            <h4>Transfer Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="transfer_date">Transfer Date *</label>
                <input 
                  type="date" 
                  id="transfer_date" 
                  name="transfer_date" 
                  value={formData.transfer_date} 
                  onChange={handleChange} 
                  disabled={submitting} 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="transferred_by">Transferred By *</label>
                <input 
                  type="text" 
                  id="transferred_by" 
                  name="transferred_by" 
                  value={formData.transferred_by} 
                  onChange={handleChange} 
                  placeholder="Enter name" 
                  disabled={submitting} 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="status">Status *</label>
                <select 
                  id="status" 
                  name="status" 
                  value={formData.status} 
                  onChange={handleChange} 
                  disabled={submitting}
                  required
                >
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4>Location Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="location_from_id">From Location *</label>
                <select 
                  id="location_from_id" 
                  name="location_from_id" 
                  value={formData.location_from_id} 
                  onChange={handleChange} 
                  disabled={submitting}
                  required
                >
                  <option value="">Select Source</option>
                  {formOptions.locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name} ({loc.location_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="location_to_id">To Location *</label>
                <select 
                  id="location_to_id" 
                  name="location_to_id" 
                  value={formData.location_to_id} 
                  onChange={handleChange} 
                  disabled={submitting}
                  required
                >
                  <option value="">Select Destination</option>
                  {formOptions.locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name} ({loc.location_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4>Asset Details</h4>
            <div className="assets-header">
              <span>Assets ({formData.assets.length})</span>
              <button 
                type="button" 
                className="btn-add-asset"
                onClick={addAsset}
                disabled={submitting}
              >
                + Add Another Asset
              </button>
            </div>
            
            {formData.assets.map((asset, index) => (
              <div key={index} className="asset-row">
                <div className="form-row">
                  <div className="form-group">
                    <label>Asset *</label>
                    <select 
                      value={asset.asset_id} 
                      onChange={(e) => handleAssetChange(index, 'asset_id', e.target.value)}
                      disabled={submitting}
                      required
                    >
                      <option value="">Select Asset</option>
                      {formOptions.assets.map(assetOption => (
                        <option key={assetOption.id} value={assetOption.id}>
                          {assetOption.asset_name} ({assetOption.asset_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input 
                      type="number" 
                      value={asset.quantity} 
                      onChange={(e) => handleAssetChange(index, 'quantity', e.target.value)}
                      min="1" 
                      disabled={submitting}
                      required
                    />
                  </div>
                  {formData.assets.length > 1 && (
                    <div className="form-group remove-btn-container">
                      <button 
                        type="button" 
                        className="btn-remove-asset"
                        onClick={() => removeAsset(index)}
                        disabled={submitting}
                        title="Remove Asset"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="form-section">
            <h4>Additional Information</h4>
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea 
                id="notes" 
                name="notes" 
                value={formData.notes} 
                onChange={handleChange} 
                placeholder="Optional notes" 
                rows="3" 
                disabled={submitting}
              ></textarea>
            </div>
          </section>

          <div className="form-actions">
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransferForm;