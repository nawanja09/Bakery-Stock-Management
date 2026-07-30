// src/components/purchase/PayNowModal.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPaperPlane, faInfoCircle, faMoneyBillWave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import usePaymentMethods from '../../utils/usePaymentMethods';
import './PayNowModal.css';

const PayNowModal = ({ isOpen, onClose, suppliers = [], companies = [], supplierId, supplierName, onSuccess }) => {
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const { paymentMethods, loadingMethods } = usePaymentMethods();

  const defaultForm = {
    supplier_id: supplierId || '',
    company_id: '',
    payment_date: dayjs().format('YYYY-MM-DD'),
    payment_method: '',
    voucher_number: '',
    reference_number: '',
    amount: '',
    notes: ''
  };

  const [formData, setFormData] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  // Set default payment method once methods are loaded
  useEffect(() => {
    if (paymentMethods.length > 0 && !formData.payment_method) {
      setFormData(prev => ({ ...prev, payment_method: paymentMethods[0].name }));
    }
  }, [paymentMethods]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...defaultForm,
        supplier_id: supplierId || '',
        company_id: '',
        payment_date: dayjs().format('YYYY-MM-DD'),
        payment_method: paymentMethods.length > 0 ? paymentMethods[0].name : ''
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const amt = parseFloat(formData.amount);
    const normalizedPaymentMethod = (() => {
      const value = String(formData.payment_method || '').trim().toUpperCase();
      if (value === 'CASH' || value === 'BANK_TRANSFER' || value === 'CHEQUE' || value === 'CREDIT') {
        return value;
      }
      if (value === 'BANK' || value === 'BANK TRANSFER') {
        return 'BANK_TRANSFER';
      }
      if (value === 'CARD' || value === 'CREDIT CARD') {
        return 'CREDIT';
      }
      return value;
    })();

    if (!formData.supplier_id) return showPopup('error', 'Please select a supplier');
    if (!formData.company_id) return showPopup('error', 'Please select a company');
    if (!formData.payment_date) return showPopup('error', 'Payment date is required');
    if (!amt || amt <= 0) return showPopup('error', 'Amount must be greater than 0');
    if (normalizedPaymentMethod === 'CHEQUE' && !formData.reference_number)
      return showPopup('error', 'Cheque number is required');
    if (!currentUser?.id) return showPopup('error', 'Please login again');

    setSubmitting(true);
    try {
      const response = await api.post('/suppliers/pay-now', {
        supplier_id: formData.supplier_id,
        company_id: formData.company_id,
        payment_date: formData.payment_date,
        payment_method: normalizedPaymentMethod,
        voucher_number: formData.voucher_number || null,
        reference_number: formData.reference_number || null,
        amount: amt,
        notes: formData.notes || null,
        created_by: currentUser.id
      });

      showPopup('success', response.data.message || 'Advance payment recorded successfully!');

      if (onSuccess) {
        await onSuccess(response.data);
      }

      setFormData({
        ...defaultForm,
        payment_date: dayjs().format('YYYY-MM-DD')
      });

      onClose();
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Failed to process overpayment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pnm-overlay" onClick={onClose}>
      <div className="pnm-modal" onClick={e => e.stopPropagation()}>

        <div className="pnm-header">
          <h3>
            <FontAwesomeIcon icon={faPaperPlane} />
            Advance Payment
          </h3>
          <button className="pnm-close" onClick={onClose} type="button">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="pnm-body">
          <div className="pnm-info-banner">
            <FontAwesomeIcon icon={faInfoCircle} />
            <div>
              This creates an advance supplier payment that is not tied to any specific invoice. You can allocate this credit to invoices later.
            </div>
          </div>

          {/* ✅ FIX: Changed from <form> to <div> with an ID and using handleSubmit directly */}
          <div className="pnm-form" id="pnm-form">
            <div className="pnm-form-row">
              <div className="pnm-form-group">
                <label>Supplier *</label>
                <select
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="pnm-form-group">
                <label>Company *</label>
                <select
                  name="company_id"
                  value={formData.company_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select company</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pnm-form-row">
              <div className="pnm-form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  name="payment_date"
                  value={formData.payment_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="pnm-form-group">
                <label>Payment Method *</label>
                <select name="payment_method" value={formData.payment_method} onChange={handleChange} required disabled={loadingMethods}>
                  {loadingMethods ? (
                    <option value="">Loading…</option>
                  ) : (
                    paymentMethods.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="pnm-form-row">
              <div className="pnm-form-group">
                <label>Voucher Number</label>
                <input
                  type="text"
                  name="voucher_number"
                  value={formData.voucher_number}
                  onChange={handleChange}
                  placeholder="e.g. VCH-001"
                />
              </div>
              <div className="pnm-form-group">
                <label>{formData.payment_method === 'Cheque' ? 'Cheque Number *' : 'Reference / Cheque No.'}</label>
                <input
                  type="text"
                  name="reference_number"
                  value={formData.reference_number}
                  onChange={handleChange}
                  placeholder="Optional"
                  required={formData.payment_method === 'Cheque'}
                />
              </div>
            </div>

            <div className="pnm-form-group">
              <label>Amount (Rs.) *</label>
              <div className="pnm-amount-wrapper">
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  required
                  className="pnm-amount-input"
                />
              </div>
            </div>

            <div className="pnm-form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Add payment notes..."
              />
            </div>
          </div>
        </div>

        <div className="pnm-footer">
          <button className="pnm-btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button
            className="pnm-btn-submit"
            type="button"
            onClick={handleSubmit}  // ✅ Directly call handleSubmit
            disabled={submitting || !formData.supplier_id || !formData.company_id || !formData.amount || parseFloat(formData.amount) <= 0}
          >
            {submitting
              ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing...</>
              : <><FontAwesomeIcon icon={faMoneyBillWave} /> Save</>}
          </button>
        </div>

      </div>
    </div>
  );
};

export default PayNowModal;