import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api';
import Select from 'react-select';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsOpeningBalance.css';

const AddFinishedGoodsOpeningBalance = () => {
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
        const res = await api.get('/finished-goods-opening-balance/items/without-opening');
        setItems(res.data);
      } catch (err) {
        console.error(err);
        showPopup('error', 'Failed to load finished goods items');
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

      await api.post('/finished-goods-opening-balance', formData);
      showPopup('success', 'Finished Goods Opening Balance added!');
      navigate('/finished-goods/opening/history');
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Error adding opening balance');
    }
  };

  const itemOptions = items.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - ${item.category}`
  }));

  return (
    <div className="fg-ob-box-container">
      <h2 className="fg-ob-heading">Add Finished Goods Opening Balance</h2>

      <form onSubmit={handleSubmit} className="fg-ob-form-box">

        <div className="fg-ob-form-group">
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

        <div className="fg-ob-form-group">
          <label htmlFor="item_id">Finished Goods Item</label>
          <Select
            id="item_id"
            options={itemOptions}
            value={itemOptions.find(opt => opt.value === formData.item_id) || null}
            onChange={(selected) =>
              setFormData(prev => ({ ...prev, item_id: selected.value }))
            }
            isSearchable
            placeholder="Select or search finished goods item..."
            required
          />
        </div>

        <div className="fg-ob-form-group">
          <label htmlFor="quantity">Quantity</label>
          <input
            type="number"
            id="quantity"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            min="0"
            step="1"
            required
          />
          <small>Enter the quantity of finished goods in stock.</small>
        </div>

        <div className="fg-ob-button-wrapper">
          <button type="submit" className="fg-ob-btn-submit">
            Add Opening Balance
          </button>
        </div>

      </form>
    </div>
  );
};

export default AddFinishedGoodsOpeningBalance;