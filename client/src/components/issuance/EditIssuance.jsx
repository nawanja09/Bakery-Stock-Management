// src/components/issuance/EditIssuance.jsx
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
    issuance_date: new Date().toLocaleDateString('en-CA'),
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

    const fetchAll = async () => {
      try {
        setLoading(true);

        // fetch items first (so we can map stock)
        const itemsResponse = await api.get('/issuances/items/with-stock');
        setItems(itemsResponse.data || []);

        // fetch departments
        const departmentsRes = await api.get('/departments');
        setDepartments(departmentsRes.data || []);

        // then fetch issuance
        const issuanceResponse = await api.get(`/issuances/${id}`);
        const issuanceData = issuanceResponse.data;

        // normalize date to YYYY-MM-DD for input[type=date]
        const issuanceDate = issuanceData.issuance_date
          ? new Date(issuanceData.issuance_date).toLocaleDateString('en-CA')
          : new Date().toLocaleDateString('en-CA');

        const itemsWithStock = (issuanceData.items || []).map(item => {
          const itemData = (itemsResponse.data || []).find(i => String(i.id) === String(item.item_id));
          return {
            item_id: item.item_id,
            quantity: item.quantity,
            unit: item.unit || (itemData ? itemData.unit : ''),
            current_stock: itemData ? itemData.current_stock : 0
          };
        });

        // ensure at least one empty row if none
        if (itemsWithStock.length === 0) {
          itemsWithStock.push({ item_id: '', quantity: 1, unit: '', current_stock: 0 });
        }

        setFormData({
          issuance_date: issuanceDate,
          department_id: issuanceData.department_id || '',
          received_by: issuanceData.received_by || '',
          remarks: issuanceData.remarks || '',
          approved_by: issuanceData.approved_by || '',
          check_number: issuanceData.check_number || '',
          items: itemsWithStock
        });

      } catch (error) {
        console.error('Error fetching issuance data:', error);
        showPopup('error', 'Failed to load issuance data');
        navigate('/issuance/history');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAll();
    else {
      // no id? just fetch departments & items
      const fetchBasics = async () => {
        try {
          setLoading(true);
          const [itemsResponse, departmentsRes] = await Promise.all([
            api.get('/issuances/items/with-stock'),
            api.get('/departments')
          ]);
          setItems(itemsResponse.data || []);
          setDepartments(departmentsRes.data || []);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchBasics();
    }
  }, [id, showPopup, navigate]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    let parsedValue = value;

    if (field === 'quantity') {
      // allow decimals; ensure numeric fallback
      parsedValue = value === '' || value === null ? '' : Number(value);
      if (isNaN(parsedValue)) parsedValue = 0;
    }

    newItems[index] = { ...newItems[index], [field]: parsedValue };

    if (field === 'item_id') {
      // if value may be object or primitive, we expect id primitive
      const selectedItem = items.find(it => String(it.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
      newItems[index].current_stock = selectedItem ? selectedItem.current_stock : 0;
    }

    setFormData(prev => ({ ...prev, items: newItems }));

    // auto add row if editing last row and user entered something meaningful
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
      // optional: filter out completely empty rows
      items: formData.items.filter(it => it.item_id || (Number(it.quantity) > 0))
    };

    try {
      await api.put(`/issuances/${id}`, payload);
      showPopup('success', 'Issuance updated successfully!');
      navigate('/issuance/history');
    } catch (error) {
      console.error('Error updating issuance:', error);
      showPopup('error', 'Server error');
    }
  };

  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`,
    unit: itm.unit,
    current_stock: itm.current_stock
  }));

  // react-select styles to ensure portal z-index
  const selectStyles = {
    menuPortal: base => ({ ...base, zIndex: 9999 })
  };

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
              <th>Quantity</th>
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
                    onChange={(selected) => {
                      // selected may be null if cleared
                      handleItemChange(index, 'item_id', selected ? selected.value : '');
                    }}
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
                  <input type="text" value={item.unit} readOnly className="unit-display" />
                </td>
                <td>
                  <button type="button" className="btn-remove" onClick={() => removeItemRow(index)}>
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

        <button type="submit" className="btn-submit">Update Issuance</button>
      </form>
    </div>
  );
};

export default EditIssuance;
