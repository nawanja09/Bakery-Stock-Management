// Create Purchase Order modal - opens over the Low Stock tab without
// navigating away (spec section 6/7/51).
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faBoxes } from '@fortawesome/free-solid-svg-icons';
import { formatPurchasingNumber } from '../../../utils/formatters';

const CreateOrderModal = ({ item, suppliers, onClose, onSubmit, submitting }) => {
  const [orderQty, setOrderQty] = useState(item.required_qty);
  const [supplierId, setSupplierId] = useState(null);
  const [expectedDate, setExpectedDate] = useState('');
  const [error, setError] = useState('');

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }));

  const handleSubmit = (e) => {
    e.preventDefault();

    const qty = parseFloat(orderQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Order Qty must be a number greater than zero.');
      return;
    }
    if (!expectedDate) {
      setError('Expected Receive Date is required.');
      return;
    }

    setError('');
    onSubmit({
      item_id: item.item_id,
      quantity: qty,
      supplier_id: supplierId,
      expected_receive_date: expectedDate
    });
  };

  return ReactDOM.createPortal(
    <div className="orders-modal-overlay" onClick={submitting ? undefined : onClose}>
      <div className="orders-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="orders-modal-header">
          <h2><FontAwesomeIcon icon={faBoxes} /> Create Purchase Order</h2>
          <button type="button" className="orders-modal-close" onClick={onClose} disabled={submitting}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="orders-modal-body">
            <div className="orders-modal-section">
              <h3>Item Information</h3>
              <div className="orders-modal-readonly-grid">
                <div>
                  <label>RM Item</label>
                  <div className="orders-modal-readonly-value">{item.item_name}</div>
                </div>
                <div>
                  <label>Current Stock</label>
                  <div className="orders-modal-readonly-value">{formatPurchasingNumber(item.current_stock)} {item.unit}</div>
                </div>
                <div>
                  <label>Minimum Buffer Stock</label>
                  <div className="orders-modal-readonly-value">{formatPurchasingNumber(item.buffer_stock)} {item.unit}</div>
                </div>
                <div>
                  <label>Required Qty</label>
                  <div className="orders-modal-readonly-value orders-modal-required">
                    {formatPurchasingNumber(item.required_qty)} {item.unit}
                  </div>
                </div>
              </div>
            </div>

            <div className="orders-modal-section">
              <h3>Order Information</h3>

              <div className="orders-modal-field">
                <label>Order Qty ({item.unit}) <span className="required">*</span></label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="orders-modal-field">
                <label>Supplier <span className="optional">(optional)</span></label>
                <Select
                  classNamePrefix="orders-select"
                  options={supplierOptions}
                  isClearable
                  isDisabled={submitting}
                  placeholder="Select a supplier..."
                  onChange={(opt) => setSupplierId(opt ? opt.value : null)}
                />
              </div>

              <div className="orders-modal-field">
                <label>Expected Receive Date <span className="required">*</span></label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  disabled={submitting}
                />
              </div>

              {error && <div className="orders-modal-error">{error}</div>}
            </div>
          </div>

          <div className="orders-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CreateOrderModal;
