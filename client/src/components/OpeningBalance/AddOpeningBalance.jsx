import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import './OpeningBalance.css';

const AddOpeningBalance = () => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item_id: '',
    quantity: 1,
    unit_cost: 0
  });
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/items');
        const data = await response.json();
        setItems(data);
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };

    fetchItems();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: name === 'quantity' || name === 'unit_cost' ? parseFloat(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Get the current user from localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.id) {
      setMessage('User not authenticated');
      setIsLoading(false);
      return;
    }

    const payload = {
      ...formData,
      entered_by: user.id
    };

    try {
      const response = await fetch('http://localhost:5000/api/opening-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (response.ok) {
        showPopup('success', 'Opening balance added successfully!');
        setTimeout(() => navigate('/opening/history'), 1500);
      } else {
        showPopup('error', data.error || 'Failed to add opening balance');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total value
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
            min="1"
            step="1"
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

      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default AddOpeningBalance;