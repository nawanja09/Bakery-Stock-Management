import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditTransfer.css';

const EditTransfer = ({ transfer, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    transfer_date: '',
    location_from_id: '',
    location_to_id: '',
    // support multiple assets
    items: [{ asset_id: '', quantity: 1 }],
    notes: '',
    transferred_by: '',
    status: 'Pending'
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

    // Format transfer_date to YYYY-MM-DD for input[type="date"]
    const formattedDate = transfer.transfer_date
      ? new Date(transfer.transfer_date).toISOString().split('T')[0]
      : '';

    // Initialize form with transfer data
    setFormData({
      transfer_date: formattedDate,
      location_from_id: transfer.location_from_id,
      location_to_id: transfer.location_to_id,
      items: [{ asset_id: transfer.asset_id || '', quantity: transfer.quantity || 1 }],
      notes: transfer.notes || '',
      transferred_by: transfer.transferred_by,
      status: transfer.status
    });
  }, [transfer]);

  const fetchFormData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-transfers/form-data');
      setFormOptions(response.data);
    } catch (err) {
      console.error('Error fetching form data:', err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'quantity') newItems[index].quantity = parseInt(value || 0, 10);
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { asset_id: '', quantity: 1 }] }));
  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.transfer_date || !formData.location_from_id || !formData.location_to_id || !formData.transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    if (formData.location_from_id === formData.location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }

    const validItems = formData.items.filter(i => i.asset_id && i.quantity > 0);
    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one asset with quantity > 0');
      return;
    }

    setSubmitting(true);
    try {
      const validItems = formData.items.filter(i => i.asset_id && i.quantity > 0);
      if (validItems.length === 1) {
        // Convert to legacy single-asset payload expected by server update
        const payload = {
          transfer_date: formData.transfer_date,
          location_from_id: formData.location_from_id,
          location_to_id: formData.location_to_id,
          asset_id: validItems[0].asset_id,
          quantity: validItems[0].quantity,
          notes: formData.notes,
          transferred_by: formData.transferred_by,
          status: formData.status
        };
        await onSubmit(payload);
      } else if (validItems.length > 1) {
        showPopup('error', 'Editing multiple assets in a single transfer is not supported. Please edit individual transfers or create a new transfer.');
      } else {
        showPopup('error', 'Please add at least one asset with quantity > 0');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="edit-transfer-overlay">
        <div className="edit-transfer-container">
          <div className="loading">Loading form data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-transfer-overlay">
      <div className="edit-transfer-container">
        <div className="edit-transfer-header">
          <h3>Edit Transfer - {transfer.transfer_id}</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onCancel}
            disabled={submitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-transfer-form">
          <div className="form-section">
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
                  required
                  disabled={submitting}
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
                  placeholder="Enter person name"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status *</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Location Details</h4>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="location_from_id">From Location *</label>
                <select
                  id="location_from_id"
                  name="location_from_id"
                  value={formData.location_from_id}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="">Select Source Location</option>
                  {formOptions.locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.location_name} ({location.location_id})
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
                  required
                  disabled={submitting}
                >
                  <option value="">Select Destination Location</option>
                  {formOptions.locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.location_name} ({location.location_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Asset Details</h4>
            <div className="items-header">
              <span>Assets ({formData.items.length})</span>
              <button type="button" className="btn-add-item" onClick={addItem} disabled={submitting}>+ Add Asset</button>
            </div>
            <div className="items-list">
              {formData.items.map((item, i) => (
                <div key={i} className="item-row">
                  <div className="form-group">
                    <label>Asset *</label>
                    <select value={item.asset_id} onChange={e => handleItemChange(i, 'asset_id', e.target.value)} required disabled={submitting}>
                      <option value="">Select Asset</option>
                      {formOptions.assets.map(asset => (
                        <option key={asset.id} value={asset.id}>
                          {asset.asset_name} ({asset.asset_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Quantity *</label>
                    <input type="number" value={item.quantity} onChange={e => handleItemChange(i, 'quantity', e.target.value)} min="1" required disabled={submitting} />
                  </div>

                  {formData.items.length > 1 && <button type="button" className="btn-remove-item" onClick={() => removeItem(i)} disabled={submitting} title="Remove Asset">×</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h4>Additional Information</h4>
            
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Enter any additional notes (optional)"
                rows="3"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Updating...' : 'Update Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTransfer;
