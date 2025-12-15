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
    
    const config = statusConfig[status] || { class: 'status-default', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getPaymentMethodBadge = (method) => {
    const methodConfig = {
      'CASH': { class: 'method-cash', label: 'Cash' },
      'BANK_TRANSFER': { class: 'method-bank', label: 'Bank Transfer' },
      'CREDIT': { class: 'method-credit', label: 'Credit' }
    };
    
    const config = methodConfig[method] || { class: 'method-default', label: method };
    return <span className={`method-badge ${config.class}`}>{config.label}</span>;
  };

  return (
    <div className="overlay">
      <div className="container">
        {/* Header */}
        <div className="header">
          <h3>Purchase Details</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Main Content */}
        <div className="content">
          {/* Purchase Info */}
          <section className="section">
            <h4>Purchase Information</h4>
            <div className="grid">
              <div>
                <label>Purchase ID</label>
                <span className="highlight">{purchase.purchase_id}</span>
              </div>
              <div>
                <label>Purchase Date</label>
                <span>{new Date(purchase.purchase_date).toLocaleDateString()}</span>
              </div>
              <div>
                <label>Invoice Number</label>
                <span>{purchase.invoice_number}</span>
              </div>
              <div>
                <label>Total Amount</label>
                <span className="amount">{formatCurrency(purchase.total_amount)}</span>
              </div>
            </div>
          </section>

          {/* Supplier Info */}
          <section className="section">
            <h4>Supplier Information</h4>
            <div className="grid">
              <div>
                <label>Supplier Name</label>
                <span>{purchase.supplier_name}</span>
              </div>
              <div>
                <label>Contact Person</label>
                <span>{purchase.contact_person || 'N/A'}</span>
              </div>
              <div>
                <label>Phone</label>
                <span>{purchase.supplier_phone || 'N/A'}</span>
              </div>
            </div>
          </section>

          {/* Payment Info */}
          <section className="section">
            <h4>Payment Information</h4>
            <div className="grid">
              <div>
                <label>Payment Method</label>
                {getPaymentMethodBadge(purchase.payment_method)}
              </div>
              <div>
                <label>Payment Status</label>
                {getStatusBadge(purchase.payment_status)}
              </div>
            </div>
          </section>

          {/* Purchase Items */}
          <section className="section">
            <h4>Purchase Items ({purchase.items?.length || 0})</h4>
            {purchase.items && purchase.items.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Asset</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="asset">
                            <div>{item.asset_name || 'Unknown Asset'}</div>
                            <small>{item.asset_code || 'N/A'}</small>
                          </div>
                        </td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unit_price)}</td>
                        <td>{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" className="total-label">Grand Total</td>
                      <td>{formatCurrency(purchase.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="no-items">No items found.</p>
            )}
          </section>

          {/* Notes */}
          {purchase.notes && (
            <section className="section">
              <h4>Notes</h4>
              <p className="notes">{purchase.notes}</p>
            </section>
          )}

          {/* System Info */}
          <section className="section">
            <h4>System Information</h4>
            <div className="grid">
              <div>
                <label>Created By</label>
                <span>{purchase.created_by_name || 'System'}</span>
              </div>
              <div>
                <label>Created Date</label>
                <span>{new Date(purchase.created_at).toLocaleString()}</span>
              </div>
              <div>
                <label>Last Updated</label>
                <span>{new Date(purchase.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="actions">
          <button className="btn-edit" onClick={onEdit}>Edit Purchase</button>
        </div>
      </div>
    </div>
  );
};

export default ViewPurchase;
