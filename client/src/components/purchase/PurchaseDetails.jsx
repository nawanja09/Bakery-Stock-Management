import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faEdit, 
  faPrint, 
  faFilePdf,
  faBuilding,
  faUser,
  faCalendar,
  faFileInvoice,
  faCreditCard,
  faTag,
  faPhone,
  faEnvelope,
  faMapMarkerAlt,
  faCity,
  faCheckCircle,
  faTimesCircle
} from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';
import api from '../../api';
import dayjs from 'dayjs';

const PurchaseDetails = () => {
  const { id } = useParams();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previousPrices, setPreviousPrices] = useState({});
  const [supplierDetails, setSupplierDetails] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch purchase details, previous prices, and supplier details
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

    fetchData();
  }, [id]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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
    // You can implement PDF generation here
    alert('PDF generation feature coming soon!');
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
        <button onClick={() => navigate('/purchase/history')} className="btn-primary">
          Back to History
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
        <button onClick={() => navigate('/purchase/history')} className="btn-primary">
          Back to History
        </button>
      </div>
    );
  }

  const subtotal = parseFloat(purchase.subtotal || purchase.bill_amount || 0);
  const vatAmount = parseFloat(purchase.vat_amount || 0);
  const totalWithVat = parseFloat(purchase.total_with_vat || purchase.bill_amount || 0);
  const paidAmount = parseFloat(purchase.paid_amount || 0);
  const dueAmount = Math.max(0, totalWithVat - paidAmount);
  const vatRate = parseFloat(purchase.vat_rate || 18);

  return (
    <div className="purchase-details-container">
      <div className="page-header">
        <div className="header-title">
          <button onClick={() => navigate('/purchase/history')} className="back-button">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <div>
            <h1>Purchase Details</h1>
            <p className="subtitle">Invoice #{purchase.invoice_no}</p>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={handlePrint} className="btn-outline">
            <FontAwesomeIcon icon={faPrint} />
            Print
          </button>
          <button onClick={handlePDF} className="btn-outline">
            <FontAwesomeIcon icon={faFilePdf} />
            PDF
          </button>
          <button 
            onClick={() => navigate(`/purchase/edit/${purchase.id}`)} 
            className="btn-primary"
          >
            <FontAwesomeIcon icon={faEdit} />
            Edit
          </button>
        </div>
      </div>

      {/* Supplier Information Card */}
      <div className="details-grid">
        <div className="detail-card">
          <div className="card-header">
            <FontAwesomeIcon icon={faBuilding} />
            <h3>Supplier Information</h3>
          </div>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Supplier Name:</span>
              <span className="value highlight">{purchase.supplier_name}</span>
            </div>
            
            {supplierDetails && (
              <>
                <div className="info-row">
                  <span className="label">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="icon-small" />
                  </span>
                  <span className="value">{supplierDetails.address || 'N/A'}</span>
                </div>
                <div className="info-row">
                  <span className="label">
                    <FontAwesomeIcon icon={faCity} className="icon-small" />
                  </span>
                  <span className="value">{supplierDetails.city || 'N/A'}</span>
                </div>
              </>
            )}

            <div className="info-row vat-status">
              <span className="label">VAT Registered:</span>
              <span className={`value vat-badge ${supplierDetails?.vat_registered ? 'yes' : 'no'}`}>
                {supplierDetails?.vat_registered ? 'Yes' : 'No'}
              </span>
            </div>

            {supplierDetails?.vat_registered && supplierDetails?.vat_number && (
              <div className="info-row">
                <span className="label">VAT Number:</span>
                <span className="value vat-number">{supplierDetails.vat_number}</span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-card">
          <div className="card-header">
            <FontAwesomeIcon icon={faUser} />
            <h3>Contact Information</h3>
          </div>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Contact Person:</span>
              <span className="value">{supplierDetails?.contact_name || purchase.contact_name || 'N/A'}</span>
            </div>
            {supplierDetails?.contact_phone && (
              <div className="info-row">
                <span className="label">
                  <FontAwesomeIcon icon={faPhone} className="icon-small" />
                </span>
                <span className="value">{supplierDetails.contact_phone}</span>
              </div>
            )}
            {supplierDetails?.contact_email && (
              <div className="info-row">
                <span className="label">
                  <FontAwesomeIcon icon={faEnvelope} className="icon-small" />
                </span>
                <span className="value">{supplierDetails.contact_email}</span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-card">
          <div className="card-header">
            <FontAwesomeIcon icon={faCalendar} />
            <h3>Purchase Details</h3>
          </div>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Purchase Date:</span>
              <span className="value">{formatDate(purchase.purchase_date)}</span>
            </div>
            <div className="info-row">
              <span className="label">Invoice No:</span>
              <span className="value invoice-number">{purchase.check_number || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Company:</span>
              <span className="value">{purchase.company_name || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Payment Method:</span>
              <span className={`payment-badge ${purchase.payment_method?.toLowerCase()}`}>
                {purchase.payment_method?.replace('_', ' ') || 'N/A'}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Prepared By:</span>
              <span className="value">{purchase.prepared_by_name || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Created At:</span>
              <span className="value">{formatDateTime(purchase.created_at)}</span>
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
            <div className="summary-row vat">
              <span>VAT ({vatRate}%):</span>
              <span>{formatCurrency(vatAmount)}</span>
            </div>
            <div className="summary-row total">
              <span>Grand Total (with VAT):</span>
              <span className="bold">{formatCurrency(totalWithVat)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row">
              <span>Paid Amount:</span>
              <span className="paid">{formatCurrency(paidAmount)}</span>
            </div>
            <div className={`summary-row due ${dueAmount > 0 ? 'negative' : 'positive'}`}>
              <span>Balance Due:</span>
              <span className={dueAmount > 0 ? 'due-amount' : ''}>
                {formatCurrency(dueAmount)}
              </span>
            </div>
            {dueAmount === 0 && (
              <div className="payment-status paid-fully">
                <FontAwesomeIcon icon={faCheckCircle} /> Fully Paid
              </div>
            )}
            {dueAmount > 0 && (
              <div className="payment-status partially-paid">
                <FontAwesomeIcon icon={faTimesCircle} /> Partially Paid
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items Card */}
      <div className="items-card">
        <div className="card-header">
          <h3>
            <FontAwesomeIcon icon={faTag} />
            Purchased Items
          </h3>
          {supplierDetails?.vat_registered && (
            <div className="vat-note">
              <span className="badge">VAT Registered Supplier</span>
            </div>
          )}
        </div>

        <div className="table-responsive">
          <table className="items-details-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>Item Code</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Unit Price (Net)</th>
                <th>Amount</th>
                {supplierDetails?.vat_registered && (
                  <th className="vat-column">VAT 18%</th>
                )}
                <th className="total-column">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items && purchase.items.map((item, index) => {
                const previousPrice = previousPrices[item.item_id] || 0;
                const amount = parseFloat(item.quantity) * parseFloat(item.unit_price);
                const vat = (supplierDetails?.vat_registered && item.vat_applicable) ? 
                  amount * (vatRate / 100) : 0;
                const lineTotal = amount + vat;
                const isPriceDifferent = previousPrice > 0 && 
                  parseFloat(item.unit_price) !== previousPrice;

                return (
                  <tr key={index} className={item.vat_applicable ? 'vat-applicable-row' : ''}>
                    <td>{index + 1}</td>
                    <td>
                      <div className="item-name">{item.item_name}</div>
                      {item.vat_applicable && (
                        <small className="vat-applicable-badge">VAT Applicable</small>
                      )}
                    </td>
                    <td>{item.item_code || '-'}</td>
                    <td className="text-right">{Number(item.quantity).toFixed(3)}</td>
                    <td>{item.unit || '-'}</td>
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
                    {supplierDetails?.vat_registered && (
                      <td className="vat-column text-right">
                        {item.vat_applicable ? formatCurrency(vat) : '-'}
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
                <td colSpan="6" className="text-right"><strong>Subtotal:</strong></td>
                <td className="text-right"><strong>{formatCurrency(subtotal)}</strong></td>
                {supplierDetails?.vat_registered && (
                  <td className="vat-column text-right">
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

        {/* Items Summary */}
        <div className="items-summary">
          <div className="summary-stats">
            <div className="stat">
              <span className="stat-label">Total Items:</span>
              <span className="stat-value">{purchase.items?.length || 0}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Total Quantity:</span>
              <span className="stat-value">
                {purchase.items?.reduce((sum, item) => sum + parseFloat(item.quantity), 0).toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      </div>

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
      <div className="details-actions">
        <button onClick={() => navigate('/purchase/history')} className="btn-secondary">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to History
        </button>
      </div>
    </div>
  );
};

export default PurchaseDetails;