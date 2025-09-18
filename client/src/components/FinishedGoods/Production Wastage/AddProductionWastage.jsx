import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './ProductionWastage.css';

const AddProductionWastage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [productions, setProductions] = useState([]);
  const { showPopup } = usePopup();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    approved_by: '',
    reason: 'Human error',
    remarks: '',
    wastage_type: 'Production',
    production_id: '',
    items: [{ item_id: '', quantity: 1, estimated_loss: 0 }]
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsResponse, productionsResponse] = await Promise.all([
          api.get('/finished-goods-items'),
          api.get('/productions?status=Completed')
        ]);
        
        setItems(itemsResponse.data);
        setProductions(productionsResponse.data);
      } catch (error) {
        showPopup('error', 'Failed to fetch data');
      }
    };

    fetchData();
  }, [showPopup]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    if (field === 'quantity' || field === 'estimated_loss') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // Auto-calculate estimated loss when quantity changes
    if (field === 'quantity' || field === 'item_id') {
      const selectedItem = items.find(item => String(item.id) === String(newItems[index].item_id));
      if (selectedItem && field === 'quantity') {
        newItems[index].estimated_loss = (value * selectedItem.unit_price).toFixed(2);
      } else if (selectedItem && field === 'item_id') {
        newItems[index].estimated_loss = (newItems[index].quantity * selectedItem.unit_price).toFixed(2);
      }
    }

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, estimated_loss: 0 }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/finished-goods-wastages', formData);
      
      if (response.status === 201) {
        showPopup('success', `Production Wastage recorded successfully! Note #: ${response.data.wastage_number}`);
        navigate('/finished-goods/wastage/production');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Server error';
      showPopup('error', `Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const itemOptions = items.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - ${item.category} - LKR ${item.unit_price}`
  }));

  const productionOptions = productions.map(production => ({
    value: production.id,
    label: `${new Date(production.production_date).toLocaleDateString()} - ${production.prepared_by}`
  }));

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      return total + (Number(item.estimated_loss) || 0);
    }, 0).toFixed(2);
  };

  return (
    <div className="production-wastage-container">
      <div className="production-wastage-header">
        <button onClick={() => navigate('/finished-goods/wastage/production')} className="btn-back">
          ← Back to Production Wastage
        </button>
      </div>
      
      <h2 className="production-wastage-title">Add Production Wastage</h2>

      <form onSubmit={handleSubmit} className="production-wastage-form">
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Approved By</label>
            <input
              type="text"
              value={formData.approved_by}
              onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Production Batch</label>
            <Select
              options={productionOptions}
              value={productionOptions.find(opt => opt.value === formData.production_id) || null}
              onChange={(selected) => setFormData({ ...formData, production_id: selected.value })}
              isSearchable
              placeholder="Select production batch..."
              required
              menuPortalTarget={document.body}
              styles={{
                menuPortal: base => ({ ...base, zIndex: 9999 }),
                control: (provided) => ({
                  ...provided,
                  minHeight: '38px',
                }),
              }}
              menuShouldBlockScroll={true}
              classNamePrefix="select"
            />
          </div>

          <div className="form-group">
            <label>Reason for Wastage</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              required
            >
              <option value="Human error">Human error</option>
              <option value="Equipment failure">Equipment failure</option>
              <option value="Recipe error">Recipe error</option>
              <option value="Quality rejection">Quality rejection</option>
              <option value="Overproduction">Overproduction</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Remarks</label>
          <textarea
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            rows="3"
            placeholder="Add any remarks about this production wastage..."
          />
        </div>

        <h3>Wasted Production Items</h3>
        
        <div className="wastage-items-table">
          <div className="table-header">
            <span>Item</span>
            <span>Quantity</span>
            <span>Estimated Loss (LKR)</span>
            <span>Action</span>
          </div>
          
          {formData.items.map((item, index) => (
            <div key={index} className="table-row">
              <div className="item-select">
                <Select
                  options={itemOptions}
                  value={itemOptions.find(opt => opt.value === item.item_id) || null}
                  onChange={(selected) => handleItemChange(index, 'item_id', selected.value)}
                  isSearchable
                  placeholder="Select finished goods item..."
                  required
                  menuPortalTarget={document.body}
                  styles={{
                    menuPortal: base => ({ ...base, zIndex: 9999 }),
                    control: (provided) => ({
                      ...provided,
                      minHeight: '38px',
                    }),
                  }}
                  menuShouldBlockScroll={true}
                  classNamePrefix="select"
                />
              </div>
              
              <div className="quantity-input">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  required
                />
              </div>
              
              <div className="loss-input">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.estimated_loss}
                  onChange={(e) => handleItemChange(index, 'estimated_loss', e.target.value)}
                  required
                />
              </div>
              
              <button
                type="button"
                className="btn-remove"
                onClick={() => removeItemRow(index)}
                disabled={formData.items.length === 1}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn-add-item" onClick={addItemRow}>
          <FontAwesomeIcon icon={faPlus} /> Add Item
        </button>

        <div className="total-loss-section">
          <strong>Total Estimated Loss:</strong>
          <span>LKR {calculateTotalLoss()}</span>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={loading}>
            <FontAwesomeIcon icon={faSave} /> 
            {loading ? 'Saving...' : 'Save Production Wastage'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProductionWastage;