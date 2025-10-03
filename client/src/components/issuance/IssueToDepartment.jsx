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
    items: [{ item_id: '', quantity: 1, unit: '', current_stock: 0 }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchBasics = async () => {
      try {
        const [deptRes, itemsRes] = await Promise.all([
          api.get('/departments'),
          api.get('/issuances/items/with-stock')
        ]);
        setDepartments(deptRes.data || []);
        setItems(itemsRes.data || []);
      } catch (error) {
        console.error('Error fetching basics:', error);
      }
    };

    fetchBasics();
  }, []);

  useEffect(() => {
    // If editing existing issuance, fetch it and map items AFTER items list is available
    if (!id) return;

    const fetchIssuance = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/issuances/${id}`);
        const issuance = res.data;

        const mappedItems = (issuance.items || []).map(item => {
          const itemData = items.find(i => String(i.id) === String(item.item_id));
          return {
            item_id: item.item_id,
            quantity: item.quantity,
            unit: item.unit || (itemData ? itemData.unit : ''),
            current_stock: itemData ? itemData.current_stock : 0
          };
        });

        setFormData({
          issuance_date: issuance.issuance_date ? issuance.issuance_date.split('T')[0] : new Date().toISOString().split('T')[0],
          department_id: issuance.department_id || '',
          received_by: issuance.received_by || '',
          remarks: issuance.remarks || '',
          approved_by: issuance.approved_by || '',
          check_number: issuance.check_number || '',
          items: mappedItems.length > 0 ? mappedItems : [{ item_id: '', quantity: 1, unit: '', current_stock: 0 }]
        });
      } catch (err) {
        console.error(err);
        showPopup('error', 'Failed to fetch issuance for edit');
      } finally {
        setLoading(false);
      }
    };

    // only fetch once items are present (if items empty we still try because user might not have items)
    fetchIssuance();
  }, [id, items, showPopup]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    let parsedValue = value;

    if (field === 'quantity') {
      parsedValue = value === '' || value === null ? '' : Number(value);
      if (isNaN(parsedValue)) parsedValue = 0;
    }

    newItems[index] = { ...newItems[index], [field]: parsedValue };

    if (field === 'item_id') {
      const selectedItem = items.find(it => String(it.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
      newItems[index].current_stock = selectedItem ? selectedItem.current_stock : 0;
    }

    setFormData(prev => ({ ...prev, items: newItems }));

    const isLast = index === formData.items.length - 1;
    if (isLast && (field === 'item_id' || field === 'quantity')) {
      const hasValue = newItems[index].item_id || (Number(newItems[index].quantity) > 0);
      if (hasValue) addItemRow();
    }
  };

  const addItemRow = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { item_id: '', quantity: 1, unit: '', current_stock: 0 }]
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

    const payload = {
      ...formData,
      issued_by: currentUser.id,
      items: formData.items.filter(it => it.item_id || (Number(it.quantity) > 0))
    };

    try {
      let response;
      if (id) {
        response = await api.put(`/issuances/${id}`, payload);
        if (response.status === 200) showPopup('success', 'Issuance updated successfully!');
        else showPopup('error', `Error: ${response.data?.error || 'Unknown'}`);
      } else {
        response = await api.post('/issuances', payload);
        if (response.status === 201)
          showPopup('success', `Issuance created successfully! ID: ${response.data.issuance_id}`);
        else showPopup('error', `Error: ${response.data?.error || 'Unknown'}`);
      }
      navigate('/issuance/history');
    } catch (error) {
      console.error('Error creating/updating issuance:', error);
      showPopup('error', 'Server error');
    }
  };

  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`,
    unit: itm.unit,
    current_stock: itm.current_stock
  }));

  const selectStyles = {
    menuPortal: base => ({ ...base, zIndex: 9999 })
  };

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
              <th>Current Stock</th>
              <th>Quantity to Issue</th>
              <th>Unit of Measurement</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td style={{ minWidth: 240 }}>
                  <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => String(opt.value) === String(item.item_id)) || null}
                    onChange={(selected) => handleItemChange(index, 'item_id', selected ? selected.value : '')}
                    isSearchable
                    placeholder="Search or select item..."
                    menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                    styles={selectStyles}
                    closeMenuOnScroll={true}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.current_stock}
                    readOnly
                    className={`stock-display ${item.current_stock <= 0 ? 'stock-low' : ''}`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
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
