import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import './OpeningBalance.css';

const AddOpeningBalance = () => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item_id: '',
    quantity: 0, // now allows positive, zero, negative
  });

  const [items, setItems] = useState([]);
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await api.get('/opening-balance/items/without-opening');
        setItems(res.data);
      } catch (err) {
        console.error(err);
        showPopup('error', 'Failed to load items');
      }
    };
    fetchItems();
  }, [showPopup]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseFloat(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isNaN(formData.quantity)) {
        showPopup('Quantity must be a valid number', 'error');
        return;
      }

      await api.post('/opening-balance', formData);
      showPopup('Opening balance added!', 'success');
      navigate('/opening/history');
    } catch (err) {
      console.error(err);
      showPopup(err.response?.data?.error || 'Error adding opening balance', 'error');
    }
  };

  return (
    <div className="opening-balance-container">
      <h2>Add Opening Balance</h2>
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Date</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Item</label>
          <select
            name="item_id"
            value={formData.item_id}
            onChange={handleChange}
            required
          >
            <option value="">Select Item</option>
            {items.map(item => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.item_code})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            required
          />
            <small style={{color: '#888'}}>You can enter negative, zero, or positive values.</small>
        </div>

        <div className="form-button-wrapper">
          <button type="submit" className="btn-save">Add Opening Balance</button>
        </div>
      </form>
    </div>
  );
};

export default AddOpeningBalance;
