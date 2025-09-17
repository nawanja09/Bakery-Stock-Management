// components/FinishedGoods/Transfers/ViewTransferPopup.js
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import './Transfers.css';

const ViewTransferPopup = ({ transfer, onClose }) => {
  return (
    <div className="popup-overlay">
      <div className="transfer-popup view-popup">
        <div className="popup-header">
          <h3>Transfer Details - {transfer.transfer_number}</h3>
          <button className="close-btn" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="transfer-details">
          <div className="detail-row">
            <div className="detail-group">
              <label>Transfer Date:</label>
              <span>{new Date(transfer.transfer_date).toLocaleDateString()}</span>
            </div>
            
            <div className="detail-group">
              <label>Transferred By:</label>
              <span>{transfer.transferred_by}</span>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-group">
              <label>Destination:</label>
              <span>{transfer.destination_name}</span>
            </div>
            {transfer.remarks && (
                <div className="detail-group">
                    <label>Remarks:</label>
                    <span>{transfer.remarks}</span>
                </div>
            )}
          </div>
        </div>

        <div className="transfer-items-section">
          <h4>Transfer Items ({transfer.items?.length || 0})</h4>
          
          <table className="items-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items?.map((item, index) => (
                <tr key={index}>
                  <td>{item.item_code}</td>
                  <td>{item.item_name}</td>
                  <td>{item.category}</td>
                  <td>{item.quantity}</td>
                  <td>Rs. {parseFloat(item.unit_price).toFixed(2)}</td>
                  <td>Rs. {(item.quantity * item.unit_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ViewTransferPopup;