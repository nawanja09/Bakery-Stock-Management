import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Returns.css';
import api from '../../api';
import Select from 'react-select';

const AddReturn = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();

  const [formData, setFormData] = useState({
    return_date: new Date().toLocaleDateString('en-CA'),
    department_id: '',
    received_by: '',
    remarks: '',
    items: [{ item_id: '', quantity: 1, unit: '', reason: 'Excess' }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchBasics = async () => {
      try {
        const [deptRes, itemsRes] = await Promise.all([
          api.get('/departments'),
          api.get('/items')
        ]);
        setDepartments(deptRes.data || []);
        setItems(itemsRes.data || []);
      } catch (error) {
        console.error('Error fetching basics:', error);
        showPopup('error', 'Failed to load departments or items');
      }
    };

    fetchBasics();
  }, [showPopup]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    if (field === 'quantity') {
      value = value === '' || value === null ? '' : Number(value);
      if (isNaN(value)) value = 0;
    }

    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'item_id') {
      const selectedItem = items.find(it => String(it.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
    }

    setFormData(prev => ({ ...prev, items: newItems }));

    // Auto-add new row when editing last row
    const isLast = index === formData.items.length - 1;
    if (isLast && (field === 'item_id' || field === 'quantity') && value) {
      const hasValue = newItems[index].item_id || (Number(newItems[index].quantity) > 0);
      if (hasValue) addItemRow();
    }
  };

  const addItemRow = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { item_id: '', quantity: 1, unit: '', reason: 'Excess' }]
    }));
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information is missing. Please login again.');
      navigate('/login');
      return;
    }

    // Filter out empty rows
    const validItems = formData.items.filter(item => 
      item.item_id && Number(item.quantity) > 0
    );

    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one item with quantity');
      return;
    }

    const payload = {
      ...formData,
      items: validItems
    };

    try {
      const response = await api.post('/returns', payload);
      showPopup('success', `Return recorded successfully! Reference: ${response.data.return_number}`);
      navigate('/returns/history');
    } catch (error) {
      console.error('Error creating return:', error);
      showPopup('error', 'Failed to record return');
    }
  };

  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''}) - ${itm.unit}`,
    unit: itm.unit
  }));

  const selectStyles = {
    menuPortal: base => ({ ...base, zIndex: 9999 })
  };

  return (
    <div className="returns-container">
      <div className="header-with-actions">
        <h2>Add New Return</h2>
        <button onClick={() => navigate('/returns/history')} className="btn-secondary">
          ← Back to History
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Return Date</label>
            <input
              type="date"
              value={formData.return_date}
              onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Department from</label>
            <select
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              required
            >
              <option value="">Select Department</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Received By</label>
            <input
              type="text"
              value={formData.received_by}
              onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
              placeholder="Name of person receiving the return"
              required
            />
          </div>
        </div>

        <div className="form-group full-width">
          <label>Remarks</label>
          <textarea
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            placeholder="Additional notes about the return..."
            rows="3"
          />
        </div>

        <h3>Returned Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Reason for Return</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td style={{ minWidth: 300 }}>
                  <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => String(opt.value) === String(item.item_id)) || null}
                    onChange={(selected) => handleItemChange(index, 'item_id', selected ? selected.value : '')}
                    isSearchable
                    placeholder="Search or select item..."
                    menuPortalTarget={document.body}
                    styles={selectStyles}
                  />
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
                  <select
                    value={item.reason}
                    onChange={(e) => handleItemChange(index, 'reason', e.target.value)}
                    required
                  >
                    <option value="Excess">Excess</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Wrong Issue">Wrong Issue</option>
                    <option value="Expired">Expired</option>
                    <option value="Other">Other</option>
                  </select>
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

        <button type="button" className="btn-add" onClick={addItemRow}>
          + Add Item
        </button>

        <div className="form-actions">
          <button type="submit" className="btn-submit">
            Save Return
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddReturn;