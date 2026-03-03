// src/components/purchase/PurchaseDetails.jsx
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
  faHistory
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
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [purchaseRes, previousPricesRes] = await Promise.all([
          api.get(`/purchases/${id}`),
          api.get('/purchases/previous-prices')
        ]);
        
        setPurchase(purchaseRes.data);
        setPreviousPrices(previousPricesRes.data);
      } catch (err) {
        setError(err.message || 'Failed to fetch purchase details');
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

  const handlePrint = () => {
    window.print();
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

  const dueAmount = (purchase.total_with_vat || purchase.bill_amount) - purchase.paid_amount;

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
          <button className="btn-outline">
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

      <div className="details-grid">
        <div className="detail-card">
          <div className="card-header">
            <FontAwesomeIcon icon={faBuilding} />
            <h3>Company Information</h3>
          </div>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Company:</span>
              <span className="value highlight">{purchase.company_name}</span>
            </div>
            <div className="info-row">
              <span className="label">Supplier:</span>
              <span className="value">{purchase.supplier_name}</span>
            </div>
            {purchase.vat_number && (
              <div className="info-row">
                <span className="label">VAT Number:</span>
                <span className="value vat-badge">{purchase.vat_number}</span>
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
              <span className="value">{purchase.contact_name || 'N/A'}</span>
            </div>
            {purchase.contact_phone && (
              <div className="info-row">
                <span className="label">
                  <FontAwesomeIcon icon={faPhone} className="icon-small" />
                </span>
                <span className="value">{purchase.contact_phone}</span>
              </div>
            )}
            {purchase.contact_email && (
              <div className="info-row">
                <span className="label">
                  <FontAwesomeIcon icon={faEnvelope} className="icon-small" />
                </span>
                <span className="value">{purchase.contact_email}</span>
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
              <span className="label">Date:</span>
              <span className="value">{formatDate(purchase.purchase_date)}</span>
            </div>
            <div className="info-row">
              <span className="label">Invoice No:</span>
              <span className="value invoice-number">{purchase.check_number || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Payment Method:</span>
              <span className={`payment-badge ${purchase.payment_method?.toLowerCase()}`}>
                {purchase.payment_method?.replace('_', ' ') || 'N/A'}
              </span>
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
              <span>Subtotal:</span>
              <span>{formatCurrency(purchase.subtotal || purchase.bill_amount)}</span>
            </div>
            <div className="summary-row vat">
              <span>VAT (18%):</span>
              <span>{formatCurrency(purchase.vat_amount || 0)}</span>
            </div>
            <div className="summary-row total">
              <span>Total (with VAT):</span>
              <span>{formatCurrency(purchase.total_with_vat || purchase.bill_amount)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row">
              <span>Paid Amount:</span>
              <span className="paid">{formatCurrency(purchase.paid_amount)}</span>
            </div>
            <div className={`summary-row due ${dueAmount > 0 ? 'negative' : 'positive'}`}>
              <span>Balance Due:</span>
              <span>{formatCurrency(dueAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="items-card">
        <h2>Purchased Items</h2>

        <div className="items-list">
          {purchase.items.map((item, index) => {
            const previousPrice = previousPrices[item.item_id] || 0;
            const isPriceDifferent = previousPrice > 0 && item.unit_price !== previousPrice;

            return (
              <div key={index} className="item-card" style={{ marginBottom: "20px", padding: "15px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc" }}>
                
                {/* Item Name */}
                <div style={{ fontWeight: "600", fontSize: "16px", marginBottom: "8px" }}>
                  {item.item_name} {item.item_code && <span style={{ fontWeight: "400", color: "#64748b" }}>({item.item_code})</span>}
                </div>

                {/* Bullet points for details */}
                <ul style={{ paddingLeft: "20px", margin: 0, listStyleType: "disc" }}>
                  <li>
                    Previous Price: {previousPrice > 0 ? (
                      <span style={{ color: isPriceDifferent ? "red" : "black" }}>
                        {formatCurrency(previousPrice)}
                      </span>
                    ) : "No history"}
                  </li>
                  <li>
                    Quantity: {Number(item.quantity).toFixed(3)} {item.unit || "-"}
                  </li>
                  <li>
                    Unit Price: <span style={{ color: isPriceDifferent ? "green" : "black" }}>
                      {formatCurrency(item.unit_price)}
                    </span>
                    {isPriceDifferent && (
                      <span style={{ marginLeft: "6px", color: "#16a34a", fontSize: "12px" }}>Changed</span>
                    )}
                  </li>
                  <li>
                    Total: <strong>{formatCurrency(item.quantity * item.unit_price)}</strong>
                  </li>
                </ul>
              </div>
            );
          })}
        </div>

        {/* Totals Section */}
        <div style={{ marginTop: "20px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
          <p><strong>Subtotal:</strong> {formatCurrency(purchase.subtotal || purchase.bill_amount)}</p>
          <p><strong>VAT (18%):</strong> {formatCurrency(purchase.vat_amount || 0)}</p>
          <p style={{ fontWeight: "700", fontSize: "16px" }}>
            Total: {formatCurrency(purchase.total_with_vat || purchase.bill_amount)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetails;