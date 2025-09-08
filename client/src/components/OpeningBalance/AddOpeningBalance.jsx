import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import Select from 'react-select'; // 🔎 import react-select
import './OpeningBalance.css';

const AddOpeningBalance = () => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item_id: '',
    quantity: 0,
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
        showPopup('error', 'Quantity must be a valid number');
        return;
      }

      await api.post('/opening-balance', formData);
      showPopup('success', 'Opening balance added!');
      navigate('/opening/history');
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Error adding opening balance');
    }
  };

  // 🔎 convert items to react-select format
  const itemOptions = items.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code})`
  }));

  return (
    <div className="ob-box-container">
      <h2 className="ob-heading">Add Opening Balance</h2>

      <form onSubmit={handleSubmit} className="ob-form-box">

        <div className="ob-form-group">
          <label htmlFor="date">Date</label>
          <input
            type="date"
            id="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
          />
        </div>

        {/* 🔎 Searchable Select */}
        <div className="ob-form-group">
          <label htmlFor="item_id">Item</label>
          <Select
            id="item_id"
            options={itemOptions}
            value={itemOptions.find(opt => opt.value === formData.item_id) || null}
            onChange={(selected) =>
              setFormData(prev => ({ ...prev, item_id: selected.value }))
            }
            isSearchable
            placeholder="Select or search item..."
          />
        </div>

        <div className="ob-form-group">
          <label htmlFor="quantity">Quantity</label>
          <input
            type="number"
            id="quantity"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            required
          />
          <small>You can enter negative, zero, or positive values.</small>
        </div>

        <div className="ob-button-wrapper">
          <button type="submit" className="ob-btn-submit">
            Add Balance
          </button>
        </div>

      </form>
    </div>
  );
};

export default AddOpeningBalance;
