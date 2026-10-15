import React from 'react';
import './ViewDamage.css';
import { Modal } from '../../common/ui';

const ViewDamage = ({ damage, onClose, onEdit }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'Reported': { class: 'status-reported', label: 'Reported' },
      'Confirmed': { class: 'status-confirmed', label: 'Confirmed' },
      'Repaired': { class: 'status-repaired', label: 'Repaired' },
      'Written Off': { class: 'status-written-off', label: 'Written Off' }
    };
    const config = statusConfig[status] || { class: 'status-reported', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getReasonBadge = (reason) => {
    const reasonConfig = {
      'Broken': { class: 'reason-broken', label: 'Broken' },
      'Lost': { class: 'reason-lost', label: 'Lost' },
      'Worn Out': { class: 'reason-worn-out', label: 'Worn Out' },
      'Theft': { class: 'reason-theft', label: 'Theft' },
      'Other': { class: 'reason-other', label: 'Other' }
    };
    const config = reasonConfig[reason] || { class: 'reason-other', label: reason };
    return <span className={`reason-badge ${config.class}`}>{config.label}</span>;
  };

  return (
    <Modal
      title="Damage Record Details"
      size="lg"
      onClose={onClose}
      className="cutlery-form-modal"
      closeOnOverlay
    >
      <section className="damage-details">
        {/* Damage Info */}
        <div className="detail-section">
          <h4>Damage Information</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Damage ID</label>
              <span className="damage-id">{damage.damage_id}</span>
            </div>
            <div className="detail-item">
              <label>Date</label>
              <span>{new Date(damage.damage_date).toLocaleDateString()}</span>
            </div>
            <div className="detail-item">
              <label>Location</label>
              <span>{damage.location_name}</span>
            </div>
            <div className="detail-item">
              <label>Total Loss</label>
              <span className="total-loss">{formatCurrency(damage.total_loss || damage.estimated_loss)}</span>
            </div>
          </div>
        </div>

        {/* Damage Details */}
        <div className="detail-section">
          <h4>Damage Details</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Reason</label>
              {getReasonBadge(damage.reason)}
            </div>
            <div className="detail-item">
              <label>Status</label>
              {getStatusBadge(damage.status)}
            </div>
            <div className="detail-item">
              <label>Reported By</label>
              <span>{damage.reported_by}</span>
            </div>
          </div>
        </div>

        {/* Damaged Items */}
        <div className="detail-section">
          <h4>Damaged Items ({damage.items?.length || 0})</h4>
          {damage.items?.length > 0 ? (
            <div className="items-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Asset</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {damage.items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td className="index">{index + 1}</td>
                      <td>
                        <div className="asset-info">
                          <div className="asset-name">{item.asset_name || 'Unknown'}</div>
                          <div className="asset-code">{item.asset_code || 'N/A'}</div>
                        </div>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.unit_price)}</td>
                      <td>{formatCurrency(item.total_loss)}</td>
                      <td className="item-notes">{item.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" className="total-label">Total Loss</td>
                    <td colSpan="2" className="grand-total">{formatCurrency(damage.total_loss || damage.estimated_loss)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="no-items">No items found</div>
          )}
        </div>

        {/* System Info */}
        <div className="detail-section">
          <h4>System Information</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Created</label>
              <span>{new Date(damage.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <label>Last Updated</label>
              <span>{new Date(damage.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="damage-actions">
        <button className="btn-edit" onClick={onEdit}>Edit Record</button>
      </footer>
    </Modal>
  );
};

export default ViewDamage;