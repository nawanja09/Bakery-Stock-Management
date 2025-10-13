import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faPlus, faTrash, faArrowLeft, faCalculator } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsSales.css';

const AddFinishedGoodsSale = () => {
  const [formData, setFormData] = useState({
    sale_date: new Date().toLocaleDateString('en-CA'),
    designation: '',
    cashier_name: '',
    remarks: ''
  });
  const [items, setItems] = useState([{ item_id: '', quantity: 1, unit_price: '', total_value: 0 }]);
  const [finishedGoodsItems, setFinishedGoodsItems] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchFinishedGoodsItems();
    fetchDesignations();
  }, []);

  const fetchFinishedGoodsItems = async () => {
    try {
      const response = await api.get('/finished-goods-items');
      setFinishedGoodsItems(response.data);
    } catch {
      showPopup('error', 'Failed to load finished goods items');
    }
  };

  const fetchDesignations = async () => {
    try {
      const response = await api.get('/finished-goods-transfers/destinations');
      setDesignations(response.data);
    } catch {
      showPopup('error', 'Failed to load designations');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    if (field === 'item_id') {
      const selected = finishedGoodsItems.find(i => i.id === parseInt(value));
      if (selected) {
        newItems[index].item_id = value;
        newItems[index].unit_price = selected.unit_price;
        newItems[index].total_value = (newItems[index].quantity * selected.unit_price).toFixed(2);
      }
    } else if (field === 'quantity' || field === 'unit_price') {
      newItems[index][field] = value;
      newItems[index].total_value = (newItems[index].quantity * newItems[index].unit_price).toFixed(2);
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { item_id: '', quantity: 1, unit_price: '', total_value: 0 }]);
  const removeItem = (i) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));

  const calculateTotalSales = () =>
    items.reduce((t, i) => t + (parseFloat(i.total_value) || 0), 0).toFixed(2);

  const validateForm = () => {
    if (!formData.sale_date) return showPopup('error', 'Sale date is required');
    if (!formData.designation) return showPopup('error', 'Designation is required');
    if (!formData.cashier_name.trim()) return showPopup('error', 'Cashier name is required');
    if (items.filter(i => i.item_id && i.quantity > 0).length === 0)
      return showPopup('error', 'Please add at least one sale item');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        ...formData,
        items: items.map(i => ({
          item_id: parseInt(i.item_id),
          quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price),
          total_value: parseFloat(i.total_value)
        }))
      };
      const res = await api.post('/finished-goods-sales', payload);
      if (res.status === 201) {
        showPopup('success', 'Sale recorded successfully!');
        setTimeout(() => navigate('/finished-goods/sales/history'), 1500);
      }
    } catch (err) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const itemOptions = finishedGoodsItems.map(i => ({
    value: i.id,
    label: `${i.name} (${i.item_code}) - Rs. ${i.unit_price}`
  }));

  const designationOptions = designations.map(d => ({
    value: d.id,
    label: d.name
  }));

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '2px 8px',
      minHeight: '42px',
      boxShadow: 'none',
      '&:hover': {
        borderColor: 'var(--primary)'
      }
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-md)'
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? 'var(--primary)' : state.isFocused ? 'var(--bg-hover)' : 'white',
      color: state.isSelected ? 'white' : 'var(--text-primary)',
      '&:active': {
        backgroundColor: 'var(--primary)'
      }
    })
  };

  return (
    <div className="sales-page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate('/finished-goods/sales/history')}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Sales
        </button>
        <h1 className="page-title">New Sale Record</h1>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
            Sale Information
          </h2>
          
          <div className="grid-3">
            <div className="form-group">
              <label>Sale Date *</label>
              <input 
                type="date" 
                name="sale_date" 
                value={formData.sale_date} 
                onChange={handleInputChange} 
              />
            </div>
            <div className="form-group">
              <label>Designation *</label>
              <Select
                styles={customSelectStyles}
                options={designationOptions}
                value={designationOptions.find(opt => opt.value === formData.designation) || null}
                onChange={s => setFormData({ ...formData, designation: s?.value || '' })}
                placeholder="Select designation..."
                isSearchable
              />
            </div>
            <div className="form-group">
              <label>Cashier Name *</label>
              <input
                type="text"
                name="cashier_name"
                placeholder="Enter cashier name"
                value={formData.cashier_name}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Remarks</label>
            <textarea 
              name="remarks" 
              value={formData.remarks} 
              onChange={handleInputChange} 
              placeholder="Additional notes (optional)"
              rows={3}
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Sale Items
            </h2>
            <button type="button" className="btn btn-secondary" onClick={addItem}>
              <FontAwesomeIcon icon={faPlus} />
              Add Item
            </button>
          </div>

          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Item</th>
                  <th style={{ width: '15%' }}>Quantity</th>
                  <th style={{ width: '20%' }}>Unit Price (Rs.)</th>
                  <th style={{ width: '20%' }}>Total (Rs.)</th>
                  <th style={{ width: '5%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => opt.value === parseInt(item.item_id)) || null}
                    onChange={s => handleItemChange(i, 'item_id', s?.value || '')}
                    placeholder="Select item..."
                    isSearchable
                    menuPortalTarget={document.body}  // <-- add this
                    styles={{
                        menuPortal: base => ({ ...base, zIndex: 9999 }) // <-- add this
                    }}
                    />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={e => handleItemChange(i, 'quantity', e.target.value)}
                        style={{ textAlign: 'center' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={e => handleItemChange(i, 'unit_price', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        readOnly 
                        value={item.total_value}
                        style={{ background: 'var(--bg-secondary)', fontWeight: '500' }}
                      />
                    </td>
                    <td>
                      <button 
                        type="button" 
                        className="btn-icon error" 
                        onClick={() => removeItem(i)}
                        disabled={items.length === 1}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="total-bar">
            <FontAwesomeIcon icon={faCalculator} />
            Total Sales Value:
            <strong style={{ color: 'var(--success)', fontSize: '1.125rem' }}>
              Rs. {calculateTotalSales()}
            </strong>
          </div>
        </div>

        <div className="actions" style={{ marginTop: '2rem' }}>
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={() => navigate('/finished-goods/sales/history')}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ minWidth: '120px' }}
          >
            <FontAwesomeIcon icon={faSave} />
            {loading ? 'Saving...' : 'Save Sale'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddFinishedGoodsSale;