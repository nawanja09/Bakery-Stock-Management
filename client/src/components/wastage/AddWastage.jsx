import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Wastage.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const AddWastage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemPrices, setItemPrices] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(null);
  const { showPopup } = usePopup();
  const searchInputRefs = useRef({});

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    approved_by: '',
    reason: 'Expired',
    remarks: '',
    items: [{ item_id: '', quantity: 1, estimated_loss: 0, unit: '', unit_price: 0 }]
  });

  // Fetch items and their latest prices
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsRes, pricesRes] = await Promise.all([
          api.get('/items'),
          api.get('/purchases/items/latest-prices')
        ]);
        
        setItems(itemsRes.data);
        setFilteredItems(itemsRes.data);
        setItemPrices(pricesRes.data);
        
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // Filter items based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(items);
    } else {
      const filtered = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, items]);

  // Auto-calculate estimated loss whenever quantity or unit_price changes
  const calculateEstimatedLoss = (quantity, unitPrice) => {
    return Number((quantity || 0) * (unitPrice || 0));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    // Convert to number for numeric fields
    if (field === 'quantity' || field === 'estimated_loss' || field === 'unit_price') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // Auto-set unit and unit_price when item is selected
    if (field === 'item_id') {
      const selectedItem = items.find(item => String(item.id) === String(value));
      if (selectedItem) {
        newItems[index].unit = selectedItem.unit || '';
        // Get the latest purchase price from itemPrices
        const priceData = itemPrices[selectedItem.id];
        newItems[index].unit_price = priceData?.unit_price || 0;
      }
    }

    // Auto-calculate estimated loss when quantity or unit_price changes
    if (field === 'quantity' || field === 'unit_price' || field === 'item_id') {
      const quantity = Number(newItems[index].quantity) || 0;
      const unitPrice = Number(newItems[index].unit_price) || 0;
      newItems[index].estimated_loss = calculateEstimatedLoss(quantity, unitPrice);
    }

    setFormData({ ...formData, items: newItems });
  };

  // Handle item selection from search dropdown
  const handleItemSelect = (index, itemId) => {
    handleItemChange(index, 'item_id', itemId);
    // Clear search term and close dropdown
    setSearchTerm('');
    setActiveSearchIndex(null);
    // Focus back on search input
    if (searchInputRefs.current[index]) {
      searchInputRefs.current[index].focus();
    }
  };

  // Handle search input change
  const handleSearchChange = (index, value) => {
    // If there's a selected item and user types, clear the selection
    if (formData.items[index].item_id) {
      const newItems = [...formData.items];
      newItems[index].item_id = '';
      newItems[index].unit = '';
      newItems[index].unit_price = 0;
      newItems[index].estimated_loss = 0;
      setFormData({ ...formData, items: newItems });
    }
    setSearchTerm(value);
    setActiveSearchIndex(index);
  };

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      return total + (Number(item.estimated_loss) || 0);
    }, 0).toFixed(2);
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, estimated_loss: 0, unit: '', unit_price: 0 }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate that all items have an item_id
    const hasEmptyItem = formData.items.some(item => !item.item_id);
    if (hasEmptyItem) {
      showPopup('error', 'Please select an item for all rows');
      return;
    }

    // Prepare data for API - remove unit_price as it's not needed in the database
    const submitData = {
      ...formData,
      items: formData.items.map(({ unit_price, ...item }) => ({
        ...item,
        estimated_loss: Number(item.estimated_loss) || 0
      }))
    };

    try {
      const response = await api.post('/wastages', submitData);
      
      if (response.status === 201) {
        showPopup('success', `Wastage recorded successfully! Note #: ${response.data.wastage_note_number}`);
        navigate('/wastage/history');
      }
    } catch (error) {
      console.error('Error creating wastage:', error);
      
      if (error.response?.status === 401) {
        showPopup('error', 'Session expired. Please login again.');
        navigate('/login');
      } else {
        const errorMessage = error.response?.data?.error || 'Server error';
        showPopup('error', `Error: ${errorMessage}`);
      }
    }
  };

  // Get display name for selected item
  const getSelectedItemName = (itemId) => {
    if (!itemId) return '';
    const item = items.find(i => String(i.id) === String(itemId));
    return item ? `${item.name} (${item.item_code})` : '';
  };

  // Get unit price display
  const getUnitPriceDisplay = (itemId) => {
    if (!itemId) return '0.00';
    const priceData = itemPrices[itemId];
    return priceData ? priceData.unit_price.toFixed(2) : '0.00';
  };

  return (
    <div className="wastage-container">
      <button onClick={() => navigate('/wastage/history')} className="btn-secondary">
        ← Back to History
      </button>
      <h2>RM Wastage</h2>
      <form onSubmit={handleSubmit}>
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
            <label>Reason for Wastage</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              required
            >
              <option value="Expired">Expired</option>
              <option value="Damaged">Damaged</option>
              <option value="Overproduction">Overproduction</option>
              <option value="Poor Storage">Poor Storage</option>
              <option value="Forecasting errors">Forecasting errors</option>
              <option value="Human error">Human error</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows="1"
              className="remarks-textarea"
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        <h3>Wasted Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Item Name</th>
              <th style={{ width: '12%' }}>Quantity</th>
              <th style={{ width: '10%' }}>Unit</th>
              <th style={{ width: '15%' }}>Unit Price (Rs.)</th>
              <th style={{ width: '18%' }}>Estimated Loss (Rs.)</th>
              <th style={{ width: '10%' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <div className="item-search-container">
                    <input
                      ref={el => searchInputRefs.current[index] = el}
                      type="text"
                      placeholder="Search item by name or code..."
                      value={item.item_id ? getSelectedItemName(item.item_id) : searchTerm}
                      onChange={(e) => handleSearchChange(index, e.target.value)}
                      onFocus={() => {
                        if (item.item_id) {
                          setSearchTerm('');
                          const newItems = [...formData.items];
                          newItems[index].item_id = '';
                          newItems[index].unit = '';
                          newItems[index].unit_price = 0;
                          newItems[index].estimated_loss = 0;
                          setFormData({ ...formData, items: newItems });
                        }
                        setActiveSearchIndex(index);
                      }}
                      onBlur={() => {
                        // Delay closing dropdown to allow click on dropdown items
                        setTimeout(() => {
                          setActiveSearchIndex(null);
                        }, 200);
                      }}
                      className="item-search-input"
                    />
                    {activeSearchIndex === index && searchTerm && !item.item_id && (
                      <div className="search-dropdown">
                        {filteredItems.length === 0 ? (
                          <div className="search-no-results">No items found</div>
                        ) : (
                          filteredItems.map((itm) => {
                            const priceData = itemPrices[itm.id];
                            const price = priceData?.unit_price || 0;
                            return (
                              <div
                                key={itm.id}
                                className="search-item"
                                onClick={() => handleItemSelect(index, itm.id)}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                <span className="search-item-code">{itm.item_code}</span>
                                <span className="search-item-name">{itm.name}</span>
                                <span className="search-item-unit">({itm.unit})</span>
                                <span className="search-item-price">Rs. {price.toFixed(2)}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.unit}
                    readOnly
                    className="unit-display"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                    placeholder="0.00"
                  />
                  {item.item_id && (
                    <small className="price-hint">
                      Latest: Rs. {getUnitPriceDisplay(item.item_id)}
                    </small>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.estimated_loss}
                    readOnly
                    className="estimated-loss-display"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => removeItemRow(index)}
                    disabled={formData.items.length <= 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          className="btn-add"
          onClick={addItemRow}
        >
          + Add Item
        </button>

        <div className="summary">
          <div className="total-loss">
            <strong>Total Estimated Loss:</strong>
            <span>Rs. {calculateTotalLoss()}</span>
          </div>
        </div>

        <button type="submit" className="btn-submit">Save Wastage</button>
      </form>
    </div>
  );
};

export default AddWastage;