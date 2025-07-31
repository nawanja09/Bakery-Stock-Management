// client/src/components/Items/EditItem.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave } from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';

const EditItem = () => {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    unit: 'kg',
    reorder_level: ''
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/items/${id}`);
        const data = await response.json();
        
        if (response.ok) {
          setFormData({
            item_code: data.item_code,
            item_name: data.name,
            unit: data.unit,
            reorder_level: data.reorder_level
          });
        } else {
          setMessage(data.error || 'Failed to fetch item');
        }
      } catch (error) {
        setMessage('Network error. Please try again.');
      }
    };

    fetchItem();
  }, [id]);

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
        name: formData.item_name,
        unit: formData.unit,
        reorder_level: formData.reorder_level
      };

      const response = await fetch(`http://localhost:5000/api/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage('Item updated successfully!');
        setTimeout(() => navigate('/items'), 1500); 
      } else {
        setMessage(data.error || 'Failed to update item');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="item-management-container">
      <button onClick={() => navigate(-1)} className="btn-back">
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <h2>Edit Item</h2>
      
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Item Code</label>
          <input 
            type="text" 
            name="item_code" 
            value={formData.item_code} 
            onChange={handleChange} 
            required 
            pattern="[I]\\d{3}"
            title="Item code must be in format IXXX"
            readOnly // Typically item code shouldn't be changed
          />
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
                {isLoading ? 'Updating...' : 'Update Item'}
            </button>
        </div>
      </form>

      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default EditItem;