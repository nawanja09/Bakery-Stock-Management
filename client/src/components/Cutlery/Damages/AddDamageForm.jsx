import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './AddDamageForm.css';

const AddDamageForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    damage_date: new Date().toISOString().split('T')[0],
    location_id: '',
    reason: 'Broken',
    notes: '',
    reported_by: '',
    status: 'Reported',
    items: [{ asset_id: '', quantity: 1, unit_price: 0, notes: '' }]
  });
  const [formOptions, setFormOptions] = useState({
    locations: [],
    assets: [],
    reasons: [],
    statuses: []
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showPopup } = usePopup();

  const fetchFormData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-damages/form-data');
      setFormOptions(response.data);
    } catch (err) {
      console.error('Error fetching form data:', err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

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
    
    // Calculate total loss if quantity or unit price changes
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = field === 'quantity' ? parseFloat(value) : newItems[index].quantity;
      const unitPrice = field === 'unit_price' ? parseFloat(value) : newItems[index].unit_price;
      newItems[index].total_loss = quantity * unitPrice;
    }
    
    setFormData(prev => ({
      ...prev,
      items: newItems
    }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { asset_id: '', quantity: 1, unit_price: 0, notes: '' }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({
        ...prev,
        items: newItems
      }));
    } else {
      showPopup('error', 'At least one item is required');
    }
  };

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      return total + (quantity * unitPrice);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.damage_date || !formData.location_id || !formData.reason || !formData.reported_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    // Validate items
    const validItems = formData.items.filter(item => 
      item.asset_id && item.quantity > 0
    );
    
    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one valid item');
      return;
    }

    const submitData = {
      ...formData,
      items: validItems.map(item => ({
        asset_id: item.asset_id,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price) || 0,
        notes: item.notes || ''
      }))
    };

    setSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="add-damage-form-overlay">
        <div className="add-damage-form-container">
          <div className="loading">Loading form data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-damage-form-overlay">
      <div className="add-damage-form-container">
        <div className="add-damage-form-header">
          <h3>Add New Damage Record</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onCancel}
            disabled={submitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-damage-form">
          <div className="form-section">
            <h4>Damage Information</h4>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="damage_date">Damage Date *</label>
                <input
                  type="date"
                  id="damage_date"
                  name="damage_date"
                  value={formData.damage_date}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="location_id">Location *</label>
                <select
                  id="location_id"
                  name="location_id"
                  value={formData.location_id}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="">Select Location</option>
                  {formOptions.locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.location_name} ({location.location_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="reason">Reason *</label>
                <select
                  id="reason"
                  name="reason"
                  value={formData.reason}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  {formOptions.reasons.map(reason => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="reported_by">Reported By *</label>
                <input
                  type="text"
                  id="reported_by"
                  name="reported_by"
                  value={formData.reported_by}
                  onChange={handleChange}
                  placeholder="Enter name of person reporting"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={submitting}
                >
                  {formOptions.statuses.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Damaged Items</h4>
            
            <div className="items-header">
              <span>Items ({formData.items.length})</span>
              <button 
                type="button" 
                className="btn-add-item"
                onClick={addItem}
                disabled={submitting}
              >
                + Add Item
              </button>
            </div>

            <div className="items-list">
              {formData.items.map((item, index) => (
                <div key={index} className="item-row">
                  <div className="item-fields">
                    <div className="form-group">
                      <label>Asset *</label>
                      <select
                        value={item.asset_id}
                        onChange={(e) => handleItemChange(index, 'asset_id', e.target.value)}
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
                      <label>Quantity *</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        min="1"
                        step="1"
                        required
                        disabled={submitting}
                      />
                    </div>

                    <div className="form-group">
                      <label>Unit Price (LKR)</label>
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        disabled={submitting}
                      />
                    </div>

                    <div className="form-group">
                      <label>Item Notes</label>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        placeholder="Optional item notes"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      className="btn-remove-item"
                      onClick={() => removeItem(index)}
                      disabled={submitting}
                      title="Remove Item"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h4>Additional Information</h4>
            
            <div className="form-group">
              <label htmlFor="notes">General Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Enter any additional notes about the damage (optional)"
                rows="3"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-total">
            <div className="total-label">Estimated Total Loss:</div>
            <div className="total-amount">{formatCurrency(calculateTotalLoss())}</div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Damage Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDamageForm;