import React from 'react';
import ReactDOM from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faTimes } from '@fortawesome/free-solid-svg-icons';

// Shared confirmation dialog for "Cancel Order" and "Order Complete" (spec
// sections 26/31). `order` supplies the details table; `message` is the
// exact confirmation copy for the action being confirmed.
const ConfirmOrderModal = ({ order, message, confirmLabel, onCancel, onConfirm, submitting }) => {
  return ReactDOM.createPortal(
    <div className="orders-modal-overlay" onClick={submitting ? undefined : onCancel}>
      <div className="orders-modal-content orders-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="orders-modal-header">
          <h2><FontAwesomeIcon icon={faExclamationTriangle} /> Confirm</h2>
          <button type="button" className="orders-modal-close" onClick={onCancel} disabled={submitting}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="orders-modal-body">
          <div className="orders-modal-readonly-grid orders-confirm-grid">
            <div>
              <label>Order Number</label>
              <div className="orders-modal-readonly-value">{order.order_no}</div>
            </div>
            <div>
              <label>RM Item</label>
              <div className="orders-modal-readonly-value">
                {order.items?.map(i => i.item_name).join(', ')}
              </div>
            </div>
            <div>
              <label>Order Quantity</label>
              <div className="orders-modal-readonly-value">
                {order.items?.map(i => `${i.quantity} ${i.unit || ''}`).join(', ')}
              </div>
            </div>
            <div>
              <label>Supplier</label>
              <div className="orders-modal-readonly-value">{order.supplier_name || '-'}</div>
            </div>
            {order.expected_receive_date && (
              <div>
                <label>Expected Receive Date</label>
                <div className="orders-modal-readonly-value">{order.expected_receive_date}</div>
              </div>
            )}
          </div>

          <p className="orders-confirm-message">{message}</p>
        </div>

        <div className="orders-modal-footer">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmOrderModal;
