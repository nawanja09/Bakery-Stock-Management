// client/src/components/Items/AddNewItems.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';

const AddItem = () => {
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    unit: 'kg', 
    reorder_level: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Format data for backend
      const payload = {
        item_code: formData.item_code,
        name: formData.item_name,
        unit: formData.unit,
        reorder_level: formData.reorder_level
      };

      const response = await fetch('http://localhost:5000/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (response.ok) {
        showPopup('success', `Item added successfully! ID: ${data.id}`);
        setTimeout(() => navigate('/items'), 1500);
        setFormData({
          item_code: '',
          item_name: '',
          unit: 'kg',
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
    <div className="item-management-container">
      <h2>Add New Item</h2>
      
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Item Code</label>
          <input 
            type="text" 
            name="item_code" 
            value={formData.item_code} 
            onChange={handleChange} 
            required 
            pattern="I\d{3}"
            title="Item code must be in format IXXX"
          />
          <small>Format: IXXX (e.g. I001)</small>
        </div>        
        <div className="form-group">
          <label>Item Name</label>
          <input
            type="text"
            name="item_name"
            value={formData.item_name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Unit of Measurement</label>
          <select
            name="unit"
            value={formData.unit}
            onChange={handleChange}
            required
          >
            <option value="kg">Kilograms (kg)</option>
            <option value="g">Grams (g)</option>
            <option value="L">Liters (L)</option>
            <option value="ml">Milliliters (ml)</option>
            <option value="quantity">Quantity</option>
          </select>
        </div>

        <div className="form-group">
          <label>Reorder Level</label>
          <input
            type="number"
            name="reorder_level"
            value={formData.reorder_level}
            onChange={handleChange}
            min="0"
            required
          />
        </div>

        <div className="form-button-wrapper">
            <button type="submit" className="btn-save" disabled={isLoading}>
                <FontAwesomeIcon icon={faSave} /> 
                {isLoading ? 'Adding...' : 'Add Item'}
            </button>
        </div>
      </form>

    </div>
  );
};

export default AddItem;