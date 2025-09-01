import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './OpeningBalance.css';

const AddOpeningBalance = () => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item_id: '',
    quantity: 1,
    unit_cost: 0,
  });

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await api.get('/opening-balance/items/without-opening');
        if (response.data.length === 0) {
          showPopup('info', 'All items already have opening balances');
          navigate('/opening/history');
          return;
        }
        setItems(response.data);
      } catch (error) {
        console.error('Error fetching items:', error);
        showPopup('error', 'Failed to load items');
      }
    };

    fetchItems();
  }, [showPopup, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'unit_cost' ? parseFloat(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user) {
        showPopup('error', 'User not logged in');
        setIsLoading(false);
        return;
      }

      const payload = {
        ...formData,
        entered_by: user.id,
      };

      await api.post('/opening-balance', payload);
      showPopup('success', 'Opening balance added!');
      navigate('/opening/history');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Error adding opening balance');
    } finally {
      setIsLoading(false);
    }
  };

  const totalValue = (formData.quantity * formData.unit_cost).toFixed(2);

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
            min="0"
            step="0.001"
            value={formData.quantity}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Unit Cost (Rs.)</label>
          <input
            type="number"
            name="unit_cost"
            min="0.01"
            step="0.01"
            value={formData.unit_cost}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Total Value (Rs.)</label>
          <input
            type="text"
            value={totalValue}
            readOnly
          />
        </div>

        <div className="form-button-wrapper">
          <button type="submit" className="btn-save" disabled={isLoading}>
            <FontAwesomeIcon icon={faSave} />
            {isLoading ? 'Adding...' : 'Add Opening Balance'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddOpeningBalance;
