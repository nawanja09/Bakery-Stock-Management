import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './AddTransferForm.css';

const AddTransferForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    transfer_date: new Date().toISOString().split('T')[0],
    location_from_id: '',
    location_to_id: '',
    asset_id: '',
    quantity: 1,
    notes: '',
    transferred_by: ''
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const { transfer_date, location_from_id, location_to_id, asset_id, quantity, transferred_by } = formData;
    if (!transfer_date || !location_from_id || !location_to_id || !asset_id || !quantity || !transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }
    if (location_from_id === location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }
    if (quantity <= 0) {
      showPopup('error', 'Quantity must be greater than 0');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      console.error(err);
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
                <input type="date" id="transfer_date" name="transfer_date" value={formData.transfer_date} onChange={handleChange} disabled={submitting} />
              </div>
              <div className="form-group">
                <label htmlFor="transferred_by">Transferred By *</label>
                <input type="text" id="transferred_by" name="transferred_by" value={formData.transferred_by} onChange={handleChange} placeholder="Enter name" disabled={submitting} />
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4>Location Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="location_from_id">From Location *</label>
                <select id="location_from_id" name="location_from_id" value={formData.location_from_id} onChange={handleChange} disabled={submitting}>
                  <option value="">Select Source</option>
                  {formOptions.locations.map(loc => <option key={loc.id} value={loc.id}>{loc.location_name} ({loc.location_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="location_to_id">To Location *</label>
                <select id="location_to_id" name="location_to_id" value={formData.location_to_id} onChange={handleChange} disabled={submitting}>
                  <option value="">Select Destination</option>
                  {formOptions.locations.map(loc => <option key={loc.id} value={loc.id}>{loc.location_name} ({loc.location_id})</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4>Asset Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="asset_id">Asset *</label>
                <select id="asset_id" name="asset_id" value={formData.asset_id} onChange={handleChange} disabled={submitting}>
                  <option value="">Select Asset</option>
                  {formOptions.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.asset_name} ({asset.asset_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="quantity">Quantity *</label>
                <input type="number" id="quantity" name="quantity" value={formData.quantity} min="1" onChange={handleChange} disabled={submitting} />
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4>Additional Information</h4>
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} placeholder="Optional notes" rows="3" disabled={submitting}></textarea>
            </div>
          </section>

          <div className="form-actions">
            <button type="submit" className="btn-submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Transfer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransferForm;
