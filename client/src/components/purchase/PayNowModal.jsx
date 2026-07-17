// src/components/purchase/PayNowModal.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPaperPlane, faInfoCircle, faMoneyBillWave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import usePaymentMethods from '../../utils/usePaymentMethods';
import './PayNowModal.css';

const PayNowModal = ({ isOpen, onClose, supplierId, supplierName, onSuccess }) => {
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const { paymentMethods, loadingMethods } = usePaymentMethods();

  const defaultForm = {
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

    if (!formData.payment_date) return showPopup('error', 'Payment date is required');
    if (!amt || amt <= 0) return showPopup('error', 'Amount must be greater than 0');
    if (formData.payment_method === 'Cheque' && !formData.reference_number)
      return showPopup('error', 'Cheque number is required');
    if (!currentUser?.id) return showPopup('error', 'Please login again');

    setSubmitting(true);
    try {
      const response = await api.post('/suppliers/pay-now', {
        supplier_id: supplierId,
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
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
              <strong>Supplier: {supplierName}</strong><br/>
              This creates an advance supplier payment that is not tied to any specific invoice. You can allocate this credit to invoices later.
            </div>
          </div>

          {/* ✅ FIX: Changed from <form> to <div> with an ID and using handleSubmit directly */}
          <div className="pnm-form" id="pnm-form">
            <div className="pnm-form-group">
              <label>Supplier Name</label>
              <input type="text" value={supplierName || ''} readOnly />
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
            disabled={submitting || !formData.amount || parseFloat(formData.amount) <= 0}
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