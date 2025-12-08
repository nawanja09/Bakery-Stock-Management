import React from 'react';
import './ViewTransfer.css';

const ViewTransfer = ({ transfer, onClose, onEdit }) => {
  // Debug: Check what data is received
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
          <h3>Transfer Details - {transfer.transfer_id || 'N/A'}</h3>
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
                <span className="transfer-id">{transfer.transfer_id || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Transfer Date:</label>
                <span>{transfer.transfer_date ? new Date(transfer.transfer_date).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Status:</label>
                {getStatusBadge(transfer.status || 'Pending')}
              </div>
              <div className="detail-item">
                <label>Transferred By:</label>
                <span>{transfer.transferred_by || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Location Information</h4>
            <div className="location-flow">
              <div className="location-from">
                <label>From Location:</label>
                <div className="location-detail">
                  <span className="location-name">{transfer.from_location_name || 'N/A'}</span>
                  {transfer.location_from_id && (
                    <span className="location-code">ID: {transfer.location_from_id}</span>
                  )}
                </div>
              </div>
              <div className="flow-arrow">→</div>
              <div className="location-to">
                <label>To Location:</label>
                <div className="location-detail">
                  <span className="location-name">{transfer.to_location_name || 'N/A'}</span>
                  {transfer.location_to_id && (
                    <span className="location-code">ID: {transfer.location_to_id}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Asset Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Asset Name:</label>
                <span className="asset-name">{transfer.asset_name || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Asset Code:</label>
                <span className="asset-code">{transfer.asset_code || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Quantity:</label>
                <span className="quantity">{transfer.quantity || 0}</span>
              </div>
              <div className="detail-item">
                <label>Asset ID:</label>
                <span>{transfer.asset_id || 'N/A'}</span>
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
                <span>{transfer.created_by_name || transfer.created_by || 'System'}</span>
              </div>
              <div className="detail-item">
                <label>Created Date:</label>
                <span>{transfer.created_at ? new Date(transfer.created_at).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{transfer.updated_at ? new Date(transfer.updated_at).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Transfer ID (DB):</label>
                <span>{transfer.id || 'N/A'}</span>
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