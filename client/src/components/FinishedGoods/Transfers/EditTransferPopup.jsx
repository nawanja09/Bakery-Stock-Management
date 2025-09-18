// src/components/FinishedGoods/Transfers/EditTransferPopup.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './Transfers.css';

const EditTransferPopup = ({ transfer, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    transfer_date: transfer.transfer_date.split('T')[0],
    transferred_by: transfer.transferred_by,
    destination_id: transfer.destination_id,
    remarks: transfer.remarks || ''
  });

  const [items, setItems] = useState([]);
  const [finishedGoodsItems, setFinishedGoodsItems] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(false);
  const { showPopup } = usePopup();

  // ✅ UseCallback to avoid recreation on every render
  const fetchData = useCallback(async () => {
    try {
      const [itemsResponse, destinationsResponse] = await Promise.all([
        api.get('/finished-goods-items'),
        api.get('/finished-goods-transfers/destinations')
      ]);

      setFinishedGoodsItems(itemsResponse.data);
      setDestinations(destinationsResponse.data);
    } catch (err) {
      showPopup('error', 'Failed to load data');
    }
  }, [showPopup]);

  // ✅ useEffect with correct dependencies
  useEffect(() => {
    fetchData();

    // Initialize items from the transfer data
    if (transfer.items) {
      setItems(
        transfer.items.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity.toString()
        }))
      );
    }
  }, [transfer, fetchData]);

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
      if (!formData.transferred_by.trim()) {
        showPopup('error', 'Please enter who is transferring');
        setLoading(false);
        return;
      }

      if (!formData.destination_id) {
        showPopup('error', 'Please select a destination');
        setLoading(false);
        return;
      }

      const validItems = items.filter(item => item.item_id && item.quantity > 0);
      if (validItems.length === 0) {
        showPopup('error', 'Please add at least one transfer item');
        setLoading(false);
        return;
      }

      const payload = {
        ...formData,
        items: validItems.map(item => ({
          item_id: item.item_id,
          quantity: parseInt(item.quantity)
        }))
      };

      await api.put(`/finished-goods-transfers/${transfer.id}`, payload);
      onSave();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update transfer');
    } finally {
      setLoading(false);
    }
  };

  const itemOptions = finishedGoodsItems.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - ${item.category}`
  }));

  const destinationOptions = destinations.map(dest => ({
    value: dest.id,
    label: dest.name
  }));

  return (
    <div className="popup-overlay">
      <div className="transfer-popup">
        <div className="popup-header">
          <h3>Edit Transfer - {transfer.transfer_number}</h3>
          <button className="close-btn" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="transfer-form">
          <div className="form-row">
            <div className="form-group">
              <label>Transfer Date</label>
              <input
                type="date"
                name="transfer_date"
                value={formData.transfer_date}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Transferred By</label>
              <input
                type="text"
                name="transferred_by"
                value={formData.transferred_by}
                onChange={handleInputChange}
                placeholder="Enter name of person transferring"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Transfer To</label>
            <Select
              options={destinationOptions}
              value={destinationOptions.find(opt => opt.value === formData.destination_id) || null}
              onChange={(selected) =>
                setFormData(prev => ({ ...prev, destination_id: selected.value }))
              }
              isSearchable
              placeholder="Select destination..."
              required
            />
          </div>

          <div className="form-group">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleInputChange}
              rows="3"
              placeholder="Add any remarks about this transfer..."
            />
          </div>

          <div className="transfer-items-section">
            <h4>Transfer Items</h4>

            {items.map((item, index) => (
              <div key={index} className="transfer-item-row">
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
              <FontAwesomeIcon icon={faPlus} /> Add New Item
            </button>
          </div>

          <div className="popup-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Updating...' : 'Update Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTransferPopup;
