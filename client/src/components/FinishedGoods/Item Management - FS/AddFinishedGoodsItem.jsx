import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsManagement.css';

const AddFinishedGoodsItem = () => {
  const [formData, setFormData] = useState({
    item_code: '',
    name: '',
    category: 'Cake',
    unit_price: ''
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
      const payload = {
        item_code: formData.item_code,
        name: formData.name,
        category: formData.category,
        unit_price: parseFloat(formData.unit_price)
      };

      const response = await api.post('/finished-goods-items', payload);

      if (response.status === 201) {
        showPopup('success', 'Finished Goods Item added successfully!');
        setTimeout(() => navigate('/finished-goods/items'), 1500);
        setFormData({
          item_code: '',
          name: '',
          category: 'Cake',
          unit_price: ''
        });
      } else {
        showPopup('error', response.data.error || 'Failed to add item');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="finished-goods-management-container">
      <h2>Add New Finished Goods Item</h2>
      
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Item Code</label>
          <input
            type="text"
            name="item_code"
            value={formData.item_code}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Item Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Category</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
          >
            <option value="Cake">Cake</option>
            <option value="Bakery">Bakery</option>
            <option value="Pastry">Pastry</option>
            <option value="Chinese">Chinese</option>
            <option value="Savory">Savory</option>
            <option value="Beverage">Beverage</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label>Unit Price (LKR)</label>
          <input
            type="number"
            name="unit_price"
            value={formData.unit_price}
            onChange={handleChange}
            min="0"
            step="0.01"
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

export default AddFinishedGoodsItem;