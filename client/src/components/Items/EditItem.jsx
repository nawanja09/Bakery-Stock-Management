import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { ITEM_TYPE_OPTIONS, DEFAULT_ITEM_TYPE } from './itemTypeOptions';

const EditItem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    unit: 'kg',
    item_type: DEFAULT_ITEM_TYPE,
    vat_applicable: false,
    auto_add_to_stock: true,
    reorder_level: '',
    status: true // Add status field
  });

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/items/${id}`);
      const item = response.data;
      
      setFormData({
        item_code: item.item_code || '',
        item_name: item.name || '',
        unit: item.unit || 'kg',
        item_type: item.item_type || DEFAULT_ITEM_TYPE,
        vat_applicable: item.vat_applicable || false,
        auto_add_to_stock: item.auto_add_to_stock !== undefined ? item.auto_add_to_stock : true,
        reorder_level: item.reorder_level || '',
        status: item.status !== undefined ? item.status === 1 : true // Convert 1/0 to boolean
      });
    } catch (error) {
      console.error('Error fetching item:', error);
      showPopup('error', 'Failed to load item details');
      navigate('/items');
    } finally {
      setLoading(false);
    }
  };

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
    
    if (!formData.reorder_level || parseFloat(formData.reorder_level) < 0) {
      showPopup('error', 'Valid reorder level is required');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const payload = {
        item_code: formData.item_code,
        name: formData.item_name,
        unit: formData.unit,
        item_type: formData.item_type || DEFAULT_ITEM_TYPE,
        vat_applicable: formData.vat_applicable,
        auto_add_to_stock: formData.auto_add_to_stock,
        reorder_level: formData.reorder_level,
        status: formData.status ? 1 : 0 // Convert boolean to 1/0
      };

      const response = await api.put(`/items/${id}`, payload);

      if (response.status === 200) {
        showPopup('success', 'Item updated successfully!');
        setTimeout(() => navigate('/items'), 1500);
      }
    } catch (error) {
      console.error('Error updating item:', error);
      
      if (error.response?.status === 400) {
        showPopup('error', error.response.data.error || 'Invalid data');
      } else if (error.response?.status === 404) {
        showPopup('error', 'Item not found');
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="minimal-container">
        <div className="minimal-card loading-card">
          <div className="minimal-spinner"></div>
          <p className="loading-text">Loading item details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="minimal-container">
      <div className="minimal-card">
        <div className="minimal-header">
          <button 
            onClick={() => navigate('/items')} 
            className="minimal-icon-button back-button"
            aria-label="Go back"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h2 className="minimal-title">Edit Item</h2>
          <div className="header-spacer"></div>
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
                placeholder="Enter unique item code"
              />
              <span className="minimal-helper-text">Unique identifier for the item</span>
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
                placeholder="Enter minimum stock level"
              />
              <span className="minimal-helper-text">Alert when stock falls below this level</span>
            </div>

            {/* Status Field */}
            <div className="minimal-form-group">
              <label className="minimal-label">Status <span className="required-star">*</span></label>
              <select
                name="status"
                value={formData.status ? 'active' : 'inactive'}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value === 'active' }))}
                required
                className="minimal-select"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <span className="minimal-helper-text">Active items are available for use in transactions</span>
            </div>
          </div>

          {/* Two-column toggle section */}
          <div className="toggle-row">
            {/* VAT Applicable Toggle */}
            <div className="toggle-column">
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
                If enabled, VAT will be calculated for this item in purchases
              </span>
            </div>

            {/* Auto-Add to Stock Toggle */}
            <div className="toggle-column">
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
                  ? "Item will be automatically added to stock" 
                  : "Item will NOT be automatically added to stock"}
              </span>
            </div>
          </div>

          <div className="minimal-info-box">
            <h4 className="info-box-title">Item Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Item ID:</span>
                <span className="info-value">{id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">VAT Status:</span>
                <span className={`info-value ${formData.vat_applicable ? 'vat-active' : 'vat-inactive'}`}>
                  {formData.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Auto-Add to Stock:</span>
                <span className={`info-value ${formData.auto_add_to_stock ? 'vat-active' : 'vat-inactive'}`}>
                  {formData.auto_add_to_stock ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Status:</span>
                <span className={`info-value ${formData.status ? 'vat-active' : 'vat-inactive'}`}>
                  {formData.status ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          <div className="minimal-form-actions">
            <button 
              type="button" 
              onClick={() => navigate('/items')} 
              className="minimal-button minimal-button-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="minimal-button minimal-button-primary" 
              disabled={isSubmitting}
            >
              <FontAwesomeIcon icon={faSave} className="button-icon" />
              {isSubmitting ? 'Updating...' : 'Update Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditItem;