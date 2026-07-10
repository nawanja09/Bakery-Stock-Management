// src/components/purchase/PayNowModal.jsx
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPaperPlane, faInfoCircle, faMoneyBillWave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './PayNowModal.css';

const PayNowModal = ({ isOpen, onClose, supplierId, supplierName, onSuccess }) => {
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));

  const [formData, setFormData] = useState({
    payment_date: dayjs().format('YYYY-MM-DD'),
    payment_method: 'CASH',
    voucher_number: '',
    reference_number: '',
    amount: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

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
    if (formData.payment_method === 'CHEQUE' && !formData.reference_number)
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

      showPopup('success', response.data.message || 'Overpayment recorded successfully!');
      onSuccess && onSuccess(response.data);
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
            Overpayment
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
              This creates an overpayment (Supplier Credit) that is not tied to any specific invoice. You can allocate this credit to invoices later.
            </div>
          </div>

          <form className="pnm-form" onSubmit={handleSubmit} id="pnm-form">
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
                <select name="payment_method" value={formData.payment_method} onChange={handleChange} required>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Account</option>
                  <option value="CHEQUE">Cheque</option>
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
                <label>{formData.payment_method === 'CHEQUE' ? 'Cheque Number *' : 'Reference / Cheque No.'}</label>
                <input
                  type="text"
                  name="reference_number"
                  value={formData.reference_number}
                  onChange={handleChange}
                  placeholder="Optional"
                  required={formData.payment_method === 'CHEQUE'}
                />
              </div>
            </div>

            <div className="pnm-form-group">
              <label>Amount (Rs.) *</label>
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
          </form>
        </div>

        <div className="pnm-footer">
          <button className="pnm-btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button
            className="pnm-btn-submit"
            type="submit"
            form="pnm-form"
            disabled={submitting || !formData.amount || parseFloat(formData.amount) <= 0}
          >
            {submitting
              ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing...</>
              : <><FontAwesomeIcon icon={faMoneyBillWave} /> Pay Now</>}
          </button>
        </div>

      </div>
    </div>
  );
};

export default PayNowModal;
