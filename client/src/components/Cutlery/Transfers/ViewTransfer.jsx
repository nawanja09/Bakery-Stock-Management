import React from 'react';
import './ViewTransfer.css';

const ViewTransfer = ({ transfer, onClose, onEdit }) => {
  const getStatusBadge = (status) => {
    const statusConfig = {
      'Pending': { class: 'status-pending', label: 'Pending' },
      'Completed': { class: 'status-completed', label: 'Completed' },
      'Cancelled': { class: 'status-cancelled', label: 'Cancelled' }
    };
    
    const config = statusConfig[status] || { class: 'status-pending', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  return (
    <div className="view-transfer-overlay">
      <div className="view-transfer-container">
        <div className="view-transfer-header">
          <h3>Transfer Details</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="transfer-details">
          <div className="detail-section">
            <h4>Basic Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Transfer ID:</label>
                <span className="transfer-id">{transfer.transfer_id}</span>
              </div>
              <div className="detail-item">
                <label>Transfer Date:</label>
                <span>{new Date(transfer.transfer_date).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Status:</label>
                {getStatusBadge(transfer.status)}
              </div>
              <div className="detail-item">
                <label>Transferred By:</label>
                <span>{transfer.transferred_by}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Location Information</h4>
            <div className="location-flow">
              <div className="location-from">
                <label>From Location:</label>
                <div className="location-detail">
                  <span className="location-name">{transfer.from_location_name}</span>
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="location-to">
                <label>To Location:</label>
                <div className="location-detail">
                  <span className="location-name">{transfer.to_location_name}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Asset Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Asset Name:</label>
                <span className="asset-name">{transfer.asset_name}</span>
              </div>
              <div className="detail-item">
                <label>Asset Code:</label>
                <span className="asset-code">{transfer.asset_code}</span>
              </div>
              <div className="detail-item">
                <label>Quantity:</label>
                <span className="quantity">{transfer.quantity}</span>
              </div>
            </div>
          </div>

          {transfer.notes && (
            <div className="detail-section">
              <h4>Additional Notes</h4>
              <div className="notes-content">
                {transfer.notes}
              </div>
            </div>
          )}

          <div className="detail-section">
            <h4>System Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created By:</label>
                <span>{transfer.created_by_name || 'System'}</span>
              </div>
              <div className="detail-item">
                <label>Created Date:</label>
                <span>{new Date(transfer.created_at).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{new Date(transfer.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="transfer-actions">
          <button
            type="button"
            className="btn-edit"
            onClick={onEdit}
          >
            Edit Transfer
          </button>
          <button
            type="button"
            className="btn-close-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewTransfer;