// src/components/purchase/InvoicePaymentModal.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCreditCard, faTimes, faCheckCircle, faFileInvoice, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import usePaymentMethods from '../../utils/usePaymentMethods';
import './InvoicePaymentModal.css';

const InvoicePaymentModal = ({ isOpen, onClose, selectedInvoices = [], supplierName, onSuccess }) => {
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const { paymentMethods, loadingMethods } = usePaymentMethods();

  const totalBalance = selectedInvoices.reduce((s, inv) => s + parseFloat(inv.balance_amount || 0), 0);

  const uniqueCompanies = [...new Map(
    selectedInvoices
      .filter(inv => inv.company_id)
      .map(inv => [String(inv.company_id), inv.company_name])
  ).values()];
  const companyDisplay = uniqueCompanies.length === 0
    ? '—'
    : uniqueCompanies.length === 1
      ? uniqueCompanies[0]
      : 'Multiple Companies';

  // For Cash/Bank ledger posting we need a single company id. All selected
  // invoices are already required to belong to the same supplier; when they
  // also share a company (the common case) we use it directly - if not, we
  // fall back to the first invoice's company so the payment still posts.
  const resolvedCompanyId = selectedInvoices.find(inv => inv.company_id)?.company_id || '';

  const [formData, setFormData] = useState({
    payment_date: dayjs().format('YYYY-MM-DD'),
    payment_method: '',
    voucher_number: '',
    check_number: '',
    amount: totalBalance,
    notes: '',
    bank_id: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [cashBalance, setCashBalance] = useState(null);
  const [loadingCashBalance, setLoadingCashBalance] = useState(false);

  const isCashMethod = formData.payment_method === 'Cash';
  const isBankMethod = formData.payment_method === 'Bank';

  useEffect(() => {
    if (!isBankMethod || !resolvedCompanyId) {
      setBankAccounts([]);
      return;
    }
    let cancelled = false;
    setLoadingBanks(true);
    api.get('/finance/bank/accounts', { params: { companyId: resolvedCompanyId } })
      .then(res => { if (!cancelled) setBankAccounts(res.data || []); })
      .catch(() => { if (!cancelled) setBankAccounts([]); })
      .finally(() => { if (!cancelled) setLoadingBanks(false); });
    return () => { cancelled = true; };
  }, [isBankMethod, resolvedCompanyId]);

  useEffect(() => {
    if (!isCashMethod || !resolvedCompanyId) {
      setCashBalance(null);
      return;
    }
    let cancelled = false;
    setLoadingCashBalance(true);
    api.get(`/finance/cash/balance/${resolvedCompanyId}`)
      .then(res => { if (!cancelled) setCashBalance(res.data?.balance ?? 0); })
      .catch(() => { if (!cancelled) setCashBalance(null); })
      .finally(() => { if (!cancelled) setLoadingCashBalance(false); });
    return () => { cancelled = true; };
  }, [isCashMethod, resolvedCompanyId]);

  const selectedBankAccount = bankAccounts.find(b => String(b.id) === String(formData.bank_id));

  // Set default payment method once methods are loaded
  useEffect(() => {
    if (paymentMethods.length > 0 && !formData.payment_method) {
      setFormData(prev => ({ ...prev, payment_method: paymentMethods[0].name }));
    }
  }, [paymentMethods]);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        amount: totalBalance,
        payment_method: paymentMethods.length > 0 ? paymentMethods[0].name : prev.payment_method
      }));
    }
  }, [isOpen, totalBalance]);

  if (!isOpen) return null;

  const computeAllocations = () => {
    let remaining = parseFloat(formData.amount) || 0;
    return selectedInvoices.map(inv => {
      const bal = parseFloat(inv.balance_amount || 0);
      const alloc = Math.min(remaining, bal);
      remaining -= alloc;
      return { ...inv, allocated: alloc };
    });
  };

  const allocations = computeAllocations();

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value };
      if (name === 'payment_method') {
        next.bank_id = '';
      }
      return next;
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();

    const uniqueSupplierIds = [...new Set(selectedInvoices.map(inv => inv.supplier_id).filter(Boolean))];
    if (uniqueSupplierIds.length > 1) {
      return showPopup(
        'error',
        'Cannot pay invoices from different suppliers in one transaction. ' +
        'Please select invoices belonging to the same supplier only.'
      );
    }

    if (!formData.payment_date) return showPopup('error', 'Payment date is required');
    if (formData.amount <= 0) return showPopup('error', 'Amount must be greater than 0');
    if (formData.payment_method === 'Cheque' && !formData.check_number) {
      return showPopup('error', 'Cheque number is required');
    }
    if (formData.payment_method === 'Bank' && !formData.bank_id) {
      return showPopup('error', 'Please select a bank account');
    }
    if (!currentUser?.id) return showPopup('error', 'Please login again');

    setSubmitting(true);
    try {
      const payloadAllocations = allocations
        .filter((alloc) => alloc.allocated > 0)
        .map((alloc) => ({
          purchase_id: alloc.id,
          amount: alloc.allocated
        }));

      console.log('📤 Sending payment payload:', {
        payment_date: formData.payment_date,
        amount: formData.amount,
        payment_method: formData.payment_method,
        invoice_allocations: payloadAllocations
      });

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

      const response = await api.post('/purchases/pay-multiple', {
        payment_date: formData.payment_date,
        amount: formData.amount,
        payment_method: normalizedPaymentMethod,
        check_number: formData.check_number || null,
        voucher_number: formData.voucher_number || null,
        notes: formData.notes || null,
        created_by: currentUser.id,
        invoice_allocations: payloadAllocations,
        bank_id: normalizedPaymentMethod === 'BANK_TRANSFER' ? formData.bank_id : null
      });

      console.log('✅ Payment response:', response.data);

      showPopup('success', response.data.message || `Payment of Rs. ${formData.amount.toFixed(2)} recorded successfully!`);
      
      if (onSuccess) {
        await onSuccess({
          success: true,
          amount: formData.amount,
          allocations: allocations,
          response: response.data,
          updatedInvoices: response.data.updated_invoices || []
        });
      }
      
      onClose();
    } catch (err) {
      console.error('❌ Payment error:', err);
      showPopup('error', err.response?.data?.error || 'Failed to process payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ipm-overlay" onClick={onClose}>
      <div className="ipm-modal" onClick={e => e.stopPropagation()}>

        <div className="ipm-header">
          <h3>
            <FontAwesomeIcon icon={faCreditCard} />
            Record Payment
          </h3>
          <button className="ipm-close" onClick={onClose} type="button">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="ipm-body">
          <div className="ipm-invoice-summary">
            <h4><FontAwesomeIcon icon={faFileInvoice} /> Selected Invoices — {supplierName}</h4>
            <div>
              {selectedInvoices.map(inv => (
                <span key={inv.id} className="ipm-invoice-tag">
                  {inv.invoice_no} &nbsp;·&nbsp; Rs. {parseFloat(inv.balance_amount).toFixed(2)}
                </span>
              ))}
            </div>
            <div className="ipm-total-row">
              <span>Total Balance Due</span>
              <span className="ipm-balance">Rs. {totalBalance.toFixed(2)}</span>
            </div>
          </div>

          <div className="ipm-form" id="ipm-form">
            <div className="ipm-form-row">
              <div className="ipm-form-group">
                <label>Supplier Name</label>
                <input type="text" value={supplierName || ''} readOnly />
              </div>

              <div className="ipm-form-group">
                <label>Company</label>
                <input type="text" value={companyDisplay} readOnly />
              </div>
            </div>

            <div className="ipm-form-row">
              <div className="ipm-form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  name="payment_date"
                  value={formData.payment_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="ipm-form-group">
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

            <div className="ipm-form-row">
              <div className="ipm-form-group">
                <label>Voucher Number</label>
                <input
                  type="text"
                  name="voucher_number"
                  value={formData.voucher_number}
                  onChange={handleChange}
                  placeholder="VCH-0001"
                />
              </div>
              <div className="ipm-form-group">
                <label>{formData.payment_method === 'Cheque' ? 'Cheque Number *' : 'Reference / Cheque No.'}</label>
                <input
                  type="text"
                  name="check_number"
                  value={formData.check_number}
                  onChange={handleChange}
                  placeholder="Optional"
                  required={formData.payment_method === 'Cheque'}
                />
              </div>
            </div>

            <div className="ipm-form-group">
              <label>Payment Amount *</label>
              <div className="ipm-amount-wrapper">
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  required
                />
                <button
                  type="button"
                  className="ipm-max-btn"
                  onClick={() => setFormData(prev => ({ ...prev, amount: totalBalance }))}
                >
                  Full Amount
                </button>
              </div>
              <span className="ipm-hint">Any amount above the invoice balance will be stored as supplier credit.</span>
            </div>

            {isBankMethod && (
              <div className="ipm-form-group">
                <label>Bank Account *</label>
                <select
                  name="bank_id"
                  value={formData.bank_id}
                  onChange={handleChange}
                  required
                  disabled={!resolvedCompanyId || loadingBanks}
                >
                  <option value="">
                    {!resolvedCompanyId
                      ? 'No company found for selected invoices'
                      : loadingBanks ? 'Loading…' : 'Select bank account'}
                  </option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
                    </option>
                  ))}
                </select>
                {selectedBankAccount && (
                  <div className="ipm-balance-hint">
                    Current Balance: Rs. {parseFloat(selectedBankAccount.current_balance || 0).toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {isCashMethod && resolvedCompanyId && (
              <div className="ipm-form-group">
                <div className="ipm-balance-hint">
                  {loadingCashBalance
                    ? 'Loading cash balance…'
                    : `Cash In Hand Balance: Rs. ${parseFloat(cashBalance || 0).toFixed(2)}`}
                </div>
              </div>
            )}

            <div className="ipm-form-group">
              <label>Notes (Optional)</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Add any payment notes..."
              />
            </div>
          </div>

          {selectedInvoices.length > 1 && formData.amount > 0 && (
            <div className="ipm-allocation">
              <h4><FontAwesomeIcon icon={faCheckCircle} /> Allocation Breakdown</h4>
              {allocations.map(a => (
                <div key={a.id} className="ipm-alloc-row">
                  <div>
                    <span className="ipm-alloc-inv">{a.invoice_no}</span>
                    <span className="ipm-alloc-remaining"> — Balance: Rs. {parseFloat(a.balance_amount).toFixed(2)}</span>
                  </div>
                  <span className="ipm-alloc-amt">Rs. {a.allocated.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ipm-footer">
          <button className="ipm-btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button
            className="ipm-btn-submit"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || formData.amount <= 0}
          >
            {submitting
              ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing…</>
              : <><FontAwesomeIcon icon={faCheckCircle} /> Confirm Payment</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicePaymentModal;