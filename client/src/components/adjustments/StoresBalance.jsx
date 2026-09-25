import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, faCalendarAlt, faUser, faBox, faFileAlt, 
  faExclamationCircle, faPlus, faTrash, faTimes,
  faCheckCircle, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import api from '../../api';
import './Adjustments.css';
import CategoryAdjustmentPanel from './CategoryAdjustmentPanel';

// Internal category values match rm_adjustment_records.category / the
// existing backend routes exactly (see CategoryAdjustmentPanel). The label
// is what the user sees - "Petty Cash Adjustment" and "Expense Adjustment"
// are the two new categories; their underlying value stays the historical
// 'Petty Cash Voucher' / 'Expense Bill' so no data model change is needed.
const ADJUSTMENT_CATEGORIES = [
  { value: 'Department', label: 'Department' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'Issuance', label: 'Issuance' },
  { value: 'Wastage', label: 'Wastage' },
  { value: 'Purchasing Payment', label: 'Purchasing Payment' },
  { value: 'Petty Cash Voucher', label: 'Petty Cash Adjustment' },
  { value: 'Expense Bill', label: 'Expense Adjustment' },
];

// Reusable Modal Component
const Modal = ({ isOpen, onClose, title, message, type = 'info', onConfirm, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
  if (!isOpen) return null;

  const typeIcons = {
    danger: faExclamationCircle,
    success: faCheckCircle,
    warning: faExclamationCircle,
    info: faInfoCircle
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-icon ${type}`}>
          <FontAwesomeIcon icon={typeIcons[type] || faInfoCircle} />
        </div>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          {onConfirm && (
            <button className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
              {confirmText}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

const EMPTY_ROW = {
  item_id: '',
  system_qty: '',
  actual_qty: '',
  variance: '',
  unit_price: '',
  amount: '',
  reason: ''
};

const StoresBalance = () => {
  const navigate = useNavigate();

  // "Select Category of Adjustments" - defaults to Department, which is the
  // existing Stock Count Details workflow below (unchanged behavior).
  const [adjustmentCategory, setAdjustmentCategory] = useState('Department');

  const [generalInfo, setGeneralInfo] = useState({
    date: new Date().toISOString().slice(0, 16),
    user_name: '',
    reference_note: ''
  });

  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [modalConfig, setModalConfig] = useState({ isOpen: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setItemsLoading(true);
      const response = await api.get('/items?auto_add_only=true');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      showMessage('Error fetching items. Please try again.', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `${item.item_code} - ${item.name} (${item.unit})`,
    itemName: String(item.name || '')
  }));

  const filterItemOption = (candidate, inputValue) =>
    candidate.data.itemName.toLowerCase().includes(inputValue.trim().toLowerCase());

  const updateRow = (index, updates) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  };

  const handleItemChange = async (index, e) => {
    const itemId = e.target.value;
    updateRow(index, {
      item_id: itemId,
      system_qty: '',
      unit_price: '',
      actual_qty: '',
      variance: '',
      amount: ''
    });

    if (!itemId) return;

    try {
      setLoading(true);
      const response = await api.get(`/adjustments/system-stock/${itemId}`);
      const { system_qty, unit_price } = response.data;
      updateRow(index, { system_qty, unit_price });
    } catch (error) {
      console.error('Error fetching system stock:', error);
      showMessage('Error fetching system stock for selected item.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleActualQtyChange = (index, e) => {
    const actualQty = e.target.value;

    if (actualQty === '' || isNaN(actualQty)) {
      updateRow(index, { actual_qty: actualQty, variance: '', amount: '' });
      return;
    }

    setRows((prev) => {
      const row = prev[index];
      const systemQty = parseFloat(row.system_qty || 0);
      const parsedActualQty = parseFloat(actualQty);
      const unitPrice = parseFloat(row.unit_price || 0);

      const variance = (parsedActualQty - systemQty).toFixed(3);
      const amount = (variance * unitPrice).toFixed(2);

      return prev.map((r, i) =>
        i === index ? { ...r, actual_qty: actualQty, variance, amount } : r
      );
    });
  };

  const handleRowReasonChange = (index, e) => {
    updateRow(index, { reason: e.target.value });
  };

  const handleGeneralChange = (e) => {
    const { name, value } = e.target;
    setGeneralInfo((prev) => ({ ...prev, [name]: value }));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  };

  const removeRow = (index) => {
    if (rows.length === 1) {
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Cannot Remove Last Row',
        message: 'You must have at least one item row. To clear the form, use the "Clear All" option instead.'
      });
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllRows = () => {
    if (rows.length === 1) {
      setRows([{ ...EMPTY_ROW }]);
    } else {
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Clear All Rows?',
        message: 'This will remove all item rows. Do you want to continue?',
        onConfirm: () => {
          setRows([{ ...EMPTY_ROW }]);
          setModalConfig({ isOpen: false });
        }
      });
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const validateForm = () => {
    if (!generalInfo.user_name.trim()) {
      showMessage('Please enter your name in the "Adjusted By" field.', 'error');
      return false;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.item_id) {
        showMessage(`Please select an item for row ${i + 1}.`, 'error');
        return false;
      }
      if (!row.actual_qty || row.actual_qty === '') {
        showMessage(`Please enter the actual quantity for row ${i + 1}.`, 'error');
        return false;
      }
      if (!row.reason || !row.reason.trim()) {
        showMessage(`Please provide a reason for adjustment in row ${i + 1}.`, 'error');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Show confirmation for multiple rows
    if (rows.length > 1) {
      setModalConfig({
        isOpen: true,
        type: 'info',
        title: 'Confirm Multiple Adjustments',
        message: `You are about to create ${rows.length} adjustment entries. Do you want to continue?`,
        confirmText: 'Yes, Save All',
        onConfirm: () => {
          setModalConfig({ isOpen: false });
          performSubmit();
        }
      });
      return;
    }

    performSubmit();
  };

  const performSubmit = async () => {
    try {
      setIsSubmitting(true);
      setLoading(true);

      for (const [index, row] of rows.entries()) {
        const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${index}-${Math.random()}`;
        await api.post('/adjustments', {
          ...generalInfo,
          ...row,
          request_id: requestId
        });
      }

      showMessage(
        rows.length === 1
          ? 'Stock balance adjustment saved successfully!'
          : `${rows.length} stock balance adjustments saved successfully!`,
        'success'
      );

      setRows([{ ...EMPTY_ROW }]);
      setGeneralInfo((prev) => ({ ...prev, reference_note: '' }));
      
      // Reset form scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (error) {
      console.error('Error saving adjustment:', error);
      showMessage('Failed to save adjustment(s). Please check your connection and try again.', 'error');
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}> Adjustment</h2>
        </div>
        {adjustmentCategory === 'Department' && (
          <div>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={clearAllRows}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faTimes} style={{ marginRight: '8px' }} /> Clear All
            </button>
          </div>
        )}
      </header>

      {/* Select Category of Adjustments - controls which edit interface loads below,
          without leaving the Adjustments page or creating separate routes. */}
      <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        <div className="form-group" style={{ maxWidth: '360px', margin: 0 }}>
          <label>
            <FontAwesomeIcon icon={faFileAlt} style={{ marginRight: '8px' }} /> Select Category of Adjustments
          </label>
          <select
            value={adjustmentCategory}
            onChange={(e) => setAdjustmentCategory(e.target.value)}
            className="form-select"
          >
            {ADJUSTMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <span className="help-text" style={{ display: 'block', marginTop: 'var(--spacing-xs)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {adjustmentCategory === 'Department'
              ? 'Stock count adjustment using General Information + Stock Count Details below.'
              : `Select an existing ${(ADJUSTMENT_CATEGORIES.find((c) => c.value === adjustmentCategory)?.label || adjustmentCategory).toLowerCase()} record to view and modify.`}
          </span>
        </div>
      </div>

      {message.text && (
        <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: message.type === 'error' ? '#f8d7da' : '#d4edda', color: message.type === 'error' ? '#721c24' : '#155724' }}>
          <FontAwesomeIcon icon={message.type === 'error' ? faExclamationCircle : faCheckCircle} style={{ marginRight: '8px' }} />
          {message.text}
        </div>
      )}

      {adjustmentCategory !== 'Department' && (
        <CategoryAdjustmentPanel category={adjustmentCategory} />
      )}

      {adjustmentCategory === 'Department' && (
      <form className="adjustments-form" onSubmit={handleSubmit}>
        {/* General Information Section */}
        <div className="form-section">
          <h3 className="form-section-title">
            <FontAwesomeIcon icon={faFileAlt} /> General Information
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} /> Date & Time
                <span className="required">*</span>
              </label>
              <input
                type="datetime-local"
                name="date"
                value={generalInfo.date}
                onChange={handleGeneralChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUser} /> Adjusted By
                <span className="required">*</span>
              </label>
              <input
                type="text"
                name="user_name"
                value={generalInfo.user_name}
                onChange={handleGeneralChange}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group full-width">
              <label>
                <FontAwesomeIcon icon={faFileAlt} /> Reference Note
              </label>
              <input
                type="text"
                name="reference_note"
                value={generalInfo.reference_note}
                onChange={handleGeneralChange}
                placeholder="Optional reference or notes (e.g., inventory count #123)"
              />
              <span className="help-text">Optional field for tracking purposes</span>
            </div>
          </div>
        </div>

        {/* Stock Count Details Section */}
        <div className="form-section">
          <h3 className="form-section-title">
            <FontAwesomeIcon icon={faBox} /> Stock Count Details
          </h3>
          
          <div className="table-responsive">
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ minWidth: '200px' }}>Select Item Name<span className="required">*</span></th>
                  <th style={{ minWidth: '120px' }}>System Qty</th>
                  <th style={{ minWidth: '150px' }}>Actual Qty <span className="required">*</span></th>
                  <th style={{ minWidth: '120px' }}>Variance</th>
                  <th style={{ minWidth: '110px' }}>Unit Price</th>
                  <th style={{ minWidth: '130px' }}>Total Amount</th>
                  <th style={{ minWidth: '200px' }}>Reason <span className="required">*</span></th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isStockLoss = parseFloat(row.variance) < 0;
                  const isStockGain = parseFloat(row.variance) > 0;
                  const isDisabled = !row.item_id || loading;

                  return (
                    <tr key={index}>
                      <td className="row-number">{index + 1}</td>
                      <td>
                        <Select
                          className="stock-item-select"
                          classNamePrefix="stock-item-select"
                          options={itemOptions}
                          value={itemOptions.find((option) => String(option.value) === String(row.item_id)) || null}
                          onChange={(option) => handleItemChange(index, { target: { value: option?.value || '' } })}
                          filterOption={filterItemOption}
                          isSearchable
                          isClearable
                          isLoading={itemsLoading}
                          isDisabled={loading}
                          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 })
                          }}
                          placeholder="Search raw material name..."
                          noOptionsMessage={() => 'No matching raw materials'}
                          required
                        >
                        </Select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.system_qty}
                          className="table-input readonly-input"
                          readOnly
                          placeholder="0.000"
                          step="0.001"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.001"
                          value={row.actual_qty}
                          onChange={(e) => handleActualQtyChange(index, e)}
                          placeholder="Enter counted qty"
                          required
                          disabled={isDisabled}
                          className="table-input"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.variance}
                          className={`table-input readonly-input ${
                            isStockLoss ? 'text-danger fw-bold' : 
                            isStockGain ? 'text-success fw-bold' : ''
                          }`}
                          readOnly
                          placeholder="0.000"
                        />
                        <small className="help-text">Actual − System</small>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.unit_price}
                          className="table-input readonly-input"
                          readOnly
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.amount}
                          className={`table-input readonly-input ${
                            isStockLoss ? 'text-danger fw-bold bg-danger-light' : ''
                          }`}
                          readOnly
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        <textarea
                          value={row.reason}
                          onChange={(e) => handleRowReasonChange(index, e)}
                          rows="2"
                          placeholder="e.g., damaged during transit"
                          required
                          className="table-input"
                          disabled={isDisabled}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-remove-row"
                          onClick={() => removeRow(index)}
                          title="Remove this item"
                          disabled={loading}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Add Row Actions - Left Aligned */}
          <div className="add-row-actions">
            <button type="button" className="btn-add-row" onClick={addRow} disabled={loading}>
              <FontAwesomeIcon icon={faPlus} /> Add New Item
            </button>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => navigate('/adjustments/stores-adjustments')}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-success" 
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <>Saving...</>
            ) : (
              <><FontAwesomeIcon icon={faSave} /> Save Adjustment</>
            )}
          </button>
        </div>
      </form>
      )}

      {/* Modal */}
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      />
    </div>
  );
};

export default StoresBalance;
