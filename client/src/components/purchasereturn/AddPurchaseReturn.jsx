import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faSave, 
  faPlus, 
  faTrash,
  faSearch,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
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
  
  const VAT_RATE = 18;

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);
    fetchPurchases();
  }, []);

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

  const validateReturnNumber = (number) => {
    if (!number || number.trim() === '') {
      return 'Return number is required';
    }
    return '';
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
      remarks: remarks,
      returned_by: currentUser.id
    };

    try {
      const response = await api.post('/purchase-returns', formData);
      showPopup('success', `Return created successfully! Return #: ${response.data.return_number}`);
      navigate('/purchase-returns/history');
    } catch (error) {
      console.error('Error creating return:', error);
      
      // Show specific error message for duplicate return number
      if (error.response?.data?.error?.includes('Return number already exists')) {
        showPopup('error', 'This return number already exists. Please use a different number.');
      } else {
        showPopup('error', error.response?.data?.error || 'Failed to create return');
      }
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
                      <th>Item</th>
                      <th>Purchased Qty</th>
                      <th>Already Returned</th>
                      <th>Available for Return</th>
                      <th>Unit</th>
                      <th>Unit Price</th>
                      <th>Return Qty</th>
                      <th>Amount</th>
                      {supplierVatRegistered && <th>VAT</th>}
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.map((item, index) => {
                      const { amount, vat, total } = calculateItemValues(item);
                      const hasAvailable = item.available_quantity > 0;
                      
                      return (
                        <tr key={index} className={!hasAvailable ? 'no-stock' : ''}>
                          <td>
                            <div className="item-name">{item.item_name}</div>
                            {item.vat_applicable && (
                              <small className="vat-applicable">VAT Applicable</small>
                            )}
                          </td>
                          <td className="text-center">{item.purchased_quantity}</td>
                          <td className="text-center">{item.returned_quantity}</td>
                          <td className="text-center">
                            <strong>{item.available_quantity}</strong>
                          </td>
                          <td>{item.unit}</td>
                          <td className="text-right">Rs. {item.unit_price}</td>
                          <td>
                            <div className="quantity-control">
                              <input
                                type="number"
                                min="0"
                                max={item.available_quantity}
                                step="0.001"
                                value={item.return_quantity}
                                onChange={(e) => handleQuantityChange(index, e.target.value)}
                                disabled={!hasAvailable}
                                className="quantity-input"
                              />
                              {hasAvailable && item.available_quantity > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setMaxQuantity(index)}
                                  className="max-btn"
                                  title="Return all available"
                                >
                                  Max
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="text-right">Rs. {amount.toFixed(2)}</td>
                          {supplierVatRegistered && (
                            <td className="text-right vat-column">
                              {item.vat_applicable ? `Rs. ${vat.toFixed(2)}` : '-'}
                            </td>
                          )}
                          <td className="text-right total-column">
                            <strong>Rs. {total.toFixed(2)}</strong>
                          </td>
                          <td>
                            {item.return_quantity > 0 && (
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(index, 0)}
                                className="btn-clear-item"
                                title="Clear"
                              >
                                <FontAwesomeIcon icon={faTrash} />
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
                disabled={!hasItemsToReturn()}
              >
                <FontAwesomeIcon icon={faSave} />
                Create Return
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};

export default AddPurchaseReturn;