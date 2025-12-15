import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditPurchase.css';

const EditPurchase = ({ purchase, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    purchase_date: '',
    supplier_id: '',
    invoice_number: '',
    payment_method: 'CASH',
    payment_status: 'PENDING',
    notes: '',
    items: []
  });
  const [formOptions, setFormOptions] = useState({ suppliers: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showPopup } = usePopup();

  // Fetch form data and initialize form
  const fetchFormData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-purchases/form-data');
      setFormOptions(response.data);

      // Initialize form with purchase data
      setFormData({
        purchase_date: purchase.purchase_date ? purchase.purchase_date.split('T')[0] : '',
        supplier_id: purchase.supplier_id,
        invoice_number: purchase.invoice_number,
        payment_method: purchase.payment_method,
        payment_status: purchase.payment_status,
        notes: purchase.notes || '',
        items: purchase.items?.map(item => ({
          id: item.id,
          asset_id: item.asset_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        })) || [{ asset_id: '', quantity: 1, unit_price: 0 }]
      });
    } catch (err) {
      console.error('Error fetching form data:', err);
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  }, [purchase, showPopup]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      const quantity = parseFloat(newItems[index].quantity) || 0;
      const unitPrice = parseFloat(newItems[index].unit_price) || 0;
      newItems[index].total_price = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { asset_id: '', quantity: 1, unit_price: 0 }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
    } else {
      showPopup('error', 'At least one item is required');
    }
  };

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      return total + quantity * unitPrice;
    }, 0);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.purchase_date || !formData.supplier_id || !formData.invoice_number) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    const validItems = formData.items.filter(item => item.asset_id && item.quantity > 0 && item.unit_price >= 0);
    if (validItems.length === 0) {
      showPopup('error', 'Please add at least one valid item');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      showPopup('error', 'Total amount must be greater than 0');
      return;
    }

    const submitData = {
      purchase_date: formData.purchase_date,
      supplier_id: formData.supplier_id,
      invoice_number: formData.invoice_number,
      payment_method: formData.payment_method,
      payment_status: formData.payment_status,
      notes: formData.notes || '',
      items: validItems.map(item => ({
        asset_id: item.asset_id,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price)
      }))
    };

    setSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
      showPopup('error', 'Failed to update purchase');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="edit-purchase-overlay">
        <div className="edit-purchase-container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-purchase-overlay">
      <div className="edit-purchase-container">
        <div className="header">
          <h3>Edit Purchase - {purchase.purchase_id}</h3>
          <button type="button" className="btn-close" onClick={onCancel} disabled={submitting}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {/* Purchase Info */}
          <section>
            <h4>Purchase Information</h4>
            <div className="row">
              <div className="field">
                <label>Purchase Date *</label>
                <input
                  type="date"
                  name="purchase_date"
                  value={formData.purchase_date}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label>Invoice Number *</label>
                <input
                  type="text"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleChange}
                  placeholder="Enter invoice number"
                  required
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label>Supplier *</label>
                <select
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="">Select Supplier</option>
                  {formOptions.suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.supplier_name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Payment Method</label>
                <select name="payment_method" value={formData.payment_method} onChange={handleChange} disabled={submitting}>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>
              <div className="field">
                <label>Payment Status</label>
                <select name="payment_status" value={formData.payment_status} onChange={handleChange} disabled={submitting}>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                  <option value="PARTIAL">Partial</option>
                </select>
              </div>
            </div>
          </section>

          {/* Items */}
          <section>
            <h4>Items</h4>
            <button type="button" className="btn-add-item" onClick={addItem} disabled={submitting}>+ Add Item</button>
            {formData.items.map((item, index) => (
              <div key={item.id || index} className="item-row">
                <div className="row">
                  <div className="field">
                    <label>Asset *</label>
                    <select
                      value={item.asset_id}
                      onChange={(e) => handleItemChange(index, 'asset_id', e.target.value)}
                      required
                      disabled={submitting}
                    >
                      <option value="">Select Asset</option>
                      {formOptions.assets.map(a => (
                        <option key={a.id} value={a.id}>{a.asset_name} ({a.asset_id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      value={item.quantity}
                      min="1"
                      step="1"
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="field">
                    <label>Unit Price (LKR) *</label>
                    <input
                      type="number"
                      value={item.unit_price}
                      min="0"
                      step="0.01"
                      onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="field">
                    <label>Total</label>
                    <input
                      type="text"
                      value={formatCurrency((item.quantity || 0) * (item.unit_price || 0))}
                      readOnly
                      className="readonly"
                    />
                  </div>
                </div>
                {formData.items.length > 1 && (
                  <button type="button" className="btn-remove-item" onClick={() => removeItem(index)} disabled={submitting}>×</button>
                )}
              </div>
            ))}
          </section>

          {/* Total */}
          <div className="total">
            <span>Total Amount:</span>
            <span className="amount">{formatCurrency(calculateTotal())}</span>
          </div>

          {/* Actions */}
          <div className="actions">
            <button type="submit" className="btn-submit" disabled={submitting}>{submitting ? 'Updating...' : 'Update'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPurchase;
