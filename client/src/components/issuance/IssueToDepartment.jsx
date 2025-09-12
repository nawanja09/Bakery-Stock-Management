// src/components/issuance/IssueToDepartment.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';
import Select from 'react-select';

const IssueToDepartment = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    issuance_date: new Date().toISOString().split('T')[0],
    department_id: '',
    received_by: '',
    remarks: '',
    approved_by: '',
    check_number: '',
    items: [{ item_id: '', quantity: 1, unit: '' }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchDepartments = async () => {
      try {
        const response = await api.get('/departments');
        setDepartments(response.data);
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };

    const fetchItems = async () => {
      try {
        const response = await api.get('/items');
        setItems(response.data);
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };

    fetchDepartments();
    fetchItems();
  }, []);

  useEffect(() => {
    if (id) {
      setLoading(true);
      api.get(`/issuances/${id}`)
        .then(res => {
          const issuance = res.data;
          setFormData({
            issuance_date: issuance.issuance_date.split('T')[0],
            department_id: issuance.department_id,
            received_by: issuance.received_by,
            remarks: issuance.remarks,
            approved_by: issuance.approved_by,
            check_number: issuance.check_number,
            items: issuance.items.map(item => ({
              item_id: item.item_id,
              quantity: item.quantity,
              unit: item.unit
            }))
          });
        })
        .catch(() => showPopup('error', 'Failed to fetch issuance for edit'))
        .finally(() => setLoading(false));
    }
  }, [id, showPopup]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // Auto-select unit when item is selected
    if (field === 'item_id') {
      const selectedItem = items.find(item => String(item.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
    }

    setFormData({ ...formData, items: newItems });

    // Automatically add a new row if editing quantity or selecting item in last row
    if ((field === 'quantity' || field === 'item_id') && index === formData.items.length - 1 && value) {
      addItemRow();
    }
  };

  const addItemRow = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { item_id: '', quantity: 1, unit: '' }]
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
      alert('User information is missing. Please login again.');
      navigate('/login');
      return;
    }

    const updatedFormData = {
      ...formData,
      issued_by: currentUser.id
    };

    try {
      let response;
      if (id) {
        response = await api.put(`/issuances/${id}`, updatedFormData);
        if (response.status === 200) showPopup('success', 'Issuance updated successfully!');
        else showPopup('error', `Error: ${response.data.error}`);
      } else {
        response = await api.post('/issuances', updatedFormData);
        if (response.status === 201)
          showPopup('success', `Issuance created successfully! ID: ${response.data.issuance_id}`);
        else showPopup('error', `Error: ${response.data.error}`);
      }
      navigate('/issuance/history');
    } catch (error) {
      console.error('Error creating/updating issuance:', error);
      showPopup('error', 'Server error');
    }
  };

  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code})`,
    unit: itm.unit
  }));

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="issuance-container">
      <h2>{id ? 'Edit Issuance' : 'Issue Items to Department'}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Issuance Date</label>
            <input
              type="date"
              value={formData.issuance_date}
              onChange={(e) => setFormData({ ...formData, issuance_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Department</label>
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
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Received By</label>
            <input
              type="text"
              value={formData.received_by}
              onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Check Number</label>
            <input
              type="text"
              value={formData.check_number}
              onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Time of Day</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            />
          </div>
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
                  <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => String(opt.value) === String(item.item_id)) || null}
                    onChange={(selected) => handleItemChange(index, 'item_id', selected.value)}
                    isSearchable
                    placeholder="Search or select item..."
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
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

        <button type="button" className="btn-add" onClick={addItemRow}>
          + Add Item
        </button>

        <button type="submit" className="btn-submit">
          {id ? 'Update Issuance' : 'Save Issuance'}
        </button>
      </form>
    </div>
  );
};

export default IssueToDepartment;
