import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditTransfer.css';

const EditTransfer = ({ transfer, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    transfer_date: '',
    location_from_id: '',
    location_to_id: '',
    asset_id: '',
    quantity: 1,
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
    // Initialize form with transfer data
    setFormData({
      transfer_date: transfer.transfer_date,
      location_from_id: transfer.location_from_id,
      location_to_id: transfer.location_to_id,
      asset_id: transfer.asset_id,
      quantity: transfer.quantity,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.transfer_date || !formData.location_from_id || !formData.location_to_id || 
        !formData.asset_id || !formData.quantity || !formData.transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    if (formData.location_from_id === formData.location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }

    if (formData.quantity <= 0) {
      showPopup('error', 'Quantity must be greater than 0');
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
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="asset_id">Asset *</label>
                <select
                  id="asset_id"
                  name="asset_id"
                  value={formData.asset_id}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="">Select Asset</option>
                  {formOptions.assets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_name} ({asset.asset_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="quantity">Quantity *</label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  min="1"
                  required
                  disabled={submitting}
                />
              </div>
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
              type="button"
              className="btn-cancel"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
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