// src/components/adjustments/PurchasingPaymentAdjustmentEditor.jsx
//
// "Record Payment Details" view for adjusting a payment that was already
// recorded against a purchasing invoice. Follows the existing Record
// Payment UI as its visual reference. Invoice, supplier, company, and cheque
// reference stay fixed; editable transaction fields follow payment rules.
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
import usePaymentMethods from '../../utils/usePaymentMethods';
import './Adjustments.css';

const ReadOnlyField = ({ label, value }) => (
  <div className="form-group">
    <label>
      {label} <FontAwesomeIcon icon={faLock} style={{ fontSize: '11px', opacity: 0.5, marginLeft: '4px' }} title="Read-only" />
    </label>
    <input type="text" className="form-input" value={value ?? '-'} disabled readOnly />
  </div>
);

const normalizeMethod = value => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BANK' || normalized === 'BANK TRANSFER') return 'BANK_TRANSFER';
  if (normalized === 'CREDIT CARD' || normalized === 'CARD') return 'CREDIT';
  return normalized;
};

const PurchasingPaymentAdjustmentEditor = ({ embeddedId, onCancel, onSaved }) => {
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [bankId, setBankId] = useState('');
  const [notes, setNotes] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const { paymentMethods } = usePaymentMethods();
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
        setPaymentMethod(normalizeMethod(data.payment_method));
        setVoucherNumber(data.voucher_number || '');
        setBankId(data.bank_id ? String(data.bank_id) : '');
        setNotes(data.notes || '');
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

  useEffect(() => {
    if (!detail?.company_id) return;
    api.get('/finance/bank/accounts', { params: { companyId: detail.company_id } })
      .then(res => setBankAccounts(res.data || []))
      .catch(() => setBankAccounts([]));
  }, [detail?.company_id]);

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
  const methodCode = normalizeMethod(paymentMethod);
  const usesBank = ['BANK', 'BANK_TRANSFER', 'BANK TRANSFER'].includes(methodCode);

  const validate = () => {
    if (!paymentDate) return 'Payment Date is required.';
    if (!amount || Number.isNaN(parsedAmount)) return 'Payment Amount is required.';
    if (parsedAmount <= 0) return 'Payment Amount must be greater than 0.';
    if (!paymentMethod) return 'Payment Method is required.';
    if (usesBank && !bankId) return 'Bank Account is required for bank payments.';
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
        amount: parsedAmount,
        payment_method: paymentMethod,
        voucher_number: voucherNumber,
        bank_id: usesBank ? bankId : null,
        notes
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
        Invoice, supplier, company, and reference / cheque number are fixed. Other payment details can be changed.
      </div>

      <div className="form-grid">
        <ReadOnlyField label="Invoice No" value={detail.invoice_no} />
        <ReadOnlyField label="Supplier Name" value={detail.supplier_name} />
        <ReadOnlyField label="Company" value={detail.company_name} />
        <div className="form-group">
          <label>Payment Method <span className="required">*</span></label>
          <select className="form-input" value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setBankId(''); }}>
            {paymentMethods.map(method => {
              const code = normalizeMethod(method.name);
              return <option key={method.id || method.name} value={code}>{method.name}</option>;
            })}
          </select>
        </div>
        <div className="form-group">
          <label>Voucher Number</label>
          <input className="form-input" value={voucherNumber} onChange={e => setVoucherNumber(e.target.value)} />
        </div>
        <ReadOnlyField label="Reference / Cheque No." value={detail.reference_number} />
        {usesBank && <div className="form-group">
          <label>Bank Account <span className="required">*</span></label>
          <select className="form-input" value={bankId} onChange={e => setBankId(e.target.value)}>
            <option value="">Select bank account</option>
            {bankAccounts.map(bank => <option key={bank.id} value={bank.id}>{bank.bank_name}{bank.account_number ? ` - ${bank.account_number}` : ''}</option>)}
          </select>
        </div>}
        <div className="form-group">
          <label>Invoice Balance</label>
          <output className="form-input">{formatCurrency(detail.invoice_total)}</output>
        </div>
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

      <div className="form-group full-width">
          <label>Notes</label>
          <textarea className="form-textarea" rows="2" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

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
