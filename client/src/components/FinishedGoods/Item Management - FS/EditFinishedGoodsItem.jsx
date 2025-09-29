import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const EditFinishedGoodsItem = () => {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    item_code: '',
    name: '',
    category: 'Cake',
    unit_price: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const response = await api.get(`/finished-goods-items/${id}`);
        const data = response.data;

        if (response.status === 200) {
          setFormData({
            item_code: data.item_code,
            name: data.name,
            category: data.category,
            unit_price: data.unit_price
          });
        } else {
          showPopup('error', data.error || 'Failed to fetch item');
        }
      } catch (error) {
        showPopup('error', 'Network error. Please try again.');
      } finally {
        setFetchLoading(false);
      }
    };

    fetchItem();
  }, [id, showPopup]);

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

      const response = await api.put(`/finished-goods-items/${id}`, payload);

      if (response.status === 200) {
        showPopup('success', 'Finished Goods Item updated successfully!');
        setTimeout(() => navigate('/finished-goods/items'), 1500);
      } else {
        showPopup('error', response.data.error || 'Failed to update item');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="finished-goods-management-container">
        <div className="loading-state">Loading item details...</div>
      </div>
    );
  }

  return (
    <div className="finished-goods-management-container">
      <button onClick={() => navigate(-1)} className="btn-back">
        <FontAwesomeIcon icon={faArrowLeft} /> Back to Items
      </button>

      <h1 className="page-title">Edit Item</h1>
      
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Item Code</label>
          <input 
            type="text" 
            name="item_code" 
            value={formData.item_code} 
            onChange={handleChange} 
            required 
            readOnly
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
            placeholder="Enter item name"
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
            placeholder="0.00"
          />
        </div>

        <div className="form-button-wrapper">
          <button type="submit" className="btn-save" disabled={isLoading}>
            <FontAwesomeIcon icon={faSave} /> 
            {isLoading ? 'Updating...' : 'Update Item'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditFinishedGoodsItem;