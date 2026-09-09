import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faTimes, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { ITEM_TYPE_OPTIONS, DEFAULT_ITEM_TYPE } from './itemTypeOptions';

const AddItem = () => {
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    unit: 'kg',
    item_type: DEFAULT_ITEM_TYPE,
    vat_applicable: false,
    auto_add_to_stock: true,
    reorder_level: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.item_code.trim()) {
      showPopup('error', 'Item code is required');
      return;
    }
    if (!formData.item_name.trim()) {
      showPopup('error', 'Item name is required');
      return;
    }
    if (!formData.unit) {
      showPopup('error', 'Unit of measurement is required');
      return;
    }
    if (formData.reorder_level === '' || Number(formData.reorder_level) < 0) {
      showPopup('error', 'Valid reorder level is required');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        item_code: formData.item_code,
        name: formData.item_name,
        unit: formData.unit,
        item_type: formData.item_type || DEFAULT_ITEM_TYPE,
        vat_applicable: formData.vat_applicable,
        auto_add_to_stock: formData.auto_add_to_stock,
        reorder_level: formData.reorder_level
      };

      const response = await api.post('/items', payload);
      const data = response.data;

      if (response.status === 201) {
        showPopup('success', `Item added successfully! ID: ${data.id}`);
        navigate('/items');
        setFormData({
          item_code: '',
          item_name: '',
          unit: 'kg',
          item_type: DEFAULT_ITEM_TYPE,
          vat_applicable: false,
          auto_add_to_stock: true,
          reorder_level: ''
        });
      } else {
        showPopup('error', data.error || 'Failed to add item');
      }
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.error;
      if (status === 400 && message) {
        showPopup('error', message);
      } else {
        showPopup('error', 'Unable to add item. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container item-management-page">
      <div className="card item-management-card">
        <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <h2 style={{ margin: 0 }}>Add New Item</h2>
          <button
            onClick={() => navigate('/items')}
            className="btn btn-secondary btn-sm"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="minimal-form-group">
              <label className="minimal-label">Item Code <span className="required-star">*</span></label>
              <input
                type="text"
                name="item_code"
                value={formData.item_code}
                onChange={handleChange}
                required
                className="minimal-input"
                placeholder="e.g., ITM001"
              />
            </div>

            <div className="minimal-form-group">
              <label className="minimal-label">Item Name <span className="required-star">*</span></label>
              <input
                type="text"
                name="item_name"
                value={formData.item_name}
                onChange={handleChange}
                required
                className="minimal-input"
                placeholder="Enter item name"
              />
            </div>

            <div className="minimal-form-group">
              <label className="minimal-label">Unit of Measurement <span className="required-star">*</span></label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                required
                className="minimal-select"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
                <option value="L">Liters (L)</option>
                <option value="ml">Milliliters (ml)</option>
                <option value="quantity">Quantity (pcs)</option>
              </select>
            </div>

            <div className="minimal-form-group">
              <label className="minimal-label">Item Type</label>
              <select
                name="item_type"
                value={formData.item_type}
                onChange={handleChange}
                className="minimal-select"
              >
                {ITEM_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="minimal-form-group">
              <label className="minimal-label">Reorder Level <span className="required-star">*</span></label>
              <input
                type="number"
                name="reorder_level"
                value={formData.reorder_level}
                onChange={handleChange}
                min="0"
                step="0.001"
                required
                className="minimal-input"
                placeholder="0"
              />
            </div>
          </div>

          {/* VAT Applicable Toggle */}
          <div className="minimal-toggle-group">
            <label className="minimal-toggle-label">
              <span>VAT Applicable</span>
              <div className="minimal-toggle-switch vat-toggle">
                <input
                  type="checkbox"
                  name="vat_applicable"
                  checked={formData.vat_applicable}
                  onChange={handleChange}
                />
              </div>
            </label>
            <span className="minimal-helper-text">
              Enable if item is subject to VAT
            </span>
          </div>

          {/* Auto-Add to Stock Toggle */}
          <div className="minimal-toggle-group">
            <label className="minimal-toggle-label">
              <span>Auto-Add to Stock</span>
              <div className="minimal-toggle-switch stock-toggle">
                <input
                  type="checkbox"
                  name="auto_add_to_stock"
                  checked={formData.auto_add_to_stock}
                  onChange={handleChange}
                />
              </div>
            </label>
            <span className="minimal-helper-text">
              {formData.auto_add_to_stock
                ? "✅ Item will be automatically added to stock when purchased. Opening balance will be created automatically."
                : "⚠️ Item will NOT be automatically added to stock. You must manually add opening balance."}
            </span>
          </div>

          {/* Info Message */}
          {formData.auto_add_to_stock && (
            <div className="info-message info-success">
              <FontAwesomeIcon icon={faInfoCircle} />
              <span>
                <strong>Auto-Add Enabled:</strong> This item will be tracked automatically.
                Opening balance (0) will be created, and purchases will update stock.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: 'var(--spacing-lg)' }}>
            <button
              type="button"
              onClick={() => navigate('/items')}
              className="btn btn-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              <FontAwesomeIcon icon={faSave} className="button-icon" />
              {isLoading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItem;
