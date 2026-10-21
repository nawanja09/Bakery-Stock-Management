import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './EditPurchase.css';
import { Modal } from '../../common/ui';

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

  const fetchFormData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-purchases/form-data');
      setFormOptions(response.data);

      setFormData({
        purchase_date: purchase.purchase_date?.split('T')[0] || '',
        supplier_id: purchase.supplier_id,
        invoice_number: purchase.invoice_number,
        payment_method: purchase.payment_method,
        payment_status: purchase.payment_status,
        notes: purchase.notes || '',
        items:
          purchase.items?.map(item => ({
            id: item.id,
            asset_id: item.asset_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          })) || [{ asset_id: '', quantity: 1, unit_price: 0 }]
      });
    } catch {
      showPopup('error', 'Failed to load form data');
    } finally {
      setLoading(false);
    }
  }, [purchase, showPopup]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const items = [...formData.items];
    items[index] = { ...items[index], [field]: value };
    setFormData(prev => ({ ...prev, items }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { asset_id: '', quantity: 1, unit_price: 0 }]
    }));
  };

  const removeItem = index => {
    if (formData.items.length === 1) {
      showPopup('error', 'At least one item is required');
      return;
    }
    const items = [...formData.items];
    items.splice(index, 1);
    setFormData(prev => ({ ...prev, items }));
  };

  const calculateTotal = () =>
    formData.items.reduce(
      (sum, i) =>
        sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0),
      0
    );

  const formatCurrency = amount =>
    new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR'
    }).format(amount || 0);

  const handleSubmit = async e => {
    e.preventDefault();

    if (!formData.purchase_date || !formData.supplier_id || !formData.invoice_number) {
      showPopup('error', 'Please fill required fields');
      return;
    }

    const validItems = formData.items.filter(
      i => i.asset_id && i.quantity > 0 && i.unit_price >= 0
    );

    if (!validItems.length) {
      showPopup('error', 'Add at least one valid item');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        items: validItems.map(i => ({
          asset_id: i.asset_id,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price)
        }))
      });
    } catch {
      showPopup('error', 'Failed to update purchase');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Modal title="Edit Purchase" size="xl" onClose={onCancel} className="cutlery-form-modal">
        <div className="loading" role="status" aria-live="polite">Loading…</div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Edit Purchase"
      size="xl"
      onClose={submitting ? undefined : onCancel}
      className="cutlery-form-modal"
    >
      <form onSubmit={handleSubmit} className="ep-form">
        <section className="ep-section">
          <h4>Purchase Details</h4>
          <div className="ep-grid">
            <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} />
            <input type="text" name="invoice_number" placeholder="Invoice Number" value={formData.invoice_number} onChange={handleChange} />
            <select name="supplier_id" value={formData.supplier_id} onChange={handleChange}>
              <option value="">Select Supplier</option>
              {formOptions.suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.supplier_name}</option>
              ))}
            </select>
            <select name="payment_method" value={formData.payment_method} onChange={handleChange}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CREDIT">Credit</option>
            </select>
            <select name="payment_status" value={formData.payment_status} onChange={handleChange}>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
            </select>
          </div>
        </section>

        <section className="ep-section">
          <div className="ep-items-header">
            <h4>Items</h4>
            <button type="button" onClick={addItem}>+ Add Item</button>
          </div>

          {formData.items.map((item, index) => (
            <div className="ep-item-row" key={index}>
              <select value={item.asset_id} onChange={e => handleItemChange(index, 'asset_id', e.target.value)}>
                <option value="">Asset</option>
                {formOptions.assets.map(a => (
                  <option key={a.id} value={a.id}>{a.asset_name}</option>
                ))}
              </select>

              <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} />
              <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => handleItemChange(index, 'unit_price', e.target.value)} />
              <div className="ep-item-total">{formatCurrency(item.quantity * item.unit_price)}</div>

              <button type="button" className="ep-remove" onClick={() => removeItem(index)}>×</button>
            </div>
          ))}
        </section>

        <footer className="ep-footer">
          <div className="ep-total">
            Total: <strong>{formatCurrency(calculateTotal())}</strong>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update Purchase'}
          </button>
        </footer>
      </form>
    </Modal>
  );
};

export default EditPurchase;
