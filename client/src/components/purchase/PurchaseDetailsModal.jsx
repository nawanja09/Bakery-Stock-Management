import React from 'react';
import PurchaseDetails from './PurchaseDetails';
import './PurchaseDetailsModal.css';

const PurchaseDetailsModal = ({ purchaseId, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Purchase Details</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <PurchaseDetails purchaseId={purchaseId} isModal={true} />
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailsModal;