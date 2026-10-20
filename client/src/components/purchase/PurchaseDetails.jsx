// src/components/purchase/PurchaseDetails.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faEdit,
  faPrint,
  faFilePdf,
  faBuilding,
  faUser,
  faCalendar,
  faCreditCard,
  faTag,
  faPhone,
  faEnvelope,
  faMapMarkerAlt,
  faCity,
  faCheckCircle,
  faTimesCircle,
  faMoneyBillWave,
  faHistory,
  faUndo,
  faReceipt
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './Purchase.css';
import { formatQuantity, formatPaymentMethodLabel, PURCHASING_DECIMALS } from '../../utils/formatters';
import { DEFAULT_VAT_RATE } from '../../utils/vatRate';

const PurchaseDetails = ({ purchaseId, isModal = false, onClose }) => {
  const params = useParams();
  const navigate = useNavigate();
  const id = purchaseId || params.id;
  const location = useLocation();

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previousPrices, setPreviousPrices] = useState({});
  const [supplierDetails, setSupplierDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('items'); // 'items', 'payments', 'returns'
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch purchase details with payments and returns
        const [purchaseRes, previousPricesRes] = await Promise.all([
          api.get(`/purchases/${id}`),
          api.get('/purchases/previous-prices')
        ]);

        const purchaseData = purchaseRes.data;
        setPurchase(purchaseData);
        setPreviousPrices(previousPricesRes.data);

        // Fetch supplier details if supplier_id exists
        if (purchaseData.supplier_id) {
          try {
            const supplierRes = await api.get(`/suppliers/${purchaseData.supplier_id}`);
            setSupplierDetails(supplierRes.data);
          } catch (err) {
            console.error('Error fetching supplier details:', err);
          }
        }

      } catch (err) {
        console.error('Error fetching purchase details:', err);
        setError(err.response?.data?.error || 'Failed to fetch purchase details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    return dayjs(date).format('DD MMMM YYYY');
  };

  const formatDateTime = (date) => {
    return dayjs(date).format('DD MMMM YYYY, h:mm A');
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = () => {
    alert('PDF generation feature coming soon!');
  };

  const handleBack = () => {
    if (isModal && onClose) {
      onClose();
    } else {
      navigate('/purchase/history');
    }
  };

  const handleEdit = () => {
    if (isModal && onClose) {
      onClose();
      navigate(`/purchase/edit/${id}`, { state: { backgroundLocation: location } });
    } else {
      navigate(`/purchase/edit/${id}`);
    }
  };

  const getPaymentStatusInfo = () => {
    if (!purchase) return { text: 'Unknown', class: 'unknown', icon: faTimesCircle };

    switch (purchase.payment_status) {
      case 'Paid':
        return { text: 'Fully Paid', class: 'paid', icon: faCheckCircle, color: '#28a745' };
      case 'Partially Paid':
        return { text: 'Partially Paid', class: 'partially-paid', icon: faMoneyBillWave, color: '#fd7e14' };
      default:
        return { text: 'Non-Paid', class: 'non-paid', icon: faTimesCircle, color: '#dc3545' };
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading purchase details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Purchase</h3>
        <p>{error}</p>
        <button onClick={handleBack} className="btn btn-primary">
          {isModal ? 'Close' : 'Back to History'}
        </button>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="not-found-container">
        <div className="not-found-icon">🔍</div>
        <h3>Purchase Not Found</h3>
        <p>The purchase you're looking for doesn't exist or has been deleted.</p>
        <button onClick={handleBack} className="btn btn-primary">
          {isModal ? 'Close' : 'Back to History'}
        </button>
      </div>
    );
  }

  const subtotal = parseFloat(purchase.subtotal || 0);
  const vatAmount = parseFloat(purchase.vat_amount || 0);
  const totalWithVat = parseFloat(purchase.total_with_vat || 0);
  const paidAmount = parseFloat(purchase.paid_amount || 0);
  const dueAmount = Math.max(0, totalWithVat - paidAmount);
  const vatRate = parseFloat(purchase.vat_rate || DEFAULT_VAT_RATE);
  const statusInfo = getPaymentStatusInfo();

  // supplierDetails.vat_registered comes back from the API as a raw integer (0/1),
  // not a real boolean. Using it directly as the left side of `condition && <jsx>`
  // is a classic React pitfall: `0 && <jsx>` evaluates to the number 0, and React
  // renders that as literal "0" text (unlike false/null/undefined, which render
  // nothing). Normalizing to a real boolean once here prevents that everywhere.
  const isVatRegisteredSupplier = Boolean(supplierDetails?.vat_registered);

  // Calculate total returns
  const totalReturns = (purchase.returns || []).reduce((sum, r) => sum + parseFloat(r.return_total || r.total_amount || 0), 0);
  const netPaidAfterReturns = paidAmount;
  const netBalanceAfterReturns = dueAmount;

  return (
    <div className={`purchase-details-container erp-purchase-details ${isModal ? 'modal-view' : ''}`}>
      <div className="page-header">
        <div className="header-title">
          <button onClick={handleBack} className="back-button">
            <FontAwesomeIcon icon={isModal ? faTimesCircle : faArrowLeft} />
          </button>
          <h1>RM Purchase Invoice Details</h1>
        </div>
      </div>

      {/* Payment Status Banner */}
      <div className={`payment-status-banner ${statusInfo.class}`}>
        <FontAwesomeIcon icon={statusInfo.icon} />
        <span className="status-text">{statusInfo.text}</span>
        <span className="status-amount">
          {dueAmount === 0 ? '✓ Fully Settled' : `Balance: ${formatCurrency(dueAmount)}`}
        </span>
      </div>

      <div className="details-grid">
        <div className="detail-card">
          <div className="card-content">
            <div className="info-row">
              <span className="label">Supplier Name:</span>
              <span className="value">{purchase.supplier_name}</span>
            </div>

            {isVatRegisteredSupplier && supplierDetails?.vat_number && (
              <div className="info-row">
                <span className="label">VAT Number:</span>
                <span className="value vat-number">{supplierDetails.vat_number}</span>
              </div>
            )}
            {supplierDetails?.contact_phone && (
              <div className="info-row">
                <span className="label">
                  <FontAwesomeIcon icon={faPhone} className="icon-small" />
                </span>
                <span className="value">{supplierDetails.contact_phone}</span>
              </div>
            )}
            <div className="info-row">
              <span className="label">Delivery Date:</span>
              <span className="value">{formatDate(purchase.purchase_date)}</span>
            </div>
            <div className="info-row">
              <span className="label">Invoice Date:</span>
              <span className="value">{formatDate(purchase.invoice_date)}</span>
            </div>
            {purchase.invoice_due_date && (
              <div className="info-row">
                <span className="label">Invoice Due Date:</span>
                <span className="value">{formatDate(purchase.invoice_due_date)}</span>
              </div>
            )}
            <div className="info-row">
              <span className="label">Invoice No:</span>
              <span className="value invoice-number">{purchase.invoice_no}</span>
            </div>
            <div className="info-row">
              <span className="label">Company:</span>
              <span className="value">{purchase.company_name || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Reference No:</span>
              <span className="value">{purchase.check_number || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="detail-card financial">
          <div className="card-header">
            <FontAwesomeIcon icon={faCreditCard} />
            <h3>Financial Summary</h3>
          </div>
          <div className="financial-summary">
            <div className="summary-row">
              <span>Subtotal (Net Amount):</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {isVatRegisteredSupplier && (
              <div className="summary-row vat">
                <span>VAT ({vatRate}%):</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
            )}
            <div className="summary-row total">
              <span>Grand Total (with VAT):</span>
              <span className="bold">{formatCurrency(totalWithVat)}</span>
            </div>

            {/* Returns Section */}
            {totalReturns > 0 && (
              <>
                <div className="summary-row returns">
                  <span>Total Returns:</span>
                  <span className="returns-amount">-{formatCurrency(totalReturns)}</span>
                </div>
                <div className="summary-row net-after-returns">
                  <span>Net After Returns:</span>
                  <span>{formatCurrency(totalWithVat - totalReturns)}</span>
                </div>
              </>
            )}

            <div className="summary-divider"></div>

            <div className="summary-row">
              <span>Total Paid:</span>
              <span className="paid">{formatCurrency(paidAmount)}</span>
            </div>

            {totalReturns > 0 && (
              <div className="summary-row">
                <span>Returns Adjusted:</span>
                <span className="returns-amount">-{formatCurrency(totalReturns)}</span>
              </div>
            )}

            <div className={`summary-row due ${dueAmount > 0 ? 'negative' : 'positive'}`}>
              <span>Balance Due:</span>
              <span className={dueAmount > 0 ? 'due-amount' : ''}>
                {formatCurrency(netBalanceAfterReturns)}
              </span>
            </div>

            {dueAmount === 0 && (
              <div className="payment-status paid-fully">
                <FontAwesomeIcon icon={faCheckCircle} /> Fully Paid
              </div>
            )}
            {dueAmount > 0 && (
              <div className="payment-status partially-paid">
                <FontAwesomeIcon icon={faMoneyBillWave} /> Balance Remaining: {formatCurrency(dueAmount)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs for Items, Payments, Returns */}
      <div className="tabs-container">
        <button
          className={`tab-button ${activeTab === 'items' ? 'active' : ''}`}
          onClick={() => setActiveTab('items')}
        >
          <FontAwesomeIcon icon={faTag} />
          Items ({purchase.items?.length || 0})
        </button>
        <button
          className={`tab-button ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <FontAwesomeIcon icon={faHistory} />
          Payment History ({purchase.payments?.length || 0})
        </button>
        <button
          className={`tab-button ${activeTab === 'returns' ? 'active' : ''}`}
          onClick={() => setActiveTab('returns')}
        >
          <FontAwesomeIcon icon={faUndo} />
          Returns ({purchase.returns?.length || 0})
        </button>
      </div>

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="items-card">
          <div className="card-header">
            <h3>
              <FontAwesomeIcon icon={faTag} />
              Purchased Items
            </h3>
            {isVatRegisteredSupplier && (
              <div className="vat-note">
                <span className="badge">VAT Registered Supplier</span>
              </div>
            )}
          </div>

          <div className="table-responsive">
            <table className="items-details-table">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Item Name</th>
                  <th className="text-left">Item Code</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-center">Unit</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-right">Amount</th>
                  {isVatRegisteredSupplier && (
                    <th className="text-right vat-column">VAT {vatRate}%</th>
                  )}
                  <th className="text-right total-column">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items && purchase.items.map((item, index) => {
                  const previousPrice = previousPrices[item.item_id] || 0;
                  const amount = parseFloat(item.quantity) * parseFloat(item.unit_price);
                  const isItemVatApplicable = Boolean(item.vat_applicable);
                  const vat = (isVatRegisteredSupplier && isItemVatApplicable) ?
                    amount * (vatRate / 100) : 0;
                  const lineTotal = amount + vat;
                  const isPriceDifferent = previousPrice > 0 &&
                    parseFloat(item.unit_price) !== previousPrice;

                  return (
                    <tr key={index} className={isItemVatApplicable ? 'vat-applicable-row' : ''}>
                      <td className="text-left">{index + 1}</td>
                      <td className="text-left">
                        <div className="item-name">{item.item_name}</div>
                        {isItemVatApplicable && (
                          <small className="vat-applicable-badge">VAT Applicable</small>
                        )}
                      </td>
                      <td className="text-left">{item.item_code || '-'}</td>
                      <td className="text-right">{formatQuantity(item.quantity, PURCHASING_DECIMALS)}</td>
                      <td className="text-center">{item.unit || '-'}</td>
                      <td className="text-right">
                        <span className={isPriceDifferent ? 'price-different' : ''}>
                          {formatCurrency(item.unit_price)}
                        </span>
                        {isPriceDifferent && (
                          <small className="price-history">
                            (Prev: {formatCurrency(previousPrice)})
                          </small>
                        )}
                      </td>
                      <td className="text-right">{formatCurrency(amount)}</td>
                      {isVatRegisteredSupplier && (
                        <td className="text-right vat-column">
                          {isItemVatApplicable ? formatCurrency(vat) : '-'}
                        </td>
                      )}
                      <td className="text-right total-column">
                        <strong>{formatCurrency(lineTotal)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" className="text-right">
                    <strong>Subtotal:</strong>
                  </td>
                  <td className="text-right"><strong>{formatCurrency(subtotal)}</strong></td>
                  {isVatRegisteredSupplier && (
                    <td className="text-right vat-column">
                      <strong>{formatCurrency(vatAmount)}</strong>
                    </td>
                  )}
                  <td className="text-right total-column">
                    <strong>{formatCurrency(totalWithVat)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="items-summary">
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Total Items:</span>
                <span className="stat-value">{purchase.items?.length || 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Total Quantity:</span>
                <span className="stat-value">
                  {formatQuantity(purchase.items?.reduce((sum, item) => sum + parseFloat(item.quantity), 0), PURCHASING_DECIMALS)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {activeTab === 'payments' && (
        <div className="items-card">
          <div className="card-header">
            <h3>
              <FontAwesomeIcon icon={faHistory} />
              Payment History
            </h3>
            <div className="total-payments">
              Total Paid: <strong>{formatCurrency(paidAmount)}</strong>
            </div>
          </div>

          {purchase.payments && purchase.payments.length > 0 ? (
            <div className="table-responsive">
              <table className="payment-history-table">
                <thead>
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Payment Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Paid Amount</th>
                    <th className="text-left">Method</th>
                    <th className="text-left">Reference</th>
                    <th className="text-left">Recorded By</th>
                    <th className="text-left">Recorded At</th>
                    <th className="text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.payments.map((payment, index) => {
                    // Amount is always this invoice's own total (independent, constant value).
                    // Paid Amount is bound ONLY to the amount actually allocated to this invoice
                    // from that specific payment record - it is never combined with, or derived
                    // from, the Invoice Total or the raw payment transaction total.
                    const allocatedPaidAmount = parseFloat(payment.paid_amount ?? 0);
                    return (
                      <tr key={payment.id}>
                        <td className="text-left">{index + 1}</td>
                        <td className="text-left">{formatDate(payment.payment_date)}</td>
                        <td className="text-right">{formatCurrency(totalWithVat)}</td>
                        <td className="text-right paid-amount">{formatCurrency(allocatedPaidAmount)}</td>
                        <td className="text-left">
                          <span className={`payment-method-badge ${String(payment.payment_method || '').toLowerCase()}`}>
                            {formatPaymentMethodLabel(payment.payment_method)}
                          </span>
                        </td>
                        <td className="text-left">{payment.check_number || '-'}</td>
                        <td className="text-left">{payment.created_by_name || '-'}</td>
                        <td className="text-left">{formatDateTime(payment.created_at)}</td>
                        <td className="text-left">{payment.notes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" className="text-right"><strong>Total Paid:</strong></td>
                    <td className="text-right paid-amount"><strong>{formatCurrency(paidAmount)}</strong></td>
                    <td colSpan="5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="empty-state-small">
              <p>No payments recorded yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Returns Tab */}
      {activeTab === 'returns' && (
        <div className="items-card">
          <div className="card-header">
            <h3>
              <FontAwesomeIcon icon={faUndo} />
              Purchase Returns
            </h3>
            <div className="total-returns">
              Total Returns: <strong className="returns-amount">-{formatCurrency(totalReturns)}</strong>
            </div>
          </div>

          {purchase.returns && purchase.returns.length > 0 ? (
            <div className="table-responsive">
              <table className="returns-history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Return #</th>
                    <th>Return Date</th>
                    <th className="text-right">Subtotal</th>
                    {isVatRegisteredSupplier && (
                      <th className="text-right">VAT</th>
                    )}
                    <th className="text-right">Total</th>
                    <th className="text-right">Settled</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.returns.map((returnItem, index) => (
                    <tr key={returnItem.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="return-badge">{returnItem.return_number}</span>
                      </td>
                      <td>{formatDate(returnItem.return_date)}</td>
                      <td className="text-right">{formatCurrency(returnItem.subtotal || 0)}</td>
                      {isVatRegisteredSupplier && (
                        <td className="text-right">{formatCurrency(returnItem.vat_amount || 0)}</td>
                      )}
                      <td className="text-right returns-amount">{formatCurrency(returnItem.return_total || returnItem.total_amount || 0)}</td>
                      <td className="text-right">{formatCurrency(returnItem.settled_amount || 0)}</td>
                      <td className="text-right due-amount">{formatCurrency(returnItem.balance_amount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={isVatRegisteredSupplier ? "5" : "4"} className="text-right"><strong>Total Returns:</strong></td>
                    <td className="text-right returns-amount"><strong>-{formatCurrency(totalReturns)}</strong></td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="empty-state-small">
              <p>No returns recorded for this purchase.</p>
            </div>
          )}
        </div>
      )}

      {/* Remarks Card */}
      {purchase.remarks && (
        <div className="remarks-card">
          <div className="card-header">
            <h3>Remarks</h3>
          </div>
          <div className="remarks-content">
            {purchase.remarks}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!isModal && (
        <div className="details-actions">
          <button onClick={handleBack} className="btn btn-secondary">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to History
          </button>
        </div>
      )}
    </div>
  );
};

export default PurchaseDetails;