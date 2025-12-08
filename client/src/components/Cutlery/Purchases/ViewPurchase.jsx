import React from 'react';
import './ViewPurchase.css';

const ViewPurchase = ({ purchase, onClose, onEdit }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'PENDING': { class: 'status-pending', label: 'Pending' },
      'PAID': { class: 'status-paid', label: 'Paid' },
      'PARTIAL': { class: 'status-partial', label: 'Partial' }
    };
    
    const config = statusConfig[status] || { class: 'status-pending', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getPaymentMethodBadge = (method) => {
    const methodConfig = {
      'CASH': { class: 'method-cash', label: 'Cash' },
      'BANK_TRANSFER': { class: 'method-bank', label: 'Bank Transfer' },
      'CREDIT': { class: 'method-credit', label: 'Credit' }
    };
    
    const config = methodConfig[method] || { class: 'method-cash', label: method };
    return <span className={`method-badge ${config.class}`}>{config.label}</span>;
  };

  // Debug: Log purchase data
  console.log('Purchase data in View:', purchase);
  console.log('Purchase items:', purchase?.items);

  return (
    <div className="view-purchase-overlay">
      <div className="view-purchase-container">
        <div className="view-purchase-header">
          <h3>Purchase Details</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="purchase-details">
          <div className="detail-section">
            <h4>Purchase Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Purchase ID:</label>
                <span className="purchase-id">{purchase.purchase_id}</span>
              </div>
              <div className="detail-item">
                <label>Purchase Date:</label>
                <span>{new Date(purchase.purchase_date).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Invoice Number:</label>
                <span className="invoice-number">{purchase.invoice_number}</span>
              </div>
              <div className="detail-item">
                <label>Total Amount:</label>
                <span className="total-amount">
                  {formatCurrency(purchase.total_amount)}
                </span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Supplier Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Supplier Name:</label>
                <span className="supplier-name">{purchase.supplier_name}</span>
              </div>
              <div className="detail-item">
                <label>Contact Person:</label>
                <span>{purchase.contact_person || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Phone:</label>
                <span>{purchase.supplier_phone || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Payment Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Payment Method:</label>
                {getPaymentMethodBadge(purchase.payment_method)}
              </div>
              <div className="detail-item">
                <label>Payment Status:</label>
                {getStatusBadge(purchase.payment_status)}
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Purchase Items ({purchase.items?.length || 0})</h4>
            {purchase.items && purchase.items.length > 0 ? (
              <div className="items-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Asset</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="index">{index + 1}</td>
                        <td>
                          <div className="asset-info">
                            <div className="asset-name">{item.asset_name || 'Unknown Asset'}</div>
                            <div className="asset-code">{item.asset_code || 'N/A'}</div>
                          </div>
                        </td>
                        <td className="quantity">{item.quantity}</td>
                        <td className="unit-price">{formatCurrency(item.unit_price)}</td>
                        <td className="item-total">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" className="total-label">Grand Total:</td>
                      <td className="grand-total">
                        {formatCurrency(purchase.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="no-items">No items found in this purchase</div>
            )}
          </div>

          {purchase.notes && (
            <div className="detail-section">
              <h4>Additional Notes</h4>
              <div className="notes-content">
                {purchase.notes}
              </div>
            </div>
          )}

          <div className="detail-section">
            <h4>System Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created By:</label>
                <span>{purchase.created_by_name || 'System'}</span>
              </div>
              <div className="detail-item">
                <label>Created Date:</label>
                <span>{new Date(purchase.created_at).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{new Date(purchase.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="purchase-actions">
          <button
            type="button"
            className="btn-edit"
            onClick={onEdit}
          >
            Edit Purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewPurchase;