// src/components/purchase/SettleNowModal.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faBalanceScale, faCheckCircle, faSpinner, faBoxOpen, faWallet } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './SettleNowModal.css';

/**
 * SettleNowModal
 * Applies supplier credits to a specific invoice
 */
const SettleNowModal = ({ isOpen, onClose, invoice, supplierId, onSuccess }) => {
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));

  const [credits, setCredits] = useState([]);
  const [allocations, setAllocations] = useState({}); // { [creditId]: amount }
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && supplierId) fetchCredits();
  }, [isOpen, supplierId]);

  const fetchCredits = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/suppliers/${supplierId}/credits`);
      // Combine overpayments and return credits
      const combined = [
        ...(data.overpayments || []),
        ...(data.return_credits || [])
      ].sort((a, b) => new Date(a.credit_date) - new Date(b.credit_date)); // oldest first
      setCredits(combined);
      setAllocations({});
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load supplier credits');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const totalAllocated = Object.values(allocations).reduce((sum, amt) => sum + (parseFloat(amt) || 0), 0);
  const remainingInvoiceBalance = parseFloat(invoice.balance_amount) - totalAllocated;

  const handleAllocationChange = (credit, value) => {
    let amt = parseFloat(value);
    if (isNaN(amt)) amt = 0;

    // Cannot exceed the credit's remaining balance
    const maxForCredit = parseFloat(credit.remaining_credit);
    if (amt > maxForCredit) amt = maxForCredit;

    // Cannot exceed invoice remaining balance (excluding current credit's existing allocation)
    const currentAlloc = parseFloat(allocations[credit.id]) || 0;
    const maxForInvoice = parseFloat(invoice.balance_amount) - (totalAllocated - currentAlloc);
    if (amt > maxForInvoice) amt = maxForInvoice;

    setAllocations(prev => ({ ...prev, [credit.id]: amt }));
  };

  const handleSetMax = (credit) => {
    const currentAlloc = parseFloat(allocations[credit.id]) || 0;
    const maxPossible = Math.min(
      parseFloat(credit.remaining_credit),
      parseFloat(invoice.balance_amount) - (totalAllocated - currentAlloc)
    );
    setAllocations(prev => ({ ...prev, [credit.id]: maxPossible }));
  };

  const handleSubmit = async () => {
    const creditsToApply = credits
      .filter(c => parseFloat(allocations[c.id]) > 0)
      .map(c => ({
        credit_type: c.credit_type,
        credit_id: c.id,
        amount: parseFloat(allocations[c.id])
      }));

    if (creditsToApply.length === 0) return showPopup('error', 'Please allocate at least one credit');

    setSubmitting(true);
    try {
      const response = await api.post('/suppliers/settle-credit', {
        purchase_id: invoice.id,
        settlement_date: dayjs().format('YYYY-MM-DD'),
        settled_by: currentUser.id,
        notes: `Settled from available supplier credits`,
        credits: creditsToApply
      });

      showPopup('success', response.data.message || 'Credit settled successfully!');
      onSuccess && onSuccess(response.data);
      onClose();
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Failed to settle credit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="snm-overlay" onClick={onClose}>
      <div className="snm-modal" onClick={e => e.stopPropagation()}>
        
        <div className="snm-header">
          <h3>
            <FontAwesomeIcon icon={faBalanceScale} />
            Settle Invoice with Credit
          </h3>
          <button className="snm-close" onClick={onClose} type="button">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="snm-body">
          <div className="snm-summary">
            <div className="snm-summary-left">
              <h4>Invoice {invoice.invoice_no}</h4>
              <p>{dayjs(invoice.purchase_date).format('DD MMM YYYY')}</p>
            </div>
            <div className="snm-summary-right">
              <span>Current Balance</span>
              <strong>Rs. {parseFloat(invoice.balance_amount).toFixed(2)}</strong>
            </div>
          </div>

          <div>
            <h4 className="snm-section-title">
              <FontAwesomeIcon icon={faWallet} /> Available Credits
            </h4>
            
            {loading ? (
              <div className="snm-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading credits...</div>
            ) : credits.length === 0 ? (
              <div className="snm-empty">
                <FontAwesomeIcon icon={faBoxOpen} />
                <p>No available credits or overpayments found for this supplier.</p>
              </div>
            ) : (
              <div className="snm-credit-list">
                {credits.map(credit => {
                  const amt = allocations[credit.id] || '';
                  const maxAllowed = Math.min(parseFloat(credit.remaining_credit), remainingInvoiceBalance + (parseFloat(amt)||0));
                  const isSelected = parseFloat(amt) > 0;

                  return (
                    <div key={credit.id} className={`snm-credit-item ${isSelected ? 'selected' : ''}`}>
                      <div className="snm-ci-info">
                        <div className="snm-ci-header">
                          <span className={`snm-ci-type ${credit.credit_type === 'return_credit' ? 'return' : 'advance'}`}>
                            {credit.source}
                          </span>
                          <span className="snm-ci-num">{credit.credit_number}</span>
                          <span className="snm-ci-date">{dayjs(credit.credit_date).format('DD MMM YYYY')}</span>
                        </div>
                        <div className="snm-ci-details">
                          <span>Original: Rs. {parseFloat(credit.original_amount).toFixed(2)}</span>
                          <strong>Available: Rs. {parseFloat(credit.remaining_credit).toFixed(2)}</strong>
                        </div>
                      </div>
                      
                      <div className="snm-ci-action">
                        <div className="snm-ci-input-group">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={amt}
                            onChange={(e) => handleAllocationChange(credit, e.target.value)}
                            disabled={maxAllowed <= 0 && !amt}
                          />
                          <button
                            type="button"
                            className="snm-ci-max"
                            onClick={() => handleSetMax(credit)}
                            disabled={maxAllowed <= 0 && !amt}
                          >
                            Max
                          </button>
                        </div>
                        <FontAwesomeIcon icon={faCheckCircle} className="snm-ci-check" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="snm-totals">
          <div className="snm-total-item">
            <span>Invoice Balance</span>
            <span>Rs. {parseFloat(invoice.balance_amount).toFixed(2)}</span>
          </div>
          <div className="snm-total-item active">
            <span>Total Settled</span>
            <span>Rs. {totalAllocated.toFixed(2)}</span>
          </div>
          <div className={`snm-total-item rem ${remainingInvoiceBalance <= 0 ? 'zero' : ''}`}>
            <span>Remaining Balance</span>
            <span>Rs. {Math.max(0, remainingInvoiceBalance).toFixed(2)}</span>
          </div>
        </div>

        <div className="snm-footer">
          <button className="snm-btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button
            className="snm-btn-submit"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || totalAllocated <= 0}
          >
            {submitting 
              ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing...</> 
              : <><FontAwesomeIcon icon={faCheckCircle} /> Apply Credit</>}
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettleNowModal;
