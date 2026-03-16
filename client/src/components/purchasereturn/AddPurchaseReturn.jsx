// AddPurchaseReturn.jsx (fixed)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faSave, 
  faPlus, 
  faTrash,
  faSearch,
  faExclamationTriangle,
  faBalanceScale
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import SettlementModal from './SettlementModal';
import './AddPurchaseReturn.css';

const AddPurchaseReturn = () => {
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingItems, setFetchingItems] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [returnDate, setReturnDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [remarks, setRemarks] = useState('');
  const [supplierVatRegistered, setSupplierVatRegistered] = useState(false);
  const [returnNumber, setReturnNumber] = useState('');
  
  // Settlement related states
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementData, setSettlementData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const VAT_RATE = 18;

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);
    fetchPurchases();
  }, []); // Empty dependency array - runs only once

  // Separate useEffect for auto-submit
  useEffect(() => {
    if (settlementData && !showSettlementModal && !isSubmitting) {
      finalSubmit();
    }
  }, [settlementData, showSettlementModal]); // Runs when settlementData or showSettlementModal changes

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const response = await api.get('/purchase-returns/purchases');
      setPurchases(response.data);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      showPopup('error', 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseSelect = async (selectedOption) => {
    if (!selectedOption) {
      setSelectedPurchase(null);
      setPurchaseItems([]);
      return;
    }

    const purchaseId = selectedOption.value;
    setSelectedPurchase(selectedOption);

    try {
      setFetchingItems(true);
      const response = await api.get(`/purchase-returns/purchases/${purchaseId}/items`);
      
      // Set supplier VAT status
      setSupplierVatRegistered(response.data.purchase.supplier_vat_registered || false);
      
      // Initialize items with return_quantity = 0
      const itemsWithReturn = response.data.items.map(item => ({
        ...item,
        return_quantity: 0
      }));
      
      setPurchaseItems(itemsWithReturn);
    } catch (error) {
      console.error('Error fetching purchase items:', error);
      showPopup('error', 'Failed to load purchase items');
    } finally {
      setFetchingItems(false);
    }
  };

  const handleQuantityChange = (index, value) => {
    const newItems = [...purchaseItems];
    const newQuantity = parseFloat(value) || 0;
    
    // Validate not exceeding available quantity
    if (newQuantity > newItems[index].available_quantity) {
      showPopup('warning', `Cannot return more than ${newItems[index].available_quantity} ${newItems[index].unit}`);
      return;
    }
    
    newItems[index].return_quantity = Math.max(0, newQuantity);
    setPurchaseItems(newItems);
  };

  const setMaxQuantity = (index) => {
    const newItems = [...purchaseItems];
    newItems[index].return_quantity = newItems[index].available_quantity;
    setPurchaseItems(newItems);
  };

  const calculateItemValues = (item) => {
    const amount = item.return_quantity * item.unit_price;
    const vat = (supplierVatRegistered && item.vat_applicable) ? 
      amount * (VAT_RATE / 100) : 0;
    const total = amount + vat;
    
    return { amount, vat, total };
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalVat = 0;
    
    purchaseItems.forEach(item => {
      if (item.return_quantity > 0) {
        const amount = item.return_quantity * item.unit_price;
        subtotal += amount;
        
        if (supplierVatRegistered && item.vat_applicable) {
          totalVat += amount * (VAT_RATE / 100);
        }
      }
    });
    
    const grandTotal = subtotal + totalVat;
    
    return { subtotal, totalVat, grandTotal };
  };

  const hasItemsToReturn = () => {
    return purchaseItems.some(item => item.return_quantity > 0);
  };

  const handleSettlementConfirm = (settlementResult) => {
    setSettlementData(settlementResult);
    setShowSettlementModal(false);
    
    // Show summary before final submission
    const { subtotal, totalVat, grandTotal } = calculateTotals();
    
    showPopup('info', 
      `Settlement Summary:\n` +
      `Total Return: Rs. ${grandTotal.toFixed(2)}\n` +
      `Settled: Rs. ${settlementResult.settlements.reduce((sum, s) => sum + s.amount, 0).toFixed(2)}\n` +
      `Balance: Rs. ${settlementResult.remainingAmount.toFixed(2)}`
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!returnNumber || returnNumber.trim() === '') {
      showPopup('error', 'Please enter a return number');
      return;
    }

    if (!selectedPurchase) {
      showPopup('error', 'Please select a purchase bill');
      return;
    }

    if (!hasItemsToReturn()) {
      showPopup('error', 'Please enter return quantity for at least one item');
      return;
    }

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information is missing. Please login again.');
      navigate('/login');
      return;
    }

    // Show settlement modal first
    setShowSettlementModal(true);
  };

  const finalSubmit = async () => {
    if (!settlementData) {
      showPopup('error', 'Settlement data is required');
      return;
    }

    setIsSubmitting(true);

    // Prepare items for submission (only those with quantity > 0)
    const itemsToReturn = purchaseItems
      .filter(item => item.return_quantity > 0)
      .map(item => ({
        purchase_item_id: item.purchase_item_id,
        item_id: item.item_id,
        item_name: item.item_name,
        return_quantity: item.return_quantity,
        unit_price: item.unit_price,
        vat_applicable: item.vat_applicable
      }));

    const { subtotal, totalVat, grandTotal } = calculateTotals();

    const formData = {
      return_number: returnNumber.trim().toUpperCase(),
      purchase_id: selectedPurchase.value,
      supplier_id: selectedPurchase.supplier_id,
      return_date: returnDate,
      items: itemsToReturn,
      remarks: remarks + (settlementData.note ? ` | Settlement: ${settlementData.note}` : ''),
      returned_by: currentUser.id,
      settlements: settlementData.settlements.map(s => ({
        purchase_id: s.purchase_id,
        invoice_no: s.invoice_no,
        amount: s.amount
      }))
    };

    try {
      const response = await api.post('/purchase-returns', formData);
      showPopup('success', 
        `Return created successfully!\n` +
        `Return #: ${response.data.return_number}\n` +
        `Settled: Rs. ${response.data.summary.settled_amount.toFixed(2)}\n` +
        `Balance: Rs. ${response.data.summary.balance_amount.toFixed(2)}`
      );
      navigate('/purchase-returns/history');
    } catch (error) {
      console.error('Error creating return:', error);
      
      if (error.response?.data?.error?.includes('Return number already exists')) {
        showPopup('error', 'This return number already exists. Please use a different number.');
      } else {
        showPopup('error', error.response?.data?.error || 'Failed to create return');
      }
      setIsSubmitting(false);
      setSettlementData(null);
    }
  };

  const purchaseOptions = purchases.map(p => ({
    value: p.id,
    label: `${p.invoice_no} - ${p.supplier_name} (${dayjs(p.purchase_date).format('DD MMM YYYY')}) - Rs. ${p.total_amount}`,
    supplier_id: p.supplier_id,
    supplier_name: p.supplier_name,
    vat_registered: p.vat_registered
  }));

  const totals = calculateTotals();

  return (
    <div className="purchase-return-container">
      <div className="page-header">
        <div className="header-title">
          <button onClick={() => navigate('/purchase-returns/history')} className="back-button">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1>Create Purchase Return</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="return-form">
        <div className="form-card">
          <h2>Select Purchase Bill</h2>
          
          <div className="form-group">
            <label>Purchase Bill *</label>
            <Select
              options={purchaseOptions}
              onChange={handlePurchaseSelect}
              isSearchable
              placeholder="Search and select purchase bill..."
              className="react-select-container"
              classNamePrefix="react-select"
              isLoading={loading}
            />
          </div>

          {selectedPurchase && (
            <div className="selected-purchase-info">
              <p>
                <strong>Supplier:</strong> {selectedPurchase.supplier_name}
                {supplierVatRegistered && (
                  <span className="vat-badge">VAT Registered</span>
                )}
              </p>
            </div>
          )}
        </div>

        {fetchingItems && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading purchase items...</p>
          </div>
        )}

        {selectedPurchase && !fetchingItems && purchaseItems.length > 0 && (
        <>
          <div className="form-card">
            <h2>Return Information</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label>Return Number *</label>
                <input
                  type="text"
                  value={returnNumber}
                  onChange={(e) => setReturnNumber(e.target.value.toUpperCase())}
                  placeholder="Enter return number (e.g., RTN-2025-001)"
                  required
                  className="return-number-input"
                />
                <small className="field-note">Must be unique - system will validate duplicates</small>
              </div>

              <div className="form-group">
                <label>Return Date *</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  required
                  className="date-input"
                />
              </div>
            </div>
          </div>

          <div className="form-card">
            <h2>Items to Return</h2>
            
            <div className="items-table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item Details</th>
                    <th>Purchased</th>
                    <th>Returned</th>
                    <th>Available</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>Return Quantity</th>
                    <th>Amount</th>
                    {supplierVatRegistered && <th>VAT (18%)</th>}
                    <th>Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map((item, index) => {
                    const { amount, vat, total } = calculateItemValues(item);
                    const hasAvailable = item.available_quantity > 0;
                    const stockLevel = item.available_quantity <= item.purchased_quantity * 0.1 ? 'low' : 'good';
                    
                    return (
                      <tr key={index} className={!hasAvailable ? 'no-stock' : ''}>
                        <td>
                          <div className="item-name-container">
                            <div className="item-name">
                              {item.item_name}
                              {item.vat_applicable && (
                                <span className="vat-badge-table">VAT</span>
                              )}
                            </div>
                            <span className="item-category">
                              {item.category || 'General'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="quantity-badge quantity-purchased">
                            {item.purchased_quantity?.toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className="quantity-badge quantity-returned">
                            {item.returned_quantity?.toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className="quantity-badge quantity-available">
                            {item.available_quantity?.toLocaleString()}
                          </span>
                          {stockLevel === 'low' && (
                            <span className="stock-status low-stock">● Low</span>
                          )}
                        </td>
                        <td>
                          <span className="unit-display">{item.unit}</span>
                        </td>
                        <td className="numeric-value">
                          <span className="price-highlight">Rs.</span> {item.unit_price?.toFixed(2)}
                        </td>
                        <td>
                          <div className="quantity-control-enhanced">
                            <input
                              type="number"
                              min="0"
                              max={item.available_quantity}
                              step="0.001"
                              value={item.return_quantity}
                              onChange={(e) => handleQuantityChange(index, e.target.value)}
                              disabled={!hasAvailable}
                              className="quantity-input-enhanced"
                              placeholder="0"
                            />
                            {hasAvailable && item.available_quantity > 0 && (
                              <button
                                type="button"
                                onClick={() => setMaxQuantity(index)}
                                className="max-btn-enhanced"
                                title="Return all available"
                              >
                                Max
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="amount-column">Rs. {amount?.toFixed(2)}</td>
                        {supplierVatRegistered && (
                          <td className="vat-amount">
                            {item.vat_applicable ? `Rs. ${vat?.toFixed(2)}` : '-'}
                          </td>
                        )}
                        <td className="amount-column">
                          <strong>Rs. {total?.toFixed(2)}</strong>
                        </td>
                        <td>
                          {item.return_quantity > 0 && (
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(index, 0)}
                              className="btn-clear-enhanced"
                              title="Clear quantity"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!hasItemsToReturn() && selectedPurchase && (
              <div className="warning-message">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                Please enter return quantity for at least one item
              </div>
            )}
          </div>

          <div className="form-card">
            <h2>Summary</h2>
            
            <div className="summary-section">
              <div className="summary-row">
                <span>Subtotal (Net Amount):</span>
                <span>Rs. {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row vat">
                <span>VAT ({VAT_RATE}%):</span>
                <span>Rs. {totals.totalVat.toFixed(2)}</span>
              </div>
              <div className="summary-row grand-total">
                <span>Total Return Amount:</span>
                <span className="bold">Rs. {totals.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="form-card">
            <h2>Remarks</h2>
            <div className="form-group">
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows="3"
                placeholder="Enter any remarks or notes..."
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/purchase-returns/history')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!hasItemsToReturn() || isSubmitting}
            >
              <FontAwesomeIcon icon={faBalanceScale} />
              {isSubmitting ? 'Processing...' : 'Create Return with Settlement'}
            </button>
          </div>
        </>
        )}
      </form>

      {/* Settlement Modal */}
      {showSettlementModal && selectedPurchase && (
        <SettlementModal
          isOpen={showSettlementModal}
          onClose={() => setShowSettlementModal(false)}
          supplierId={selectedPurchase.supplier_id}
          supplierName={selectedPurchase.supplier_name}
          returnAmount={totals.grandTotal}
          onConfirm={handleSettlementConfirm}
        />
      )}
    </div>
  );
};

export default AddPurchaseReturn;