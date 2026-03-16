// SettlementModal.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faBalanceScale } from '@fortawesome/free-solid-svg-icons';
import './SettlementModal.css';
import api from '../../api';

const SettlementModal = ({ 
  isOpen, 
  onClose, 
  supplierId, 
  supplierName,
  returnAmount,
  onConfirm 
}) => {
  const [bills, setBills] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingAmount, setRemainingAmount] = useState(returnAmount);
  const [settlementNote, setSettlementNote] = useState('');

  useEffect(() => {
    if (isOpen && supplierId) {
      fetchSupplierBills();
    }
  }, [isOpen, supplierId]);

  useEffect(() => {
    // Calculate remaining amount based on selected bills
    const totalSelected = selectedBills.reduce((sum, bill) => sum + bill.allocatedAmount, 0);
    setRemainingAmount(returnAmount - totalSelected);
  }, [selectedBills, returnAmount]);

  const fetchSupplierBills = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/purchase-returns/supplier/${supplierId}/bills`);
      setBills(response.data);
    } catch (err) {
      setError('Failed to load supplier bills');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBillSelection = (bill, allocatedAmount) => {
    if (allocatedAmount <= 0) {
      // Remove bill if amount is 0 or negative
      setSelectedBills(prev => prev.filter(b => b.purchase_id !== bill.id));
      return;
    }

    const existingIndex = selectedBills.findIndex(b => b.purchase_id === bill.id);
    
    if (existingIndex >= 0) {
      // Update existing bill
      const updated = [...selectedBills];
      updated[existingIndex] = {
        purchase_id: bill.id,
        invoice_no: bill.invoice_no,
        amount: Math.min(allocatedAmount, bill.balance_amount),
        originalBalance: bill.balance_amount
      };
      setSelectedBills(updated);
    } else {
      // Add new bill
      setSelectedBills(prev => [...prev, {
        purchase_id: bill.id,
        invoice_no: bill.invoice_no,
        amount: Math.min(allocatedAmount, bill.balance_amount),
        originalBalance: bill.balance_amount
      }]);
    }
  };

  const handleAllocateAll = (bill) => {
    const maxAllocatable = Math.min(bill.balance_amount, remainingAmount + 
      (selectedBills.find(b => b.purchase_id === bill.id)?.amount || 0));
    
    handleBillSelection(bill, maxAllocatable);
  };

  const handleConfirm = () => {
    if (selectedBills.length === 0 && returnAmount > 0) {
      if (!window.confirm('No bills selected for settlement. The full amount will be carried forward as balance. Continue?')) {
        return;
      }
    }
    
    onConfirm({
      settlements: selectedBills,
      remainingAmount: remainingAmount,
      note: settlementNote
    });
  };

  const totalSelectedAmount = selectedBills.reduce((sum, bill) => sum + bill.amount, 0);

  if (!isOpen) return null;

  return (
    <div className="settlement-modal-overlay">
      <div className="settlement-modal">
        <div className="settlement-modal-header">
          <h3>
            <FontAwesomeIcon icon={faBalanceScale} />
            Settle Return Amount
          </h3>
          <button className="close-btn" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="settlement-modal-body">
          <div className="return-summary">
            <div className="summary-item">
              <span className="label">Supplier:</span>
              <span className="value">{supplierName}</span>
            </div>
            <div className="summary-item">
              <span className="label">Return Amount:</span>
              <span className="value highlight">Rs. {returnAmount.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Selected Settlement:</span>
              <span className="value success">Rs. {totalSelectedAmount.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Remaining Balance:</span>
              <span className={`value ${remainingAmount > 0 ? 'warning' : 'success'}`}>
                Rs. {remainingAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading bills...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : bills.length === 0 ? (
            <div className="no-bills">
              <p>No outstanding bills found for this supplier.</p>
              <p>The full return amount will be carried forward as balance.</p>
            </div>
          ) : (
            <>
              <h4>Available Bills with Balance</h4>
              <div className="bills-list">
                {bills.map(bill => {
                  const selectedBill = selectedBills.find(b => b.purchase_id === bill.id);
                  const allocatedAmount = selectedBill?.amount || 0;
                  const maxAllocatable = Math.min(
                    bill.balance_amount,
                    remainingAmount + allocatedAmount
                  );

                  return (
                    <div key={bill.id} className="bill-item">
                      <div className="bill-info">
                        <div className="bill-header">
                          <span className="invoice">{bill.invoice_no}</span>
                          <span className="date">
                            {new Date(bill.purchase_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="bill-details">
                          <span>Total: Rs. {bill.total_with_vat}</span>
                          <span>Paid: Rs. {bill.paid_amount}</span>
                          <span className="balance">Balance: Rs. {bill.balance_amount}</span>
                        </div>
                      </div>
                      
                      <div className="bill-actions">
                        <input
                          type="number"
                          min="0"
                          max={bill.balance_amount}
                          step="0.01"
                          value={allocatedAmount}
                          onChange={(e) => handleBillSelection(bill, parseFloat(e.target.value) || 0)}
                          placeholder="Amount"
                          className="amount-input"
                          disabled={remainingAmount <= 0 && !allocatedAmount}
                        />
                        <button
                          type="button"
                          className="allocate-btn"
                          onClick={() => handleAllocateAll(bill)}
                          disabled={maxAllocatable <= 0}
                        >
                          Max
                        </button>
                        {selectedBill && (
                          <span className="allocated-badge">
                            <FontAwesomeIcon icon={faCheck} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="settlement-notes">
            <label>Notes (Optional):</label>
            <textarea
              value={settlementNote}
              onChange={(e) => setSettlementNote(e.target.value)}
              placeholder="Add any notes about this settlement..."
              rows="2"
            />
          </div>
        </div>

        <div className="settlement-modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={remainingAmount < 0}
          >
            Confirm Settlement
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettlementModal;