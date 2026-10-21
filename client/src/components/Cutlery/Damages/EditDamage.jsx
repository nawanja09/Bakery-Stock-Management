import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditDamage.css';
import { Modal } from '../../common/ui';

const EditDamage = ({ damage, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    damage_date: '',
    location_id: '',
    reason: 'Broken',
    notes: '',
    reported_by: '',
    status: 'Reported',
    items: []
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

  // Fetch form options and initialize form data
  const fetchFormData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch dropdown options
      const response = await api.get('/cutlery-damages/form-data');
      setFormOptions(response.data);

      console.log('Fetched form options:', {
        assetsCount: response.data.assets?.length,
        assets: response.data.assets,
        damageItems: damage.items
      });

      // Initialize form with damage data
      const initialItems = damage.items?.map(item => {
        console.log('Processing damage item:', item);
        return {
          id: item.id,
          asset_id: item.asset_id,
          asset_name: item.asset_name || '',
          quantity: item.quantity,
          unit_price: item.unit_price || 0,
          notes: item.notes || ''
        };
      }) || [{ asset_id: '', asset_name: '', quantity: 1, unit_price: 0, notes: '' }];

      console.log('Initial items:', initialItems);

      setFormData({
        damage_date: damage.damage_date ? damage.damage_date.split('T')[0] : '',
        location_id: damage.location_id || '',
        reason: damage.reason || 'Broken',
        notes: damage.notes || '',
        reported_by: damage.reported_by || '',
        status: damage.status || 'Reported',
        items: initialItems
      });
    } catch (err) {
      console.error('Error fetching form data:', err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  }, [damage, showPopup]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    // If changing asset_id, also update asset_name
    if (field === 'asset_id') {
      const assetId = value === '' ? '' : Number(value);
      const selectedAsset = formOptions.assets.find(asset => asset.id === assetId);
      
      newItems[index] = {
        ...newItems[index],
        asset_id: assetId,
        asset_name: selectedAsset ? selectedAsset.asset_name : ''
      };
      
      console.log('Asset changed:', {
        assetId,
        selectedAsset,
        allAssets: formOptions.assets
      });
    } else if (field === 'quantity' || field === 'unit_price') {
      // Ensure numbers are numbers
      const numValue = parseFloat(value) || 0;
      newItems[index] = { ...newItems[index], [field]: numValue };
    } else {
      // For other fields
      newItems[index] = { ...newItems[index], [field]: value };
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { asset_id: '', asset_name: '', quantity: 1, unit_price: 0, notes: '' }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
    } else {
      showPopup('error', 'At least one item is required');
    }
  };

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      return total + ((item.quantity || 0) * (item.unit_price || 0));
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate that onSubmit is a function
    if (typeof onSubmit !== 'function') {
      console.error('onSubmit is not a function:', onSubmit);
      showPopup('error', 'Form submission error. Please try again.');
      return;
    }

    if (!formData.damage_date || !formData.location_id || !formData.reason || !formData.reported_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    const validItems = formData.items.filter(item => item.asset_id && item.quantity > 0);
    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one valid item');
      return;
    }

    const submitData = {
      damage_date: formData.damage_date,
      location_id: formData.location_id,
      reason: formData.reason,
      notes: formData.notes || '',
      reported_by: formData.reported_by,
      status: formData.status,
      items: validItems.map(item => ({
        asset_id: item.asset_id,
        quantity: item.quantity,
        unit_price: item.unit_price || 0,
        notes: item.notes || ''
      }))
    };

    console.log('Submitting data:', submitData);

    setSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
      showPopup('error', error.message || 'Failed to update damage record');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <Modal title={`Edit Damage Record - ${damage.damage_id}`} size="xl" onClose={onCancel} className="cutlery-form-modal">
        <div className="loading" role="status" aria-live="polite">Loading form data...</div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Edit Damage Record - ${damage.damage_id}`}
      size="xl"
      onClose={submitting ? undefined : onCancel}
      className="cutlery-form-modal"
    >
      <form onSubmit={handleSubmit} className="edit-damage-form">
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
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
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
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Damaged Items</h4>
          <div className="items-header">
            <span>Items ({formData.items.length})</span>
            <button type="button" className="btn-add-item" onClick={addItem} disabled={submitting}>+ Add Item</button>
          </div>

          <div className="items-list">
            {formData.items.map((item, index) => {
              console.log('Rendering item:', item, 'at index:', index);
              return (
                <div key={item.id || index} className="item-row">
                  <div className="item-fields">
                    <div className="form-group">
                      <label>Asset *</label>
                      <select
                        value={item.asset_id || ''}
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
                      {item.asset_id && (
                        <div className="selected-asset-info">
                          <small>
                            Selected: {item.asset_name || 'Unknown Asset'} 
                            {!item.asset_name && ` (ID: ${item.asset_id})`}
                          </small>
                        </div>
                      )}
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
                    <button type="button" className="btn-remove-item" onClick={() => removeItem(index)} disabled={submitting} title="Remove Item">×</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-total">
          <div className="total-label">Estimated Total Loss:</div>
          <div className="total-amount">{formatCurrency(calculateTotalLoss())}</div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Damage Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditDamage;