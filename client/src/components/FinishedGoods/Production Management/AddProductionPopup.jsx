//client/src/components/FinishedGoods/Production Management/AddProductionPopup.jsx

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './ProductionManagement.css';

const AddProductionPopup = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    production_date: new Date().toISOString().split('T')[0],
    prepared_by: '',
    remarks: ''
  });
  
  const [items, setItems] = useState([{ item_id: '', quantity: '' }]);
  const [finishedGoodsItems, setFinishedGoodsItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchFinishedGoodsItems();
  }, []);

  const fetchFinishedGoodsItems = async () => {
    try {
      const itemsResponse = await api.get('/finished-goods-items');
      setFinishedGoodsItems(itemsResponse.data);
    } catch (err) {
      showPopup('error', 'Failed to load finished goods items');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { item_id: '', quantity: '' }]);
  };

  const removeItem = (index) => {
    if (items.length > 1) {
      const newItems = [...items];
      newItems.splice(index, 1);
      setItems(newItems);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form
      if (!formData.prepared_by.trim()) {
        showPopup('error', 'Please enter who prepared the production');
        return;
      }

      const validItems = items.filter(item => item.item_id && item.quantity > 0);
      if (validItems.length === 0) {
        showPopup('error', 'Please add at least one production item');
        return;
      }

      const payload = {
        ...formData,
        items: validItems.map(item => ({
          item_id: item.item_id,
          quantity: parseInt(item.quantity)
        }))
      };

      await api.post('/productions', payload);
      onSave();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to save production');
    } finally {
      setLoading(false);
    }
  };

  const itemOptions = finishedGoodsItems.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - ${item.category}`
  }));

  return (
    <div className="popup-overlay">
      <div className="production-popup">
        <div className="popup-header">
          <h3>Add New Production</h3>
          <button className="close-btn" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="production-form">
          <div className="form-row">
            <div className="form-group">
              <label>Production Date</label>
              <input
                type="date"
                name="production_date"
                value={formData.production_date}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Production has Prepared By</label>
              <input
                type="text"
                name="prepared_by"
                value={formData.prepared_by}
                onChange={handleInputChange}
                placeholder="Enter prepared by name"
                required
              />
            </div>
            
            {/*
            <div className="form-group">
              <label>Production Item Count</label>
              <input
                type="number"
                name="item_count"
                value={formData.item_count}
                onChange={handleInputChange}
                placeholder="Enter item count"
                required
              />
            </div>
            */}
          </div>

          <div className="form-group">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleInputChange}
              rows="3"
              placeholder="Add any remarks about this production..."
            />
          </div>

          <div className="production-items-section">
            <h4>Production Items</h4>
            
            {items.map((item, index) => (
              <div key={index} className="production-item-row">
                <div className="item-select">
                  <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => opt.value === item.item_id) || null}
                    onChange={(selected) => 
                      handleItemChange(index, 'item_id', selected.value)
                    }
                    isSearchable
                    placeholder="Select finished goods item..."
                    required
                  />
                </div>
                
                <div className="quantity-input">
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={item.quantity}
                    onChange={(e) => 
                      handleItemChange(index, 'quantity', e.target.value)
                    }
                    min="1"
                    required
                  />
                </div>
                
                <button
                  type="button"
                  className="remove-item-btn"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
            
            <button type="button" className="add-item-btn" onClick={addItem}>
              <FontAwesomeIcon icon={faPlus} /> Add Item
            </button>
          </div>

          <div className="popup-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Saving...' : 'Save Production'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductionPopup;