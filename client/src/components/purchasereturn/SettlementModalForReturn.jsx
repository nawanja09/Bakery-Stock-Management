// src/components/purchaseReturns/SettlementModalForReturn.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faBalanceScale, faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import './SettlementModal.css';
import api from '../../api';

const SettlementModalForReturn = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  returnAmount,      // This is the remaining balance to settle
  returnTotal,       // This is the original total amount
  existingSettlements = [],
  onConfirm
}) => {
  const [bills, setBills] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingAmount, setRemainingAmount] = useState(returnAmount);
  const [settlementNote, setSettlementNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [settlementDate, setSettlementDate] = useState(dayjs().format('YYYY-MM-DD'));

  // Initialize selected bills with existing ones
  useEffect(() => {
    if (existingSettlements && existingSettlements.length > 0) {
      setSelectedBills(existingSettlements);
    } else {
      setSelectedBills([]);
    }
  }, [existingSettlements]);

  useEffect(() => {
    if (isOpen && supplierId) {
      fetchSupplierBills();
    }
  }, [isOpen, supplierId]);

  useEffect(() => {
    const totalSelected = selectedBills.reduce((sum, bill) => sum + bill.amount, 0);
    setRemainingAmount(returnAmount - totalSelected);
  }, [selectedBills, returnAmount]);

  const fetchSupplierBills = async () => {
    try {
      setLoading(true);
      const threeMonthsAgo = dayjs().subtract(3, 'months').format('YYYY-MM-DD');
      const response = await api.get(`/purchases/supplier/${supplierId}/bills?fromDate=${threeMonthsAgo}`);
      
      // Filter bills with balance > 0
      const billsWithBalance = response.data.filter(bill => parseFloat(bill.balance_amount) > 0);
      setBills(billsWithBalance);
    } catch (err) {
      setError('Failed to load supplier bills');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBillSelection = (bill, allocatedAmount) => {
    const maxAmount = Math.min(bill.balance_amount, remainingAmount + getBillAmount(bill.id));
    const finalAmount = Math.min(allocatedAmount, maxAmount);
    
    if (finalAmount <= 0) {
      setSelectedBills(prev => prev.filter(b => b.purchase_id !== bill.id));
      return;
    }
    
    const existingIndex = selectedBills.findIndex(b => b.purchase_id === bill.id);
    const entry = {
      purchase_id: bill.id,
      invoice_no: bill.invoice_no,
      purchase_date: bill.purchase_date,
      total_amount: bill.total_with_vat,
      paid_amount: bill.paid_amount,
      balance_amount: bill.balance_amount,
      amount: finalAmount
    };
    
    if (existingIndex >= 0) {
      const updated = [...selectedBills];
      updated[existingIndex] = entry;
      setSelectedBills(updated);
    } else {
      setSelectedBills(prev => [...prev, entry]);
    }
  };

  const getBillAmount = (purchaseId) => {
    const bill = selectedBills.find(b => b.purchase_id === purchaseId);
    return bill ? bill.amount : 0;
  };

  const handleAllocateAll = (bill) => {
    const currentAlloc = getBillAmount(bill.id);
    const maxAllocatable = Math.min(bill.balance_amount, remainingAmount + currentAlloc);
    handleBillSelection(bill, maxAllocatable);
  };

  const handleConfirm = () => {
    // Only send bills that have amount > 0
    const settlementsToSend = selectedBills.filter(b => b.amount > 0);
    if (settlementsToSend.length === 0) {
      // If no bills selected, treat as balance carry forward
      onConfirm({
        settlements: [],
        remainingAmount,
        note: settlementNote,
        payment_method: paymentMethod,
        settlement_date: settlementDate
      });
      return;
    }
    
    onConfirm({
      settlements: settlementsToSend,
      remainingAmount,
      note: settlementNote,
      payment_method: paymentMethod,
      settlement_date: settlementDate
    });
  };

  const totalSelectedAmount = selectedBills.reduce((sum, b) => sum + b.amount, 0);
  const isFullySettled = totalSelectedAmount >= returnAmount;

  if (!isOpen) return null;

  return (
    <div className="settlement-modal-overlay">
      <div className="settlement-modal">

        {/* HEADER */}
        <div className="settlement-modal-header">
          <h3>
            <FontAwesomeIcon icon={faBalanceScale} />
            Settle Return Balance
          </h3>
          <button className="close-btn" onClick={onClose} type="button">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* BODY */}
        <div className="settlement-modal-body">

          {/* Summary Grid */}
          <div className="return-summary">
            <div className="summary-item">
              <span className="label">Supplier</span>
              <span className="value">{supplierName}</span>
            </div>
            <div className="summary-item">
              <span className="label">Total Return Amount</span>
              <span className="value">Rs. {Number(returnTotal || 0).toFixed(2)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Already Settled</span>
              <span className="value success">Rs. {((returnTotal || 0) - (returnAmount || 0)).toFixed(2)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Remaining Balance</span>
              <span className="value warning">Rs. {returnAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method and Date */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '12px', 
            marginBottom: '20px' 
          }}>
            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.8125rem'
                }}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div className="form-group">
              <label>Settlement Date</label>
              <input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.8125rem'
                }}
              />
            </div>
          </div>

          {/* Bills list */}
          {loading ? (
            <div className="loading">Loading bills from last 3 months...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : bills.length === 0 ? (
            <div className="no-bills">
              <FontAwesomeIcon icon={faMoneyBillWave} />
              <p>No outstanding bills found for this supplier from the last 3 months.</p>
              <p className="hint">The remaining balance will be carried forward as balance.</p>
            </div>
          ) : (
            <>
              <h4>Available Bills with Balance (Last 3 Months)</h4>
              <div className="bills-list">
                {bills.map(bill => {
                  const allocatedAmount = getBillAmount(bill.id);
                  const maxAllocatable = Math.min(bill.balance_amount, remainingAmount + allocatedAmount);
                  const isSelected = allocatedAmount > 0;

                  return (
                    <div key={bill.id} className={`bill-item ${isSelected ? 'selected' : ''}`}>
                      <div className="bill-info">
                        <div className="bill-header">
                          <span className="invoice">{bill.invoice_no}</span>
                          <span className="date">
                            {dayjs(bill.purchase_date).format('DD MMM YYYY')}
                          </span>
                        </div>
                        <div className="bill-details">
                          <span>Total: Rs. {parseFloat(bill.total_with_vat).toFixed(2)}</span>
                          <span>Paid: Rs. {parseFloat(bill.paid_amount).toFixed(2)}</span>
                          <span className="balance">Balance: Rs. {parseFloat(bill.balance_amount).toFixed(2)}</span>
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
                          placeholder="0.00"
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
                        {isSelected && (
                          <span className="allocated-badge">
                            <FontAwesomeIcon icon={faCheck} />
                          </span>
                        )}
                      </div>
                      {allocatedAmount > 0 && allocatedAmount < bill.balance_amount && (
                        <div className="remaining-bill-hint">
                          Remaining on this bill: Rs. {(bill.balance_amount - allocatedAmount).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Settlement Progress */}
          {totalSelectedAmount > 0 && (
            <div className="settlement-progress">
              <div className="progress-label">
                <span>New Settlement Progress</span>
                <span>{totalSelectedAmount.toFixed(2)} of {returnAmount.toFixed(2)}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(totalSelectedAmount / returnAmount) * 100}%` }}
                />
              </div>
              <div className="progress-percentage">
                {((totalSelectedAmount / returnAmount) * 100).toFixed(1)}% of remaining balance
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="settlement-notes">
            <label>Settlement Notes (Optional)</label>
            <textarea
              value={settlementNote}
              onChange={(e) => setSettlementNote(e.target.value)}
              placeholder="Add any notes about this settlement..."
              rows="2"
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="settlement-modal-footer">
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            type="button"
            disabled={remainingAmount < 0}
          >
            Confirm Settlement
            {isFullySettled && <FontAwesomeIcon icon={faCheck} style={{ marginLeft: '8px' }} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettlementModalForReturn;