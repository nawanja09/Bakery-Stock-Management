// src/components/purchase/PaymentModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCreditCard, 
  faMoneyBillWave, 
  faUniversity,
  faTimes,
  faCheckCircle,
  faHistory,
  faCalendarAlt
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import usePaymentMethods from '../../utils/usePaymentMethods';
import './PaymentModal.css';

const PaymentModal = ({ purchase, onClose, onPaymentComplete }) => {
  const [formData, setFormData] = useState({
    payment_date: dayjs().format('YYYY-MM-DD'),
    amount: purchase.balance_amount,
    payment_method: '',
    check_number: '',
    notes: ''
  });
  
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  // Escape closes (not while saving); focus moves in; Tab and page scroll stay put.
  useDialog(dialogRef, { open: true, onClose: submitting ? undefined : onClose });
  const [showHistory, setShowHistory] = useState(false);
  
  const { showPopup } = usePopup();
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const { paymentMethods, loadingMethods } = usePaymentMethods();

  // Set default payment method once methods are loaded
  useEffect(() => {
    if (paymentMethods.length > 0 && !formData.payment_method) {
      setFormData(prev => ({ ...prev, payment_method: paymentMethods[0].name }));
    }
  }, [paymentMethods]);

  useEffect(() => {
    fetchPaymentHistory();
  }, [purchase.id]);

  const fetchPaymentHistory = async () => {
    try {
      const response = await api.get(`/purchases/${purchase.id}/payments`);
      setPaymentHistory(response.data);
    } catch (error) {
      console.error('Error fetching payment history:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value
    }));
  };

  const validateForm = () => {
    if (!formData.payment_date) {
      showPopup('error', 'Payment date is required');
      return false;
    }

    if (formData.amount <= 0) {
      showPopup('error', 'Payment amount must be greater than 0');
      return false;
    }

    if (formData.amount > purchase.balance_amount) {
      showPopup('error', `Payment amount cannot exceed balance of ${formatCurrency(purchase.balance_amount)}`);
      return false;
    }

    if (formData.payment_method === 'Cheque' && !formData.check_number) {
      showPopup('error', 'Check number is required for cheque payments');
      return false;
    }

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information missing. Please login again.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      const response = await api.post(`/purchases/${purchase.id}/pay`, {
        ...formData,
        created_by: currentUser.id
      });

      onPaymentComplete({
        ...formData,
        new_balance: response.data.new_balance,
        payment_status: response.data.payment_status
      });

    } catch (error) {
      console.error('Error processing payment:', error);
      showPopup('error', error.response?.data?.error || 'Failed to process payment');
    } finally {
      setSubmitting(false);
    }
  };

  const setMaxAmount = () => {
    setFormData(prev => ({
      ...prev,
      amount: purchase.balance_amount
    }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    return dayjs(date).format('DD MMM YYYY');
  };

  const formatDateTime = (date) => {
    return dayjs(date).format('DD MMM YYYY, h:mm A');
  };

  const getPaymentMethodIcon = (method) => {
    const lower = (method || '').toLowerCase();
    if (lower === 'cash') return faMoneyBillWave;
    if (lower === 'bank' || lower.includes('transfer')) return faUniversity;
    if (lower === 'cheque' || lower.includes('check')) return faCreditCard;
    return faCreditCard;
  };

  return createPortal((
    // Backdrop is inert: an outside click must not discard what was typed.
    <div className="payment-modal-overlay">
      <div ref={dialogRef} className="payment-modal" role="dialog" aria-modal="true" aria-label="Make Payment">
        
        <div className="payment-modal-header">
          <h3>
            <FontAwesomeIcon icon={faCreditCard} />
            Make Payment
          </h3>
          <button className="close-button" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="payment-modal-body">
          
          {/* Bill Summary */}
          <div className="bill-summary">
            <div className="summary-row">
              <span className="label">Invoice:</span>
              <span className="value invoice">{purchase.invoice_no}</span>
            </div>
            <div className="summary-row">
              <span className="label">Supplier:</span>
              <span className="value">{purchase.supplier_name}</span>
            </div>
            <div className="summary-row">
              <span className="label">Date:</span>
              <span className="value">{formatDate(purchase.purchase_date)}</span>
            </div>
            <div className="summary-row total">
              <span className="label">Total Bill:</span>
              <span className="value">{formatCurrency(purchase.total_with_vat)}</span>
            </div>
            <div className="summary-row paid">
              <span className="label">Paid Amount:</span>
              <span className="value">{formatCurrency(purchase.paid_amount)}</span>
            </div>
            <div className="summary-row balance">
              <span className="label">Balance Due:</span>
              <span className="value due">{formatCurrency(purchase.balance_amount)}</span>
            </div>
          </div>

          {/* Payment Form */}
          <form onSubmit={handleSubmit} className="payment-form">
            <h4>Payment Details</h4>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} />
                Payment Date *
              </label>
              <input
                type="date"
                name="payment_date"
                value={formData.payment_date}
                onChange={handleChange}
                max={dayjs().format('YYYY-MM-DD')}
                required
              />
            </div>

            <div className="form-group">
              <label>Payment Method *</label>
              <select
                name="payment_method"
                value={formData.payment_method}
                onChange={handleChange}
                required
                disabled={loadingMethods}
              >
                {loadingMethods ? (
                  <option value="">Loading…</option>
                ) : (
                  paymentMethods.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))
                )}
              </select>
            </div>

            {formData.payment_method === 'Cheque' && (
              <div className="form-group">
                <label>Cheque Number *</label>
                <input
                  type="text"
                  name="check_number"
                  value={formData.check_number}
                  onChange={handleChange}
                  placeholder="Enter cheque number"
                  required
                />
                <div style={{ padding: '8px 12px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '12px', marginTop: '6px', borderLeft: '4px solid #f59e0b' }}>
                  ℹ️ <strong>Cheque Payment:</strong> Remains <strong>Pending / Unreleased</strong>. The Bank Ledger will NOT be deducted until the cheque is released.
                </div>
              </div>
            )}

            <div className="form-group amount-group">
              <label>Amount *</label>
              <div className="amount-input-wrapper">
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  min="0.0001"
                  max={purchase.balance_amount}
                  step="0.0001"
                  required
                  className="amount-input"
                />
                <button 
                  type="button" 
                  className="max-button"
                  onClick={setMaxAmount}
                >
                  Max
                </button>
              </div>
              <small>Maximum: {formatCurrency(purchase.balance_amount)}</small>
            </div>

            <div className="form-group">
              <label>Notes (Optional)</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="2"
                placeholder="Add any notes about this payment..."
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Processing...' : 'Process Payment'}
              </button>
            </div>
          </form>

          {/* Payment History Toggle */}
          {paymentHistory.length > 0 && (
            <div className="payment-history-section">
              <button 
                className="history-toggle"
                onClick={() => setShowHistory(!showHistory)}
              >
                <FontAwesomeIcon icon={faHistory} />
                {showHistory ? 'Hide' : 'Show'} Payment History ({paymentHistory.length})
              </button>

              {showHistory && (
                <div className="payment-history">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Recorded By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map(payment => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.payment_date)}</td>
                          <td>
                            <span className={`method-badge ${payment.payment_method.toLowerCase()}`}>
                              <FontAwesomeIcon icon={getPaymentMethodIcon(payment.payment_method)} />
                              {payment.payment_method.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="amount">{formatCurrency(payment.amount)}</td>
                          <td>{payment.check_number || '-'}</td>
                          <td>
                            <span className="user-badge" title={formatDateTime(payment.created_at)}>
                              {payment.created_by_name}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  ), document.getElementById('modal-root') || document.body);
};

export default PaymentModal;