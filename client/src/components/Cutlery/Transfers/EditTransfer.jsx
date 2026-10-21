import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditTransfer.css';
import { Modal } from '../../common/ui';

const EditTransfer = ({ transfer, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    transfer_date: '',
    location_from_id: '',
    location_to_id: '',
    transferred_by: '',
    status: 'Pending',
    notes: '',
    items: []
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

  useEffect(() => {
    if (transfer && formOptions.assets.length > 0) {
      // Format transfer_date to YYYY-MM-DD
      const formattedDate = transfer.transfer_date
        ? new Date(transfer.transfer_date).toISOString().split('T')[0]
        : '';

      // Initialize form with transfer data including items
      setFormData({
        transfer_date: formattedDate,
        location_from_id: transfer.location_from_id,
        location_to_id: transfer.location_to_id,
        transferred_by: transfer.transferred_by,
        status: transfer.status || 'Pending',
        notes: transfer.notes || '',
        items: transfer.items && transfer.items.length > 0 
          ? transfer.items.map(item => ({
              asset_id: item.asset_id.toString(),
              quantity: item.quantity
            }))
          : [{ asset_id: '', quantity: 1 }]
      });
    }
  }, [transfer, formOptions]);

  const fetchFormData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-transfers/form-data');
      setFormOptions({
        locations: response.data?.data?.locations || [],
        assets: response.data?.data?.assets || []
      });
    } catch (err) {
      console.error('Error fetching form data:', err);
      showPopup('error', 'Failed to load form data');
      // Set empty arrays to prevent undefined error
      setFormOptions({ locations: [], assets: [] });
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
    newItems[index] = { 
      ...newItems[index], 
      [field]: field === 'quantity' ? parseInt(value) || 0 : value 
    };
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
    if (!formData.transfer_date || !formData.location_from_id || !formData.location_to_id || 
        !formData.transferred_by) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    if (formData.location_from_id === formData.location_to_id) {
      showPopup('error', 'Source and destination locations cannot be the same');
      return;
    }

    // Validate items
    const validItems = formData.items.filter(item => item.asset_id && item.quantity > 0);
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
    } catch (error) {
      console.error('Error submitting form:', error);
      showPopup('error', 'Failed to update transfer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Modal title={`Edit Transfer - ${transfer?.transfer_id}`} size="xl" onClose={onCancel} className="cutlery-form-modal">
        <div className="loading" role="status" aria-live="polite">Loading form data...</div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Edit Transfer - ${transfer?.transfer_id}`}
      size="xl"
      onClose={submitting ? undefined : onCancel}
      className="cutlery-form-modal"
    >
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
                {formOptions.locations && formOptions.locations.map(location => (
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
                {formOptions.locations && formOptions.locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.location_name} ({location.location_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
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
                    required
                    disabled={submitting}
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
                    required
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
                >
                  Remove
                </button>
              )}
            </div>
          ))}
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
    </Modal>
  );
};

export default EditTransfer;