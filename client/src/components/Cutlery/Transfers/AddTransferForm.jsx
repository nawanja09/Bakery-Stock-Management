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
    status: 'Pending',
    notes: '',
    items: [{ asset_id: '', quantity: 1 }]
  });

  const [formOptions, setFormOptions] = useState({ 
    locations: [], 
    assets: [] 
  });
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
      setFormOptions({
        locations: response.data?.data?.locations || [],
        assets: response.data?.data?.assets || []
      });
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load form data');
      // Set empty arrays to prevent undefined error
      setFormOptions({ locations: [], assets: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: field === 'quantity' ? parseInt(value) || 0 : value };
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { asset_id: '', quantity: 1 }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
    } else {
      showPopup('error', 'At least one asset is required');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const { transfer_date, location_from_id, location_to_id, transferred_by, items } = formData;
    
    if (!transfer_date || !location_from_id || !location_to_id || !transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    if (location_from_id === location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }

    // Validate items
    const validItems = items.filter(item => item.asset_id && item.quantity > 0);
    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one asset with quantity');
      return;
    }

    // Check for duplicate assets
    const assetIds = validItems.map(item => item.asset_id);
    if (new Set(assetIds).size !== assetIds.length) {
      showPopup('error', 'Duplicate assets are not allowed');
      return;
    }

    const submitData = {
      ...formData,
      items: validItems.map(item => ({
        asset_id: parseInt(item.asset_id),
        quantity: parseInt(item.quantity)
      }))
    };

    setSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (err) {
      console.error('Form submission error:', err);
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
          <button 
            type="button" 
            className="btn-close" 
            onClick={onCancel} 
            disabled={submitting}
          >
            ×
          </button>
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
                  {formOptions.locations && formOptions.locations.map(loc => (
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
                  {formOptions.locations && formOptions.locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name} ({loc.location_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <div className="assets-header">
              <h4>Asset Details</h4>
              <button
                type="button"
                className="btn-add-asset"
                onClick={addItem}
                disabled={submitting}
              >
                + Add Asset
              </button>
            </div>
            
            {formData.items.map((item, index) => (
              <div key={index} className="asset-item-row">
                <div className="form-row">
                  <div className="form-group">
                    <label>Asset *</label>
                    <select
                      value={item.asset_id}
                      onChange={(e) => handleItemChange(index, 'asset_id', e.target.value)}
                      disabled={submitting}
                      required
                    >
                      <option value="">Select Asset</option>
                      {formOptions.assets && formOptions.assets.map(asset => (
                        <option key={asset.id} value={asset.id}>
                          {asset.asset_name} ({asset.asset_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      min="1"
                      step="1"
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    className="btn-remove-item"
                    onClick={() => removeItem(index)}
                    disabled={submitting}
                    title="Remove Asset"
                  >
                    Remove
                  </button>
                )}
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
              />
            </div>
          </section>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransferForm;