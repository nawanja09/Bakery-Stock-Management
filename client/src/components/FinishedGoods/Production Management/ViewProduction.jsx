
import React from 'react';
import './ProductionManagement.css';


const ViewProductionPopup = ({ production, onClose }) => {
  if (!production) return null;

  return (
    <div className="popup-overlay minimalist-popup-overlay">
      <div className="production-popup view-popup minimalist-popup">
        <button className="minimalist-close-btn" onClick={onClose} aria-label="Close">×</button>
        <div className="minimalist-header">
          <h2>Production Details</h2>
        </div>
        <div className="minimalist-details">
          <div className="minimalist-detail-row">
            <span className="minimalist-label">Production Date</span>
            <span>{new Date(production.production_date).toLocaleDateString()}</span>
          </div>
          <div className="minimalist-detail-row">
            <span className="minimalist-label">Prepared By</span>
            <span>{production.prepared_by}</span>
          </div>
          <div className="minimalist-detail-row">
            <span className="minimalist-label">Remarks</span>
            <span>{production.remarks || 'No remarks'}</span>
          </div>
        </div>
        <div className="minimalist-items-section">
          <h3>Production Items</h3>
          {production.items && production.items.length > 0 ? (
            <table className="minimalist-items-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {production.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.item_code}</td>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="minimalist-empty">No items found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewProductionPopup;