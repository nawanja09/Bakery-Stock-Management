import React, { useEffect } from 'react';
import PurchaseDetails from './PurchaseDetails';
import './PurchaseDetailsModal.css';

const PurchaseDetailsModal = ({ purchaseId, onClose }) => {
  // Handle ESC key press to close modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    
    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscKey);
      // Restore body scrolling when modal closes
      document.body.style.overflow = 'unset';
    };
  }, [onClose]); // Include onClose in dependencies

  // Handle click outside to close
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Purchase Details</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <PurchaseDetails purchaseId={purchaseId} isModal={true} onClose={onClose} />
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailsModal;