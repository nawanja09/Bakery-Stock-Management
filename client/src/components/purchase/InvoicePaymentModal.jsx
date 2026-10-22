// src/components/purchase/InvoicePaymentModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCreditCard, faTimes, faCheckCircle, faFileInvoice, faSpinner
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
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
    discount_amount: 0,
    notes: '',
    bank_id: ''
  });
  const [submitting, setSubmitting] = useState(false);
  // One id per opening of this form: a double-click or a retried request is
  // recorded by the server as ONE payment.
  const paymentRequestIdRef = useRef(null);
  const dialogRef = useRef(null);
  // Escape closes (not while saving); focus moves in; Tab and page scroll stay put.
  useDialog(dialogRef, { open: Boolean(isOpen), onClose: submitting ? undefined : onClose });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [cashBalance, setCashBalance] = useState(null);
  const [loadingCashBalance, setLoadingCashBalance] = useState(false);

  const isCashMethod = formData.payment_method === 'Cash';
  const isChequeMethod = formData.payment_method === 'Cheque';
  const isBankMethod = formData.payment_method === 'Bank';
  const needsBank = isBankMethod || isChequeMethod;

  useEffect(() => {
    if (!needsBank || !resolvedCompanyId) {
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
  }, [needsBank, resolvedCompanyId]);

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
        discount_amount: 0,
        payment_method: paymentMethods.length > 0 ? paymentMethods[0].name : prev.payment_method
      }));
    }
  }, [isOpen, totalBalance]);

  useEffect(() => {
    if (isOpen) {
      paymentRequestIdRef.current = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const computeAllocations = () => {
    let remainingPayment = parseFloat(formData.amount) || 0;
    let remainingDiscount = parseFloat(formData.discount_amount) || 0;
    return selectedInvoices.map(inv => {
      const bal = parseFloat(inv.balance_amount || 0);
      const alloc = Math.min(remainingPayment, bal);
      remainingPayment -= alloc;
      // Discount can only reduce what's still owed after this payment - it
      // is not extra money, so it never pushes the invoice into credit.
      const balanceAfterPayment = bal - alloc;
      const discountAlloc = Math.min(remainingDiscount, balanceAfterPayment);
      remainingDiscount -= discountAlloc;
      return { ...inv, allocated: alloc, discountAllocated: discountAlloc };
    });
  };

  const allocations = computeAllocations();
  const totalDiscountAllocated = allocations.reduce((sum, a) => sum + a.discountAllocated, 0);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: (name === 'amount' || name === 'discount_amount') ? parseFloat(value) || 0 : value };
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

    if (uniqueCompanies.length > 1) {
      return showPopup(
        'error',
        'You can only make a payment for one company at a time. Please deselect the current company invoices before selecting invoices from another company.'
      );
    }

    if (!formData.payment_date) return showPopup('error', 'Payment date is required');
    if (formData.amount <= 0) return showPopup('error', 'Amount must be greater than 0');
    if (formData.discount_amount < 0) return showPopup('error', 'Discount amount cannot be negative');
    if (formData.payment_method === 'Cheque' && !formData.check_number) {
      return showPopup('error', 'Cheque number is required');
    }
    if (formData.payment_method === 'Bank' && !formData.bank_id) {
      return showPopup('error', 'Please select a bank account');
    }
    if (formData.amount - totalBalance > 0.005 && !isCashMethod && !isBankMethod) {
      return showPopup(
        'error',
        'Paying more than the balance is only possible by Cash or Bank. ' +
        'Pay the balance, and record the rest as an Advance Payment.'
      );
    }
    if (!currentUser?.id) return showPopup('error', 'Please login again');

    setSubmitting(true);
    try {
      const payloadAllocations = allocations
        .filter((alloc) => alloc.allocated > 0 || alloc.discountAllocated > 0)
        .map((alloc) => ({
          purchase_id: alloc.id,
          amount: alloc.allocated,
          discount: alloc.discountAllocated
        }));

      console.log('📤 Sending payment payload:', {
        payment_date: formData.payment_date,
        amount: formData.amount,
        discount_amount: formData.discount_amount,
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
        discount_amount: formData.discount_amount || 0,
        payment_method: normalizedPaymentMethod,
        check_number: formData.check_number || null,
        voucher_number: formData.voucher_number || null,
        notes: formData.notes || null,
        invoice_allocations: payloadAllocations,
        request_id: paymentRequestIdRef.current,
        bank_id: (normalizedPaymentMethod === 'BANK_TRANSFER' || normalizedPaymentMethod === 'CHEQUE') ? (formData.bank_id || null) : null
      });

      console.log('✅ Payment response:', response.data);

      const fallbackMessage = totalDiscountAllocated > 0
        ? `Payment of Rs. ${formData.amount.toFixed(4)} and discount of Rs. ${totalDiscountAllocated.toFixed(4)} recorded successfully!`
        : `Payment of Rs. ${formData.amount.toFixed(4)} recorded successfully!`;
      showPopup('success', response.data.message || fallbackMessage, {
        title: 'Payment Successful',
        confirmText: 'OK'
      });
      
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

  return createPortal((
    // Backdrop is inert: an outside click must not discard what was typed.
    <div className="ipm-overlay">
      <div ref={dialogRef} className="ipm-modal erp-payment-modal" role="dialog" aria-modal="true" aria-label="Invoice Payment">

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
                  {inv.invoice_no} &nbsp;·&nbsp; Rs. {parseFloat(inv.balance_amount).toFixed(4)}
                </span>
              ))}
            </div>
            <div className="ipm-total-row">
              <span>Total Balance Due</span>
              <span className="ipm-balance">Rs. {totalBalance.toFixed(4)}</span>
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
                  min="0.0001"
                  step="0.0001"
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
              <span className="ipm-hint">Any amount above the invoice balance will be stored as supplier credit (Cash or Bank only).</span>
            </div>

            <div className="ipm-form-group">
              <label>Discount Amount (Optional)</label>
              <div className="ipm-amount-wrapper">
                <input
                  type="number"
                  name="discount_amount"
                  value={formData.discount_amount}
                  onChange={handleChange}
                  min="0"
                  step="0.0001"
                  placeholder="0.00"
                />
              </div>
              <span className="ipm-hint">Reduces the amount owed on this invoice, on top of the payment amount above. It cannot exceed the remaining balance.</span>
            </div>

            {isChequeMethod && (
              <div style={{ padding: '8px 12px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '13px', margin: '8px 0', borderLeft: '4px solid #f59e0b' }}>
                ℹ️ <strong>Cheque Payment:</strong> Amount remains <strong>Pending / Unreleased</strong>. The Bank Ledger will NOT be deducted until the cheque is released.
              </div>
            )}

            {needsBank && (
              <div className="ipm-form-group">
                <label>Bank Account {isBankMethod ? '*' : '(Cheque account)'}</label>
                <select
                  name="bank_id"
                  value={formData.bank_id}
                  onChange={handleChange}
                  required={isBankMethod}
                  disabled={!resolvedCompanyId || loadingBanks}
                >
                  <option value="">
                    {!resolvedCompanyId
                      ? 'No company found for selected invoices'
                      : loadingBanks ? 'Loading…' : (isBankMethod ? 'Select bank account *' : 'Select bank account (optional)')}
                  </option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}
                    </option>
                  ))}
                </select>
                {selectedBankAccount && (
                  <div className="ipm-balance-hint">
                    Current Balance: Rs. {parseFloat(selectedBankAccount.current_balance || 0).toFixed(4)}
                  </div>
                )}
              </div>
            )}

            {isCashMethod && resolvedCompanyId && (
              <div className="ipm-form-group">
                <div className="ipm-balance-hint">
                  {loadingCashBalance
                    ? 'Loading cash balance…'
                    : `Cash In Hand Balance: Rs. ${parseFloat(cashBalance || 0).toFixed(4)}`}
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
                    <span className="ipm-alloc-remaining"> — Balance: Rs. {parseFloat(a.balance_amount).toFixed(4)}</span>
                    {a.discountAllocated > 0 && (
                      <span className="ipm-alloc-remaining"> · Discount: Rs. {a.discountAllocated.toFixed(4)}</span>
                    )}
                  </div>
                  <span className="ipm-alloc-amt">Rs. {a.allocated.toFixed(4)}</span>
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
  ), document.getElementById('modal-root') || document.body);
};

export default InvoicePaymentModal;