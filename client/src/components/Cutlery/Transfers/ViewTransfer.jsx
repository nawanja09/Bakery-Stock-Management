import React from 'react';
import './ViewTransfer.css';

const ViewTransfer = ({ transfer, onClose, onEdit }) => {
  const getStatusBadge = (status) => {
    const map = {
      Pending: 'pending',
      Completed: 'completed',
      Cancelled: 'cancelled',
    };
    return <span className={`status-badge ${map[status]}`}>{status}</span>;
  };

  const getTotalQuantity = () => {
    if (transfer.items && transfer.items.length > 0) {
      return transfer.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    }
    return 0;
  };

  return (
    <div className="view-transfer-overlay">
      <div className="view-transfer-container">
        <div className="view-transfer-header">
          <h3>Transfer Details - {transfer.transfer_id}</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="view-transfer-body">
          <div className="detail-section">
            <h4>Transfer Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Transfer ID:</label>
                <span>{transfer.transfer_id}</span>
              </div>
              <div className="detail-item">
                <label>Transfer Date:</label>
                <span>{new Date(transfer.transfer_date).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Transferred By:</label>
                <span>{transfer.transferred_by}</span>
              </div>
              <div className="detail-item">
                <label>Status:</label>
                <span>{getStatusBadge(transfer.status)}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h4>Location Details</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>From Location:</label>
                <span>{transfer.from_location_name}</span>
              </div>
              <div className="detail-item">
                <label>To Location:</label>
                <span>{transfer.to_location_name}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="assets-header">
              <h4>Asset Details</h4>
              <div className="total-quantity">
                Total Items: <strong>{getTotalQuantity()}</strong>
              </div>
            </div>
            
            {transfer.items && transfer.items.length > 0 ? (
              <div className="assets-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Asset ID</th>
                      <th>Asset Name</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.items.map((item, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{item.asset_code}</td>
                        <td>{item.asset_name}</td>
                        <td className="quantity">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-assets">
                <span>No assets found for this transfer</span>
              </div>
            )}
          </div>

          {transfer.notes && (
            <div className="detail-section">
              <h4>Notes</h4>
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
                <span>{transfer.created_by_name}</span>
              </div>
              <div className="detail-item">
                <label>Created At:</label>
                <span>{new Date(transfer.created_at).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Last Updated:</label>
                <span>{new Date(transfer.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="view-transfer-actions">
            <button className="btn-edit" onClick={onEdit}>
              Edit Transfer
            </button>
            <button className="btn-close-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewTransfer;