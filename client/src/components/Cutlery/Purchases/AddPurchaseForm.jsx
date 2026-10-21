import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './AddPurchaseForm.css';
import { Modal } from '../../common/ui';

const AddPurchaseForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    invoice_number: '',
    payment_method: 'CASH',
    payment_status: 'PENDING',
    notes: '',
    items: [{ asset_id: '', quantity: 1, unit_price: 0 }]
  });

  const [formOptions, setFormOptions] = useState({ suppliers: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showPopup } = usePopup();

  const fetchFormData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-purchases/form-data');
      setFormOptions(response.data);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => { fetchFormData(); }, [fetchFormData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      const quantity = field === 'quantity' ? parseFloat(value) : newItems[index].quantity;
      const unitPrice = field === 'unit_price' ? parseFloat(value) : newItems[index].unit_price;
      newItems[index].total_price = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { asset_id: '', quantity: 1, unit_price: 0 }] }));
  
  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
    } else showPopup('error', 'At least one item is required');
  };

  const calculateTotal = () => formData.items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.purchase_date || !formData.supplier_id || !formData.invoice_number) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    const validItems = formData.items.filter(i => i.asset_id && i.quantity > 0 && i.unit_price >= 0);
    if (validItems.length === 0 || calculateTotal() <= 0) {
      showPopup('error', 'Please add at least one valid item with positive total');
      return;
    }

    const submitData = {
      ...formData,
      items: validItems.map(i => ({
        asset_id: i.asset_id,
        quantity: parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price)
      }))
    };

    setSubmitting(true);
    try { 
      await onSubmit(submitData); 
    } catch { 
      showPopup('error', 'Failed to submit form'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(amount);

  if (loading) return (
    <Modal title="Add New Purchase" size="xl" onClose={onCancel} className="cutlery-form-modal">
        <div className="loading" role="status" aria-live="polite">Loading form data...</div>
      </Modal>
  );

  return (
    <Modal
      title="Add New Purchase"
      size="xl"
      onClose={submitting ? undefined : onCancel}
      className="cutlery-form-modal"
    >
      <form onSubmit={handleSubmit} className="add-purchase-form">
        {/* Purchase Info */}
        <div className="form-section">
          <h4>Purchase Information</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Purchase Date *</label>
              <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} required disabled={submitting} />
            </div>
            <div className="form-group">
              <label>Invoice Number *</label>
              <input type="text" name="invoice_number" value={formData.invoice_number} onChange={handleChange} required disabled={submitting} />
            </div>
            <div className="form-group">
              <label>Supplier *</label>
              <select name="supplier_id" value={formData.supplier_id} onChange={handleChange} required disabled={submitting}>
                <option value="">Select Supplier</option>
                {formOptions.suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select name="payment_method" value={formData.payment_method} onChange={handleChange} disabled={submitting}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
            <div className="form-group">
              <label>Payment Status</label>
              <select name="payment_status" value={formData.payment_status} onChange={handleChange} disabled={submitting}>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partial</option>
              </select>
            </div>
          </div>
        </div>

        {/* Items Section */}
        <div className="form-section">
          <h4>Purchase Items</h4>
          <div className="items-header">
            <div className="items-header-left">
              <span>Items</span>
              <span className="items-count">({formData.items.length})</span>
            </div>
            <button type="button" className="btn-add-item" onClick={addItem} disabled={submitting}>
              + Add Item
            </button>
          </div>
          
          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Asset</th>
                  <th style={{ width: '15%' }}>Quantity</th>
                  <th style={{ width: '20%' }}>Unit Price (LKR)</th>
                  <th style={{ width: '20%' }}>Total</th>
                  <th style={{ width: '15%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <div className="form-group">
                        <select 
                          value={item.asset_id} 
                          onChange={e => handleItemChange(i, 'asset_id', e.target.value)} 
                          required 
                          disabled={submitting}
                        >
                          <option value="">Select Asset</option>
                          {formOptions.assets.map(a => (
                            <option key={a.id} value={a.id}>{a.asset_name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <div className="form-group">
                        <input 
                          type="number" 
                          value={item.quantity} 
                          onChange={e => handleItemChange(i, 'quantity', e.target.value)} 
                          min="1" 
                          step="1" 
                          required 
                          disabled={submitting}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="form-group">
                        <input 
                          type="number" 
                          value={item.unit_price} 
                          onChange={e => handleItemChange(i, 'unit_price', e.target.value)} 
                          min="0" 
                          step="0.01" 
                          required 
                          disabled={submitting}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="form-group">
                        <input 
                          type="text" 
                          value={formatCurrency((item.quantity || 0) * (item.unit_price || 0))} 
                          readOnly 
                          className="readonly-input" 
                        />
                      </div>
                    </td>
                    <td>
                      {formData.items.length > 1 && (
                        <button 
                          type="button" 
                          className="btn-remove-item-table" 
                          onClick={() => removeItem(i)} 
                          disabled={submitting} 
                          title="Remove Item"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total */}
        <div className="form-total">
          <div>Total Amount:</div>
          <div className="total-amount">{formatCurrency(calculateTotal())}</div>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddPurchaseForm;