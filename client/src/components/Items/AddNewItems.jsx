import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faTimes, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const AddItem = () => {
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    unit: 'kg',
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
    setIsLoading(true);
    
    try {
      const payload = {
        item_code: formData.item_code,
        name: formData.item_name,
        unit: formData.unit,
        vat_applicable: formData.vat_applicable,
        auto_add_to_stock: formData.auto_add_to_stock,
        reorder_level: formData.reorder_level
      };

      const response = await api.post('/items', payload);
      const data = response.data;

      if (response.status === 201) {
        showPopup('success', `Item added successfully! ID: ${data.id}`);
        setTimeout(() => navigate('/items'), 1500);
        setFormData({
          item_code: '',
          item_name: '',
          unit: 'kg',
          vat_applicable: false,
          auto_add_to_stock: true,
          reorder_level: ''
        });
      } else {
        showPopup('error', data.error || 'Failed to add item');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="minimal-container">
      <div className="minimal-card">
        <div className="minimal-header">
          <h2 className="minimal-title">Add New Item</h2>
          <button 
            onClick={() => navigate('/items')} 
            className="minimal-icon-button"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="minimal-form">
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
                <div className="toggle-animate">
                  <span className="toggle-off">OFF</span>
                  <span className="toggle-on">ON</span>
                </div>
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
                <div className="toggle-animate">
                  <span className="toggle-off">OFF</span>
                  <span className="toggle-on">ON</span>
                </div>
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

          <div className="minimal-form-actions">
            <button 
              type="button" 
              onClick={() => navigate('/items')} 
              className="minimal-button minimal-button-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="minimal-button minimal-button-primary" 
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