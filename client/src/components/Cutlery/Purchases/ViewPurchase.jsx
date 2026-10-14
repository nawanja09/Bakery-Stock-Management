import React from 'react';
import { Modal, StatusBadge } from '../../common/ui';
import './ViewPurchase.css';

const PAYMENT_STATUS = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  PARTIAL: { label: 'Partial', tone: 'warning' },
};

const PAYMENT_METHOD = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CREDIT: 'Credit',
};

const Detail = ({ label, children, amount = false }) => (
  <div className="ui-detail-item">
    <span className="ui-detail-label">{label}</span>
    <span className={`ui-detail-value ${amount ? 'is-amount' : ''}`.trim()}>{children}</span>
  </div>
);

const ViewPurchase = ({ purchase, onClose, onEdit }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const status = PAYMENT_STATUS[purchase.payment_status] || { label: purchase.payment_status, tone: 'neutral' };

  return (
    <Modal
      title="Purchase Details"
      subtitle={purchase.purchase_id}
      size="lg"
      onClose={onClose}
      closeOnOverlay
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>Edit Purchase</button>
        </>
      )}
    >
      <div className="ui-details">
        <section className="ui-detail-section">
          <h4>Purchase Information</h4>
          <div className="ui-detail-grid">
            <Detail label="Purchase ID">{purchase.purchase_id}</Detail>
            <Detail label="Purchase Date">{new Date(purchase.purchase_date).toLocaleDateString()}</Detail>
            <Detail label="Invoice Number">{purchase.invoice_number}</Detail>
            <Detail label="Total Amount" amount>{formatCurrency(purchase.total_amount)}</Detail>
          </div>
        </section>

        <section className="ui-detail-section">
          <h4>Supplier Information</h4>
          <div className="ui-detail-grid">
            <Detail label="Supplier Name">{purchase.supplier_name}</Detail>
            <Detail label="Contact Person">{purchase.contact_person || 'N/A'}</Detail>
            <Detail label="Phone">{purchase.supplier_phone || 'N/A'}</Detail>
          </div>
        </section>

        <section className="ui-detail-section">
          <h4>Payment Information</h4>
          <div className="ui-detail-grid">
            <Detail label="Payment Method">
              <StatusBadge tone="primary">{PAYMENT_METHOD[purchase.payment_method] || purchase.payment_method}</StatusBadge>
            </Detail>
            <Detail label="Payment Status">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </Detail>
          </div>
        </section>

        <section className="ui-detail-section">
          <h4>Purchase Items ({purchase.items?.length || 0})</h4>
          {purchase.items && purchase.items.length > 0 ? (
            <div className="ui-table-card">
              <div className="ui-table-scroll">
                <table className="erp-data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Asset</th>
                      <th className="num">Qty</th>
                      <th className="num">Unit Price</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item, index) => (
                      <tr key={item.id || index}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{item.asset_name || 'Unknown Asset'}</strong>
                          <small className="ui-muted-sub">{item.asset_code || 'N/A'}</small>
                        </td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{formatCurrency(item.unit_price)}</td>
                        <td className="num">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4">Grand Total</td>
                      <td className="num">{formatCurrency(purchase.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <p>No items found.</p>
          )}
        </section>

        {purchase.notes && (
          <section className="ui-detail-section">
            <h4>Notes</h4>
            <p className="ui-detail-note">{purchase.notes}</p>
          </section>
        )}

        <section className="ui-detail-section">
          <h4>System Information</h4>
          <div className="ui-detail-grid">
            <Detail label="Created By">{purchase.created_by_name || 'System'}</Detail>
            <Detail label="Created Date">{new Date(purchase.created_at).toLocaleString()}</Detail>
            <Detail label="Last Updated">{new Date(purchase.updated_at).toLocaleString()}</Detail>
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default ViewPurchase;
