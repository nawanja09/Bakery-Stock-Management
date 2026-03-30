// src/components/purchase/AddPurchaseReturn.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft,
  faExclamationTriangle,
  faBalanceScale,
  faFileInvoice,
  faUser,
  faPercent,
  faCreditCard,
  faBuilding,
  faUniversity,
  faPlus,
  faTrash,
  faBoxes,
  faSearch
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './AddPurchaseReturn.css';

const AddPurchaseReturn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showPopup } = usePopup();
  
  const [currentUser, setCurrentUser] = useState(null);
  const [returnDate, setReturnDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [remarks, setRemarks] = useState('');
  const [supplierVatRegistered, setSupplierVatRegistered] = useState(false);
  const [returnNumber, setReturnNumber] = useState('');
  const [itemsList, setItemsList] = useState([]);
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  const [currentStock, setCurrentStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  
  // Form data state
  const [formData, setFormData] = useState({
    supplier_id: '',
    payment_method: 'CASH',
    company_id: '',
    check_number: '',
    remarks: ''
  });
  
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [supplierVatNumber, setSupplierVatNumber] = useState('');
  
  // Items to return
  const [returnItems, setReturnItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const VAT_RATE = 18;

  // Generate return number on load
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);
    
    const today = dayjs().format('YYYYMMDD');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setReturnNumber(`RTN-${today}-${randomNum}`);
    
    // Fetch data
    fetchSuppliers();
    fetchCompanies().catch(err => console.warn('Companies feature not available:', err));
    fetchItems();
    fetchPreviousPrices();
    fetchAllCurrentStock();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      showPopup('error', 'Failed to load suppliers');
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/purchases/companies');
      setCompanies(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching companies:', error);
      setCompanies([]);
      return [];
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItemsList(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      showPopup('error', 'Failed to load items');
    }
  };

  const fetchPreviousPrices = async () => {
    try {
      const response = await api.get('/purchases/previous-prices');
      setPreviousPurchasePrices(response.data);
    } catch (error) {
      console.error('Error fetching previous prices:', error);
    }
  };

  // Fetch current stock for all items - FIXED: Use correct endpoint
  const fetchAllCurrentStock = async () => {
    try {
      setLoadingStock(true);
      // The stock endpoint is under purchase-returns route
      const response = await api.get('/purchase-returns/stock/current');
      const stockMap = {};
      response.data.forEach(stock => {
        stockMap[stock.item_id] = stock.quantity;
      });
      setCurrentStock(stockMap);
    } catch (error) {
      console.error('Error fetching stock:', error);
      showPopup('warning', 'Could not load stock information. You can still create returns but stock validation may be limited.');
    } finally {
      setLoadingStock(false);
    }
  };

  // Fetch current stock for a specific item - FIXED: Use correct endpoint
  const fetchItemStock = async (itemId) => {
    try {
      const response = await api.get(`/purchase-returns/stock/item/${itemId}`);
      return response.data.quantity || 0;
    } catch (error) {
      console.error('Error fetching item stock:', error);
      return 0;
    }
  };

  const handleSupplierChange = async (e) => {
    const supplierId = e.target.value;
    setFormData(prev => ({ ...prev, supplier_id: supplierId }));
    
    if (supplierId) {
      try {
        const response = await api.get(`/suppliers/${supplierId}`);
        const supplier = response.data;
        setSupplierVatRegistered(supplier.vat_registered || false);
        setSupplierVatNumber(supplier.vat_number || '');
      } catch (error) {
        console.error('Error fetching supplier details:', error);
      }
    } else {
      setSupplierVatRegistered(false);
      setSupplierVatNumber('');
    }
  };

  // Add new empty item row
  const addNewItem = () => {
    setReturnItems([
      ...returnItems,
      {
        id: Date.now(), // temporary ID
        item_id: null,
        item_name: '',
        return_quantity: 1,
        unit_price: 0,
        unit: '',
        vat_applicable: false,
        current_stock: 0,
        purchased_quantity: 0,
        returned_quantity: 0,
        available_quantity: 0
      }
    ]);
  };

  // Handle item selection from dropdown
  const handleItemSelect = async (index, selectedOption) => {
    if (!selectedOption) return;
    
    const selectedItem = itemsList.find(item => item.id === selectedOption.value);
    if (!selectedItem) return;

    const previousPrice = previousPurchasePrices[selectedItem.id] || 0;
    const currentStockQty = currentStock[selectedItem.id] || await fetchItemStock(selectedItem.id);

    const newItems = [...returnItems];
    newItems[index] = {
      ...newItems[index],
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: previousPrice,
      unit: selectedItem.unit,
      vat_applicable: selectedItem.vat_applicable || false,
      current_stock: currentStockQty,
      return_quantity: 1,
      // These are not used for standalone return
      purchased_quantity: 0,
      returned_quantity: 0,
      available_quantity: currentStockQty
    };

    setReturnItems(newItems);
  };

  const handleQuantityChange = (index, value) => {
    const newItems = [...returnItems];
    const newQuantity = parseFloat(value) || 0;
    
    // Validate not exceeding current stock
    if (newQuantity > newItems[index].current_stock) {
      showPopup('warning', `Cannot return more than current stock (${newItems[index].current_stock} ${newItems[index].unit})`);
      return;
    }
    
    newItems[index].return_quantity = newQuantity;
    setReturnItems(newItems);
  };

  const setMaxQuantity = (index) => {
    const newItems = [...returnItems];
    newItems[index].return_quantity = newItems[index].current_stock;
    setReturnItems(newItems);
  };

  const handlePriceChange = (index, value) => {
    const newItems = [...returnItems];
    newItems[index].unit_price = parseFloat(value) || 0;
    setReturnItems(newItems);
  };

  const removeItem = (index) => {
    const newItems = returnItems.filter((_, i) => i !== index);
    setReturnItems(newItems);
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
    
    returnItems.forEach(item => {
      if (item.return_quantity > 0 && item.unit_price > 0 && item.item_id) {
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
    return returnItems.some(item => {
      return item.return_quantity > 0 && item.unit_price > 0 && item.item_id;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!returnNumber || returnNumber.trim() === '') {
      showPopup('error', 'Please enter a return number');
      return;
    }

    if (!formData.supplier_id) {
      showPopup('error', 'Please select a supplier');
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

    setIsSubmitting(true);

    const { grandTotal } = calculateTotals();

    // Prepare items for submission
    const itemsToReturn = returnItems
      .filter(item => item.return_quantity > 0 && item.unit_price > 0 && item.item_id)
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        return_quantity: item.return_quantity,
        unit_price: item.unit_price,
        vat_applicable: item.vat_applicable,
        is_new: true // All items are standalone returns
      }));

    const finalFormData = {
      return_number: returnNumber.trim().toUpperCase(),
      purchase_id: null, // No purchase ID - standalone return
      supplier_id: formData.supplier_id,
      return_date: returnDate,
      items: itemsToReturn,
      remarks: remarks,
      returned_by: currentUser.id,
      payment_method: formData.payment_method,
      company_id: formData.company_id || null,
      check_number: formData.check_number || null,
      settlements: [] // No settlements
    };

    try {
      const response = await api.post('/purchase-returns', finalFormData);
      showPopup('success', 
        `Return created successfully!\n` +
        `Return #: ${response.data.return_number}\n` +
        `Total Amount: Rs. ${response.data.summary.total_amount.toFixed(2)}`
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
    }
  };

  const totals = calculateTotals();

  // Item options for react-select
  const itemOptions = itemsList.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code || ''}) - ${item.unit}`,
    previousPrice: previousPurchasePrices[item.id] || 0,
    unit: item.unit,
    vat_applicable: item.vat_applicable || false
  }));

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

          <div className="form-row">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUser} />
                Supplier *
              </label>
              <select
                value={formData.supplier_id}
                onChange={handleSupplierChange}
                className="form-control"
                required
              >
                <option value="">Select supplier</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.vat_registered ? '• VAT Reg' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faPercent} />
                VAT Number
              </label>
              <input
                type="text"
                value={supplierVatNumber}
                readOnly
                className={`form-control ${supplierVatRegistered ? 'vat-active' : 'vat-inactive'}`}
                placeholder={supplierVatRegistered ? "VAT registered" : "Not VAT registered"}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCreditCard} />
                Payment Method *
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                className="form-control"
                required
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faBuilding} />
                Company
              </label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({...formData, company_id: e.target.value})}
                className="form-control"
              >
                <option value="">Select company (optional)</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
              <small className="field-note">Optional - select company if applicable</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUniversity} />
                Reference/Check No.
              </label>
              <input
                type="text"
                value={formData.check_number}
                onChange={(e) => setFormData({...formData, check_number: e.target.value})}
                placeholder="Optional"
                className="form-control"
              />
              <small className="field-note">Reference number for cheque or bank transfer</small>
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea 
                value={formData.remarks}
                onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                rows="2"
                className="form-control"
                placeholder="Add any notes or remarks..."
              />
            </div>
          </div>
        </div>

        <div className="form-card">
          <div className="section-header">
            <h2>
              <FontAwesomeIcon icon={faBoxes} />
              Items to Return
            </h2>
            <button 
              type="button" 
              className="btn-add-item-header"
              onClick={addNewItem}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Item
            </button>
          </div>
          
          <div className="items-table-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Item Details</th>
                  <th style={{ width: '10%' }}>Current Stock</th>
                  <th style={{ width: '8%' }}>Unit</th>
                  <th style={{ width: '12%' }}>Unit Price</th>
                  <th style={{ width: '12%' }}>Return Quantity</th>
                  <th style={{ width: '10%' }}>Amount</th>
                  {supplierVatRegistered && <th style={{ width: '10%' }}>VAT (18%)</th>}
                  <th style={{ width: '10%' }}>Total</th>
                  <th style={{ width: '8%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.length === 0 ? (
                  <tr>
                    <td colSpan={supplierVatRegistered ? 9 : 8} className="empty-table-message">
                      <div className="empty-state-small">
                        <FontAwesomeIcon icon={faSearch} />
                        <p>No items added. Click "Add Item" to add items for return.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  returnItems.map((item, index) => {
                    const { amount, vat, total } = calculateItemValues(item);
                    const selectedOption = item.item_id ? itemOptions.find(opt => opt.value === item.item_id) : null;
                    const previousPrice = previousPurchasePrices[item.item_id] || 0;
                    const stockLevel = item.current_stock <= 10 ? 'low' : 'good';
                    
                    return (
                      <tr key={item.id || index}>
                        <td>
                          <Select
                            options={itemOptions}
                            value={selectedOption}
                            onChange={(selected) => handleItemSelect(index, selected)}
                            isSearchable
                            isClearable
                            placeholder="Search or select item..."
                            className="react-select-container"
                            classNamePrefix="react-select"
                            styles={{
                              control: (base) => ({
                                ...base,
                                minHeight: '38px',
                                borderColor: '#ced4da'
                              }),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 })
                            }}
                            menuPortalTarget={document.body}
                          />
                          {item.vat_applicable && (
                            <small style={{ color: '#28a745', display: 'block', marginTop: '4px' }}>
                              ✓ VAT Applicable
                            </small>
                          )}
                        </td>
                        <td>
                          <span className={`quantity-badge quantity-available ${stockLevel === 'low' ? 'low-stock-badge' : ''}`}>
                            {item.current_stock?.toLocaleString() || 0}
                          </span>
                          {stockLevel === 'low' && item.current_stock > 0 && (
                            <span className="stock-status low-stock">● Low Stock</span>
                          )}
                          {item.current_stock === 0 && (
                            <span className="stock-status out-of-stock">● Out of Stock</span>
                          )}
                        </td>
                        <td>
                          <span className="unit-display">{item.unit || '-'}</span>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => handlePriceChange(index, e.target.value)}
                            className="quantity-input"
                            placeholder="0.00"
                            disabled={!item.item_id}
                          />
                          {previousPrice > 0 && item.unit_price !== previousPrice && item.item_id && (
                            <small style={{ display: 'block', fontSize: '11px', color: '#6c757d' }}>
                              Prev: Rs.{previousPrice}
                            </small>
                          )}
                        </td>
                        <td>
                          <div className="quantity-control-enhanced">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              max={item.current_stock}
                              value={item.return_quantity}
                              onChange={(e) => handleQuantityChange(index, e.target.value)}
                              className="quantity-input-enhanced"
                              placeholder="0"
                              disabled={!item.item_id || item.current_stock === 0}
                            />
                            {item.item_id && item.current_stock > 0 && (
                              <button
                                type="button"
                                onClick={() => setMaxQuantity(index)}
                                className="max-btn-enhanced"
                                title="Return all available stock"
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
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="btn-clear-enhanced"
                            title="Remove item"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!hasItemsToReturn() && returnItems.length > 0 && (
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
            disabled={!hasItemsToReturn() || isSubmitting || !formData.supplier_id}
          >
            <FontAwesomeIcon icon={faBalanceScale} />
            {isSubmitting ? 'Processing...' : 'Create Return'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddPurchaseReturn;