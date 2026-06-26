import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faCalendarAlt, faUser, faBox, faFileAlt, faExclamationCircle, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';

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
  const [generalInfo, setGeneralInfo] = useState({
    date: new Date().toLocaleDateString().slice(0, 16), 
    user_name: '',
    reference_note: ''
  });

  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      // Auto-add only items are usually managed by the system dynamically
      const response = await api.get('/items?auto_add_only=true');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      showMessage('Error fetching items. Please try again.', 'error');
    }
  };

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

      // Variance = Actual - System (negative implies stock loss)
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
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!generalInfo.user_name) {
      showMessage('Please enter your name in the "Adjusted By" field.', 'error');
      return;
    }

    // Validate every row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.item_id || !row.actual_qty || !row.reason) {
        showMessage(`Please fill in all required fields for item row ${i + 1}.`, 'error');
        return;
      }
    }

    try {
      setLoading(true);

      // Submit each row as a separate adjustment (existing API contract)
      for (const row of rows) {
        await api.post('/adjustments', {
          ...generalInfo,
          ...row
        });
      }

      showMessage(
        rows.length === 1
          ? 'Stock balance adjustment saved successfully!'
          : `${rows.length} stock balance adjustments saved successfully!`,
        'success'
      );

      // Reset rows but keep general info for convenience
      setRows([{ ...EMPTY_ROW }]);
      setGeneralInfo((prev) => ({ ...prev, reference_note: '' }));
    } catch (error) {
      console.error('Error saving adjustment:', error);
      showMessage('Failed to save adjustment(s).', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adjustments-container">
      <div className="adjustments-header">
        <h1>Stores Balance Adjustment</h1>
        <p>Update physical stock counts and record variances</p>
      </div>

      {message.text && (
        <div className={`alert-message ${message.type}`}>
          <FontAwesomeIcon icon={message.type === 'error' ? faExclamationCircle : faSave} />
          {message.text}
        </div>
      )}

      <form className="adjustments-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h3><FontAwesomeIcon icon={faFileAlt} /> General Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label><FontAwesomeIcon icon={faCalendarAlt} /> Date & Time</label>
              <input
                type="datetime-local"
                name="date"
                value={generalInfo.date}
                onChange={handleGeneralChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label><FontAwesomeIcon icon={faUser} /> Adjusted By</label>
              <input
                type="text"
                name="user_name"
                value={generalInfo.user_name}
                onChange={handleGeneralChange}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="form-group full-width">
              <label><FontAwesomeIcon icon={faFileAlt} /> Reference Note</label>
              <input
                type="text"
                name="reference_note"
                value={generalInfo.reference_note}
                onChange={handleGeneralChange}
                placeholder="Optional remarks"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3><FontAwesomeIcon icon={faBox} /> Stock Count Details</h3>
          <div className="table-responsive">
            <table className="adjustments-table stock-count-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Select Item</th>
                  <th>System Quantity</th>
                  <th>Actual Physical Quantity</th>
                  <th>Variance</th>
                  <th>Unit Price</th>
                  <th>Total Amount</th>
                  <th>Reason for Adjustment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isStockLoss = parseFloat(row.variance) < 0;
                  const isStockGain = parseFloat(row.variance) > 0;

                  return (
                    <tr key={index}>
                      <td className="row-number">{index + 1}</td>
                      <td>
                        <select
                          value={row.item_id}
                          onChange={(e) => handleItemChange(index, e)}
                          required
                          className="table-input"
                        >
                          <option value="">-- Choose an Item --</option>
                          {items.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.item_code} - {item.name} ({item.unit})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.system_qty}
                          className="table-input readonly-input"
                          readOnly
                          placeholder="0.000"
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
                          disabled={!row.item_id || loading}
                          className="table-input"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.variance}
                          className={`table-input readonly-input ${isStockLoss ? 'text-danger fw-bold' : isStockGain ? 'text-success fw-bold' : ''}`}
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
                          className={`table-input readonly-input ${isStockLoss ? 'text-danger fw-bold bg-danger-light' : ''}`}
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
                        ></textarea>
                      </td>
                      <td>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-row"
                            onClick={() => removeRow(index)}
                            title="Remove this item"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="add-row-actions">
            <button type="button" className="btn-add-row" onClick={addRow}>
              <FontAwesomeIcon icon={faPlus} /> Add New Item
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Processing...' : <><FontAwesomeIcon icon={faSave} /> Save Adjustment</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StoresBalance;
