import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';
import Select from 'react-select';

const EditIssuance = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);

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

    const fetchIssuanceData = async () => {
      try {
        // Fetch issuance details
        const issuanceResponse = await api.get(`/issuances/${id}`);
        const issuanceData = issuanceResponse.data;
        
        // Fetch dropdown data
        const [departmentsRes, itemsRes] = await Promise.all([
          api.get('/departments'),
          api.get('/items')
        ]);

        setDepartments(departmentsRes.data);
        setItems(itemsRes.data);

        // Set form data
        setFormData({
          issuance_date: issuanceData.issuance_date.split('T')[0],
          department_id: issuanceData.department_id,
          received_by: issuanceData.received_by,
          remarks: issuanceData.remarks || '',
          approved_by: issuanceData.approved_by || '',
          items: issuanceData.items.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit: item.unit
          }))
        });

        setLoading(false);
      } catch (error) {
        console.error('Error fetching issuance data:', error);
        showPopup('error', 'Failed to load issuance data');
        navigate('/issuance/history');
      }
    };

    fetchIssuanceData();
  }, [id, showPopup, navigate]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // AUTO-SELECT UNIT WHEN ITEM IS SELECTED
    if (field === 'item_id') {
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
      await api.put(`/issuances/${id}`, updatedFormData);
      showPopup('success', 'Issuance updated successfully!');
      navigate('/issuance/history');
    } catch (error) {
      console.error('Error updating issuance:', error);
      showPopup('error', 'Server error');
    }
  };

  // Map items to react-select format
  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code})`,
    unit: itm.unit
  }));

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="issuance-container">
      <div className="header-with-actions">
        <h2>Edit Issuance to Department</h2>
        <button onClick={() => navigate('/issuance/history')} className="btn-secondary">
          ← Back to History
        </button>
      </div>
      
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
              onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Approved By</label>
            <input
              type="text"
              value={formData.approved_by}
              onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Remarks</label>
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
                    onChange={(selected) => {
                      handleItemChange(index, 'item_id', selected.value);
                    }}
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

        <button
          type="button"
          className="btn-add"
          onClick={addItemRow}
        >
          + Add Item
        </button>

        <button type="submit" className="btn-submit">Update Issuance</button>
      </form>
    </div>
  );
};

export default EditIssuance;