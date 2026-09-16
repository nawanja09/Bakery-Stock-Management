// src/components/adjustments/PurchasingPaymentAdjustmentEditor.jsx
//
// "Record Payment Details" view for adjusting a payment that was already
// recorded against a purchasing invoice. Follows the existing Record
// Payment UI as its visual reference, but only Payment Date and Payment
// Amount are editable - every other field is read-only.
//
// props.embeddedId / props.onSaved / props.onCancel follow the same
// contract as EditPurchase / EditIssuance / EditWastage so it drops
// straight into CategoryAdjustmentPanel.
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave, faTimes, faSpinner, faLock, faExclamationTriangle, faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import { formatCurrency } from '../../utils/formatters';
import './Adjustments.css';

const ReadOnlyField = ({ label, value }) => (
  <div className="form-group">
    <label>
      {label} <FontAwesomeIcon icon={faLock} style={{ fontSize: '11px', opacity: 0.5, marginLeft: '4px' }} title="Read-only" />
    </label>
    <input type="text" className="form-input" value={value ?? '-'} disabled readOnly />
  </div>
);

const PurchasingPaymentAdjustmentEditor = ({ embeddedId, onCancel, onSaved }) => {
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/purchases/payments/${embeddedId}/adjust-detail`);
        if (cancelled) return;
        const data = res.data;
        setDetail(data);
        setPaymentDate((data.payment_date || '').slice(0, 10));
        setAmount(String(data.amount ?? ''));
      } catch (err) {
        console.error('Error loading payment adjustment detail:', err);
        showPopup('error', err.response?.data?.error || 'Failed to load payment details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedId]);

  if (loading) {
    return (
      <div className="form-section">
        <p><FontAwesomeIcon icon={faSpinner} spin /> Loading payment details...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="form-section">
        <div className="alert-message error">Unable to load this payment's details.</div>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <FontAwesomeIcon icon={faTimes} /> Back
        </button>
      </div>
    );
  }

  const parsedAmount = parseFloat(amount);
  const availableBalance = parseFloat(detail.invoice_available_balance) || 0;
  const willCreateCredit = Number.isFinite(parsedAmount) && parsedAmount > availableBalance;
  const excessAmount = willCreateCredit ? Number((parsedAmount - availableBalance).toFixed(2)) : 0;

  const validate = () => {
    if (!paymentDate) return 'Payment Date is required.';
    if (!amount || Number.isNaN(parsedAmount)) return 'Payment Amount is required.';
    if (parsedAmount <= 0) return 'Payment Amount must be greater than 0.';
    return '';
  };

  const handleSave = async () => {
    const error = validate();
    setValidationError(error);
    if (error) return;

    setIsSubmitting(true);
    try {
      await api.put(`/purchases/payments/${embeddedId}/adjust`, {
        payment_date: paymentDate,
        amount: parsedAmount
      });
      showPopup('success', 'Payment adjustment saved successfully!');
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Error saving payment adjustment:', err);
      showPopup('error', err.response?.data?.error || 'Failed to save payment adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="form-section">
      <h3 className="form-section-title">Record Payment Details - Purchasing Payment Adjustment</h3>

      <div className="alert-message info" style={{ marginBottom: 'var(--spacing-md)' }}>
        <FontAwesomeIcon icon={faExclamationTriangle} style={{ marginRight: '8px' }} />
        Only <strong>Payment Date</strong> and <strong>Payment Amount</strong> can be changed. All other details are read-only.
      </div>

      <div className="form-grid">
        <ReadOnlyField label="Invoice" value={detail.invoice_no} />
        <ReadOnlyField label="Supplier Name" value={detail.supplier_name} />
        <ReadOnlyField label="Company" value={detail.company_name} />
        <ReadOnlyField label="Payment Method" value={detail.payment_method} />
        <ReadOnlyField label="Voucher Number" value={detail.voucher_number} />
        <ReadOnlyField label="Reference / Cheque No." value={detail.reference_number} />
        <ReadOnlyField
          label="Bank Account"
          value={detail.bank_name ? `${detail.bank_name}${detail.account_number ? ` - ${detail.account_number}` : ''}` : 'N/A (Cash)'}
        />
        <ReadOnlyField label="Total Balance Due / Invoice Balance" value={formatCurrency(detail.invoice_total)} />
      </div>

      <div className="form-grid two-col">
        <div className="form-group">
          <label>Payment Date <span className="required">*</span></label>
          <input
            type="date"
            className="form-input"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Payment Amount <span className="required">*</span></label>
          <input
            type="number"
            className="form-input"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {detail.notes && (
        <div className="form-group full-width">
          <label>Notes</label>
          <textarea className="form-textarea" rows="2" value={detail.notes} disabled readOnly />
        </div>
      )}

      {willCreateCredit && (
        <div className="alert-message info">
          <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: '8px' }} />
          This invoice's remaining balance is {formatCurrency(availableBalance)}. The extra {formatCurrency(excessAmount)}
          {' '}will be recorded as supplier credit, same as the system already does for overpayments.
        </div>
      )}

      {validationError && (
        <div className="alert-message error">{validationError}</div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          <FontAwesomeIcon icon={faTimes} /> Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSubmitting}>
          <FontAwesomeIcon icon={isSubmitting ? faSpinner : faSave} spin={isSubmitting} />
          {' '}{isSubmitting ? 'Saving...' : 'Confirm / Save Adjustment'}
        </button>
      </div>
    </div>
  );
};

export default PurchasingPaymentAdjustmentEditor;
