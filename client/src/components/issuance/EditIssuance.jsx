// src/components/issuance/EditIssuance.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';
import Select from 'react-select';
import { formatNumber } from '../../utils/formatters';
import { FaTrashAlt } from "react-icons/fa";

// props.embeddedId / props.onSaved / props.onCancel are optional.
// When absent (standalone route usage via /issuance/edit/:id), behavior is unchanged:
// id comes from the URL and Cancel/Save navigate to /issuance/history as before.
const EditIssuance = ({ embeddedId, onSaved, onCancel, isRmAdjustment = false } = {}) => {
  const params = useParams();
  const id = embeddedId || params.id;
  const navigate = useNavigate();
  const goBack = () => (onCancel ? onCancel() : navigate('/issuance/history'));
  const goAfterSave = () => (onSaved ? onSaved() : navigate('/issuance/history'));
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const [formData, setFormData] = useState({
    issuance_date: new Date().toLocaleDateString('en-CA'),
    issuance_time: new Date().toTimeString().slice(0, 5),
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

        const itemsResponse = await api.get('/issuances/items/with-stock');
        setItems(itemsResponse.data || []);

        const departmentsRes = await api.get('/departments');
        setDepartments(departmentsRes.data || []);

        const issuanceResponse = await api.get(`/issuances/${id}`);
        const issuanceData = issuanceResponse.data;

        const itemsWithStock = (issuanceData.items || []).map(item => {
          const itemData = (itemsResponse.data || []).find(i => String(i.id) === String(item.item_id));
          return {
            item_id: item.item_id,
            quantity: item.quantity,
            unit: item.unit || (itemData ? itemData.unit : ''),
            current_stock: itemData ? itemData.current_stock : 0
          };
        });

        if (itemsWithStock.length === 0) {
          itemsWithStock.push({ item_id: '', quantity: 1, unit: '', current_stock: 0 });
        }

        setFormData({
          issuance_date: issuanceData.issuance_date_only || new Date().toLocaleDateString('en-CA'),
          issuance_time: issuanceData.issuance_time || new Date().toTimeString().slice(0, 5),
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
        goBack();
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAll();
    else {
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

    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;

    if (timeSinceLastSubmit < 2000) {
      showPopup('warning', 'Duplicate submission detected! Please wait a moment.');
      return;
    }

    if (isSubmitting) {
      showPopup('warning', 'Submission already in progress...');
      return;
    }

    setIsSubmitting(true);
    setLastSubmitTime(now);

    if (!currentUser || !currentUser.id) {
      alert('User information is missing. Please login again.');
      navigate('/login');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      issuance_date: formData.issuance_date,
      issuance_time: formData.issuance_time,
      // Issued By stays the user who made the note - the server keeps it.
      department_id: formData.department_id,
      received_by: formData.received_by,
      remarks: formData.remarks,
      approved_by: formData.approved_by,
      check_number: formData.check_number,
      items: formData.items.filter(it => it.item_id || (Number(it.quantity) > 0))
    };

    try {
      await api.put(`/issuances/${id}`, payload, {
        headers: isRmAdjustment ? { 'X-RM-Adjustment': 'true' } : undefined
      });
      showPopup('success', 'Issuance updated successfully!');
      goAfterSave();
    } catch (error) {
      console.error('Error updating issuance:', error);
      showPopup('error', 'Server error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemOptions = items.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`,
    unit: itm.unit,
    current_stock: itm.current_stock
  }));

  const selectStyles = {
    menuPortal: base => ({ ...base, zIndex: 'var(--z-popover)' }),
    control: (base) => ({
      ...base,
      minHeight: 40,
      borderColor: '#e2e6ee',
      borderRadius: 8,
      boxShadow: 'none',
      '&:hover': { borderColor: '#b8bdd0' }
    }),
    option: (base, state) => ({
      ...base,
      padding: '10px 14px',
      fontSize: 14,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      backgroundColor: state.isSelected ? '#6c5ce7' : state.isFocused ? '#f0f2fe' : 'transparent',
      color: state.isSelected ? '#ffffff' : '#1a1a2e',
      cursor: 'pointer'
    }),
    singleValue: (base) => ({
      ...base,
      fontSize: 14,
      fontWeight: 500,
      color: '#1a1a2e',
      overflow: 'visible',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      maxWidth: '100%'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#a0a0b8',
      fontSize: 14
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      border: '1px solid #e2e6ee',
      overflow: 'hidden'
    }),
    menuList: (base) => ({
      ...base,
      padding: '4px 0',
      maxHeight: 280
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '2px 8px',
      overflow: 'visible'
    })
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="issuance-container">
      <div className="header-with-actions">
        <h2>Edit RM Issue</h2>
        {!embeddedId && (
          <button type="button" onClick={goBack} className="btn btn-secondary">
            ← Back to History
          </button>
        )}
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
            <label>Issuance Time</label>
            <input
              type="time"
              value={formData.issuance_time}
              onChange={(e) => setFormData({ ...formData, issuance_time: e.target.value })}
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
            <input
              type="text"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="Time of Day"
            />
          </div>
        </div>

        <div className="section-title">
          Issued Items
        </div>

        <div className="table-responsive">
          <table className="item-table">
            <thead>
              <tr>
                <th className="col-item-name">Item Name</th>
                <th className="col-stock">Current Stock</th>
                <th className="col-quantity">Quantity to Issue</th>
                <th className="col-unit">Unit</th>
                <th className="col-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => (
                <tr key={index}>
                  <td className="col-item-name">
                    <div className="item-select-container">
                      <Select
                        options={itemOptions}
                        value={itemOptions.find(opt => String(opt.value) === String(item.item_id)) || null}
                        onChange={(selected) => {
                          handleItemChange(index, 'item_id', selected ? selected.value : '');
                        }}
                        isSearchable
                        placeholder="Search or select item..."
                        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                        styles={selectStyles}
                        closeMenuOnScroll={true}
                        classNamePrefix="select"
                      />
                    </div>
                  </td>
                  <td className="col-stock">
                    <input
                      type="text"
                      value={formatNumber(item.current_stock, 3, 3)}
                      readOnly
                      className={`stock-display ${item.current_stock <= 0 ? 'stock-low' : ''}`}
                    />
                  </td>
                  <td className="col-quantity">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      required
                      className="quantity-input"
                    />
                  </td>
                  <td className="col-unit">
                    <input
                      type="text"
                      value={item.unit}
                      readOnly
                      className="unit-display"
                    />
                  </td>
                  <td className="col-action">
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeItemRow(index)}
                      disabled={formData.items.length <= 1}
                    >
                        <FaTrashAlt />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Updating...' : 'Update Issuance'}
        </button>
      </form>
    </div>
  );
};

export default EditIssuance;
