import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import PurchaseDetails from './PurchaseDetails';
import '../common/RouteModal.css';
import './PurchaseDetailsModal.css';

// Same shell as RouteModal (Purchase History → Purchase Details), but closed
// through onClose instead of router history. The generic .modal-* classes are
// avoided on purpose: FormStyles.css caps .modal-content at 600px wide.
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscKey);
      // Restore body scrolling when modal closes
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]); // Include onClose in dependencies

  // Handle click outside to close
  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalRoot = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div className="route-modal-overlay" role="dialog" aria-modal="true" onMouseDown={handleOverlayMouseDown}>
      <section className="route-modal route-modal-large purchase-details-modal" aria-labelledby="purchase-details-modal-title">
        <header className="route-modal-header">
          <div>
            <span className="route-modal-kicker">Bakery stock management</span>
            <h2 id="purchase-details-modal-title">Purchase Details</h2>
          </div>
          <button type="button" className="route-modal-close" onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>
        <div className="route-modal-body">
          <PurchaseDetails purchaseId={purchaseId} isModal={true} onClose={onClose} />
        </div>
      </section>
    </div>,
    modalRoot
  );
};

export default PurchaseDetailsModal;
