// src/components/purchase/PurchaseDetails.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faEdit, 
  faPrint, 
  faDownload,
  faBuilding,
  faUser,
  faCalendar,
  faFileInvoice,
  faMoneyBill,
  faPercent
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import './Purchase.css';
import api from '../../api';

const PurchaseDetails = () => {
  const { id } = useParams();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/purchases/${id}`);
        const data = response.data;
        
        // Process and normalize data
        const processedData = {
          ...data,
          bill_amount: Number(data.bill_amount),
          paid_amount: Number(data.paid_amount),
          subtotal: Number(data.subtotal || data.bill_amount / (1 + (data.vat_rate || 18)/100) || 0),
          vat_amount: Number(data.vat_amount || 0),
          vat_rate: Number(data.vat_rate || 18),
          total_with_vat: Number(data.total_with_vat || data.bill_amount || 0),
          items: data.items.map(item => ({
            ...item,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            total: Number(item.quantity) * Number(item.unit_price)
          }))
        };

        setPurchase(processedData);
        setError('');
      } catch (err) {
        console.error('Error fetching purchase:', err);
        setError(err.response?.data?.error || 'Failed to fetch purchase details');
      } finally {
        setLoading(false);
      }
    };

    fetchPurchase();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a text version of the purchase details
    const content = `
PURCHASE DETAILS
================
Invoice No: ${purchase.invoice_no}
Date: ${dayjs(purchase.purchase_date).format('YYYY-MM-DD')}
Supplier: ${purchase.supplier_name}
Supplier VAT: ${purchase.supplier_vat_number || 'N/A'}
Company: ${purchase.company_name}

ITEMS
-----
${purchase.items.map(item => 
  `${item.item_name} - ${item.quantity} ${item.unit || ''} x Rs. ${item.unit_price.toFixed(2)} = Rs. ${(item.quantity * item.unit_price).toFixed(2)}`
).join('\n')}

FINANCIAL SUMMARY
-----------------
Subtotal: Rs. ${purchase.subtotal.toFixed(2)}
VAT (${purchase.vat_rate}%): Rs. ${purchase.vat_amount.toFixed(2)}
Total with VAT: Rs. ${purchase.total_with_vat.toFixed(2)}
Paid Amount: Rs. ${purchase.paid_amount.toFixed(2)}
Balance: Rs. ${(purchase.total_with_vat - purchase.paid_amount).toFixed(2)}

Payment Method: ${purchase.payment_method}
Invoice/Check No: ${purchase.check_number || 'N/A'}
Remarks: ${purchase.remarks || 'N/A'}

Generated on: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase_${purchase.invoice_no}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="details-loading">
        <div className="loading-spinner"></div>
        <p>Loading purchase details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="details-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => navigate('/purchase/history')} className="btn-primary">
          Back to History
        </button>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="details-not-found">
        <h3>Purchase Not Found</h3>
        <p>The requested purchase could not be found.</p>
        <button onClick={() => navigate('/purchase/history')} className="btn-primary">
          Back to History
        </button>
      </div>
    );
  }

  const dueAmount = purchase.total_with_vat - purchase.paid_amount;

  return (
    <div className="purchase-details-container">
      {/* Header with Actions */}
      <div className="details-header">
        <div className="header-left">
          <button onClick={() => navigate('/purchase/history')} className="btn-icon" title="Back to History">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1>Purchase Details</h1>
        </div>
        <div className="header-actions">
          <button onClick={handlePrint} className="btn-outline" title="Print">
            <FontAwesomeIcon icon={faPrint} /> Print
          </button>
          <button onClick={handleDownload} className="btn-outline" title="Download">
            <FontAwesomeIcon icon={faDownload} /> Download
          </button>
          <button 
            onClick={() => navigate(`/purchase/edit/${id}`)} 
            className="btn-primary"
            title="Edit Purchase"
          >
            <FontAwesomeIcon icon={faEdit} /> Edit
          </button>
        </div>
      </div>

      {/* Invoice Header */}
      <div className="invoice-header">
        <div className="invoice-title">
          <h2>INVOICE</h2>
          <p className="invoice-no">{purchase.invoice_no}</p>
        </div>
        <div className="invoice-status">
          <span className={`status-badge ${dueAmount > 0 ? 'pending' : 'paid'}`}>
            {dueAmount > 0 ? 'Payment Pending' : 'Paid'}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="info-cards">
        <div className="info-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faBuilding} />
          </div>
          <div className="card-content">
            <h4>Supplier Information</h4>
            <p className="supplier-name">{purchase.supplier_name}</p>
            {purchase.supplier_vat_number && (
              <p className="supplier-vat">VAT: {purchase.supplier_vat_number}</p>
            )}
            <p className="contact-info">
              {purchase.contact_name} | {purchase.contact_phone}
            </p>
          </div>
        </div>

        <div className="info-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faCalendar} />
          </div>
          <div className="card-content">
            <h4>Date & Company</h4>
            <p><strong>Date:</strong> {dayjs(purchase.purchase_date).format('YYYY-MM-DD')}</p>
            <p><strong>Company:</strong> {purchase.company_name}</p>
          </div>
        </div>

        <div className="info-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faFileInvoice} />
          </div>
          <div className="card-content">
            <h4>Payment Details</h4>
            <p><strong>Method:</strong> {purchase.payment_method}</p>
            <p><strong>Invoice/Check No:</strong> {purchase.check_number || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="items-section">
        <h3>Purchased Items</h3>
        <div className="items-table-wrapper">
          <table className="items-details-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Unit Price (Rs.)</th>
                <th>Total (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="item-name">{item.item_name}</td>
                  <td className="item-quantity">{Number(item.quantity).toFixed(3)}</td>
                  <td className="item-unit">{item.unit || '-'}</td>
                  <td className="item-price">Rs. {Number(item.unit_price).toFixed(2)}</td>
                  <td className="item-total">Rs. {(item.quantity * item.unit_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="financial-summary">
        <div className="summary-left">
          {purchase.remarks && (
            <div className="remarks-box">
              <h4>Remarks:</h4>
              <p>{purchase.remarks}</p>
            </div>
          )}
        </div>
        <div className="summary-right">
          <div className="summary-card detailed">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>Rs. {purchase.subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row vat-row">
              <span>
                <FontAwesomeIcon icon={faPercent} className="vat-icon" />
                VAT ({purchase.vat_rate}%):
              </span>
              <span>Rs. {purchase.vat_amount.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Total with VAT:</span>
              <span>Rs. {purchase.total_with_vat.toFixed(2)}</span>
            </div>
            <div className="summary-divider"></div>
            <div className="summary-row paid">
              <span>Paid Amount:</span>
              <span>Rs. {purchase.paid_amount.toFixed(2)}</span>
            </div>
            <div className={`summary-row balance ${dueAmount > 0 ? 'due' : 'zero'}`}>
              <span>Balance / Due:</span>
              <span>Rs. {dueAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="details-footer">
        <p className="prepared-by">
          Prepared by: {purchase.prepared_by_name || 'System'} on {dayjs(purchase.created_at).format('YYYY-MM-DD HH:mm')}
        </p>
        <p className="footer-note">This is a system generated document</p>
      </div>
    </div>
  );
};

export default PurchaseDetails;