import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';

const IssueToDepartment = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [formData, setFormData] = useState({
    issuance_date: new Date().toISOString().split('T')[0],
    department_id: '',
    received_by: '',
    remarks: '',
    approved_by: '',
    items: [{ item_id: '', quantity: 1, unit: '' }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchDepartments = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/departments');
        const data = await response.json();
        setDepartments(data);
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };

    const fetchItems = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/items');
        const data = await response.json();
        setItems(data);
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };

    fetchDepartments();
    fetchItems();
  }, []);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    if (field === 'quantity' || field === 'unit_price') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // AUTO-SELECT UNIT WHEN ITEM IS SELECTED
    if (field === 'item_id') {
      // item.id may be number, value from select is string
      const selectedItem = items.find(item => String(item.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
    }

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, unit: '' }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentUser || !currentUser.id) {
      alert('User information is missing. Please login again.');
      navigate('/login');
      return;
    }
    
    const updatedFormData = {
      ...formData,
      issued_by: currentUser.id
    };

    try {
      const response = await fetch('http://localhost:5000/api/issuances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFormData)
      });

      if (response.ok) {
        const result = await response.json();
        showPopup('success', `Issuance created successfully! ID: ${result.issuance_id}`);
        navigate('/issuance/history');
      } else {
        const errorData = await response.json();
        showPopup('error', `Error: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error creating issuance:', error);
      showPopup('error', 'Server error');
    }
  };

  return (
    <div className="issuance-container">
      <h2>Issue Items to Department</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Issuance Date</label>
            <input 
              type="date" 
              value={formData.issuance_date}
              onChange={(e) => setFormData({...formData, issuance_date: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Department</label>
            <select
              value={formData.department_id}
              onChange={(e) => setFormData({...formData, department_id: e.target.value})}
              required
            >
              <option value="">Select Department</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Received By</label>
            <input 
              type="text"
              value={formData.received_by}
              onChange={(e) => setFormData({...formData, received_by: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Approved By</label>
            <input 
              type="text"
              value={formData.approved_by}
              onChange={(e) => setFormData({...formData, approved_by: e.target.value})}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Remarks</label>
          <textarea 
            value={formData.remarks}
            onChange={(e) => setFormData({...formData, remarks: e.target.value})}
          />
        </div>

        <h3>Issued Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit of Measurement</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={item.item_id}
                    onChange={(e) => handleItemChange(index, 'item_id', e.target.value)}
                    required
                  >
                    <option value="">Select Item</option>
                    {items.map((itm) => (
                      <option key={itm.id} value={itm.id}>
                        {itm.name} ({itm.item_code})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                    required
                  />
                </td>
                <td>
                  {/* Auto-selected unit display */}
                  <input
                    type="text"
                    value={item.unit}
                    readOnly
                    className="unit-display"
                  />
                </td>
                <td>
                  <button 
                    type="button" 
                    className="btn-remove"
                    onClick={() => removeItemRow(index)}
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
        
        <button type="submit" className="btn-submit">Save Issuance</button>
      </form>
    </div>
  );
};

export default IssueToDepartment;