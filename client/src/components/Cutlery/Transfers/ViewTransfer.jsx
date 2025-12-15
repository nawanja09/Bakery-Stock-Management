import React from 'react';
import './ViewTransfer.css';

const ViewTransfer = ({ transfer, onClose, onEdit }) => {
  console.log('ViewTransfer received:', transfer);

  if (!transfer) {
    return (
      <div className="view-transfer-overlay">
        <div className="view-transfer-container">
          <div className="loading">No transfer data available</div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      Pending: { class: 'status-pending', label: 'Pending' },
      Completed: { class: 'status-completed', label: 'Completed' },
      Cancelled: { class: 'status-cancelled', label: 'Cancelled' },
    };

    const config = statusConfig[status] || { class: 'status-pending', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  return (
    <div className="view-transfer-overlay">
      <div className="view-transfer-container">
        <div className="view-transfer-header">
          <h3>Transfer Details</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="transfer-details">
          {/* Basic Info */}
          <section className="detail-section">
            <h4>Basic Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Transfer ID</label>
                <span>{transfer.transfer_id || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Transfer Date</label>
                <span>
                  {transfer.transfer_date
                    ? new Date(transfer.transfer_date).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <label>Status</label>
                {getStatusBadge(transfer.status || 'Pending')}
              </div>
              <div className="detail-item">
                <label>Transferred By</label>
                <span>{transfer.transferred_by || 'N/A'}</span>
              </div>
            </div>
          </section>

          {/* Location Info */}
          <section className="detail-section">
            <h4>Location Information</h4>
            <div className="location-flow">
              <div className="location-from">
                <label>From</label>
                <div className="location-detail">
                  <span>{transfer.from_location_name || 'N/A'}</span>
                  {transfer.location_from_id && <span>ID: {transfer.location_from_id}</span>}
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="location-to">
                <label>To</label>
                <div className="location-detail">
                  <span>{transfer.to_location_name || 'N/A'}</span>
                  {transfer.location_to_id && <span>ID: {transfer.location_to_id}</span>}
                </div>
              </div>
            </div>
          </section>

          {/* Asset Info */}
          <section className="detail-section">
            <h4>Asset Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Asset Name</label>
                <span>{transfer.asset_name || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Asset Code</label>
                <span>{transfer.asset_code || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Quantity</label>
                <span>{transfer.quantity || 0}</span>
              </div>
              <div className="detail-item">
                <label>Asset ID</label>
                <span>{transfer.asset_id || 'N/A'}</span>
              </div>
            </div>
          </section>

          {/* Notes */}
          {transfer.notes && (
            <section className="detail-section">
              <h4>Notes</h4>
              <div className="notes-content">{transfer.notes}</div>
            </section>
          )}

          {/* System Info */}
          <section className="detail-section">
            <h4>System Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created By</label>
                <span>{transfer.created_by_name || transfer.created_by || 'System'}</span>
              </div>
              <div className="detail-item">
                <label>Created Date</label>
                <span>
                  {transfer.created_at
                    ? new Date(transfer.created_at).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <label>Last Updated</label>
                <span>
                  {transfer.updated_at
                    ? new Date(transfer.updated_at).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <label>DB Transfer ID</label>
                <span>{transfer.id || 'N/A'}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="transfer-actions">
          <button className="btn-edit" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewTransfer;
