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
  faSearch,
  faCheckCircle,
  faMoneyBillWave,
  faReceipt
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import SettlementModal from './SettlementModal';
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
  
  // NEW: Bill settlement states
  const [supplierBills, setSupplierBills] = useState([]);
  const [selectedBillsForSettlement, setSelectedBillsForSettlement] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [returnAmount, setReturnAmount] = useState(0);
  
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
  const [returnItems, setReturnItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const VAT_RATE = 18;

  // Calculate return amount whenever items change
  useEffect(() => {
    const total = calculateReturnTotal();
    setReturnAmount(total);
  }, [returnItems, supplierVatRegistered]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);
    const today = dayjs().format('YYYYMMDD');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setReturnNumber(`RTN-${today}-${randomNum}`);
    fetchSuppliers();
    fetchCompanies().catch(err => console.warn('Companies feature not available:', err));
    fetchItems();
    fetchPreviousPrices();
    fetchAllCurrentStock();
  }, []);

  // Fetch supplier bills when supplier changes
  useEffect(() => {
    if (formData.supplier_id) {
      fetchSupplierBills(formData.supplier_id);
    } else {
      setSupplierBills([]);
      setSelectedBillsForSettlement([]);
    }
  }, [formData.supplier_id]);

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
      setCompanies([]);
      return [];
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItemsList(response.data);
    } catch (error) {
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

  const fetchAllCurrentStock = async () => {
    try {
      setLoadingStock(true);
      const response = await api.get('/purchase-returns/stock/current');
      const stockMap = {};
      response.data.forEach(stock => {
        stockMap[stock.item_id] = stock.quantity;
      });
      setCurrentStock(stockMap);
    } catch (error) {
      showPopup('warning', 'Could not load stock information. You can still create returns but stock validation may be limited.');
    } finally {
      setLoadingStock(false);
    }
  };

  // NEW: Fetch supplier bills from last 3 months with non-paid status
  const fetchSupplierBills = async (supplierId) => {
    try {
      setLoadingBills(true);
      // Get bills from last 3 months that have balance > 0
      const threeMonthsAgo = dayjs().subtract(3, 'months').format('YYYY-MM-DD');
      const response = await api.get(`/purchases/supplier/${supplierId}/bills?fromDate=${threeMonthsAgo}`);
      
      // Filter bills with balance > 0
      const billsWithBalance = response.data.filter(bill => parseFloat(bill.balance_amount) > 0);
      setSupplierBills(billsWithBalance);
    } catch (error) {
      console.error('Error fetching supplier bills:', error);
      setSupplierBills([]);
    } finally {
      setLoadingBills(false);
    }
  };

  const fetchItemStock = async (itemId) => {
    try {
      const response = await api.get(`/purchase-returns/stock/item/${itemId}`);
      return response.data.quantity || 0;
    } catch (error) {
      return 0;
    }
  };

  const handleSupplierChange = async (e) => {
    const supplierId = e.target.value;
    setFormData(prev => ({ ...prev, supplier_id: supplierId }));
    setSelectedBillsForSettlement([]); // Reset selected bills when supplier changes
    
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

  // NEW: Handle bill selection for settlement
  const handleBillSelection = (bill, amount) => {
    const existingIndex = selectedBillsForSettlement.findIndex(b => b.purchase_id === bill.id);
    const maxAmount = Math.min(bill.balance_amount, returnAmount - getTotalSelectedAmount() + (existingIndex >= 0 ? selectedBillsForSettlement[existingIndex].amount : 0));
    const allocatedAmount = Math.min(amount, maxAmount);
    
    if (allocatedAmount <= 0 && existingIndex >= 0) {
      // Remove if amount is zero
      setSelectedBillsForSettlement(prev => prev.filter(b => b.purchase_id !== bill.id));
    } else if (allocatedAmount > 0) {
      const entry = {
        purchase_id: bill.id,
        invoice_no: bill.invoice_no,
        purchase_date: bill.purchase_date,
        total_amount: bill.total_with_vat,
        paid_amount: bill.paid_amount,
        balance_amount: bill.balance_amount,
        amount: allocatedAmount
      };
      
      if (existingIndex >= 0) {
        const updated = [...selectedBillsForSettlement];
        updated[existingIndex] = entry;
        setSelectedBillsForSettlement(updated);
      } else {
        setSelectedBillsForSettlement(prev => [...prev, entry]);
      }
    }
  };

  const getTotalSelectedAmount = () => {
    return selectedBillsForSettlement.reduce((sum, bill) => sum + bill.amount, 0);
  };

  const handleSettleWithBills = () => {
    if (returnAmount <= 0) {
      showPopup('warning', 'Please add items to return first');
      return;
    }
    setShowSettlementModal(true);
  };

  const handleSettlementConfirm = (settlementData) => {
    setSelectedBillsForSettlement(settlementData.settlements);
    if (settlementData.note) {
      setRemarks(prev => prev ? `${prev}\nSettlement: ${settlementData.note}` : `Settlement: ${settlementData.note}`);
    }
    setShowSettlementModal(false);
    
    if (settlementData.settlements.length > 0) {
      showPopup('success', `Settlement of Rs. ${settlementData.settlements.reduce((s, b) => s + b.amount, 0).toFixed(2)} applied to ${settlementData.settlements.length} bill(s)`);
    }
  };

  const addNewItem = () => {
    setReturnItems([
      ...returnItems,
      {
        id: Date.now(),
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

  const handleItemSelect = async (index, selectedOption) => {
    if (!selectedOption) return;
    const selectedItem = itemsList.find(item => item.id === selectedOption.value);
    if (!selectedItem) return;

    const previousPrice = previousPurchasePrices[selectedItem.id] || 0;
    const currentStockQty = currentStock[selectedItem.id] ?? await fetchItemStock(selectedItem.id);

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
      purchased_quantity: 0,
      returned_quantity: 0,
      available_quantity: currentStockQty
    };
    setReturnItems(newItems);
  };

  const handleQuantityChange = (index, value) => {
    const newItems = [...returnItems];
    const newQuantity = parseFloat(value) || 0;
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
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const calculateItemValues = (item) => {
    const amount = item.return_quantity * item.unit_price;
    const vat = (supplierVatRegistered && item.vat_applicable) ? amount * (VAT_RATE / 100) : 0;
    const total = amount + vat;
    return { amount, vat, total };
  };

  const calculateReturnTotal = () => {
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
    return subtotal + totalVat;
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
    return { subtotal, totalVat, grandTotal: subtotal + totalVat };
  };

  // Custom components to hide dropdown indicator and separator
  const customSelectComponents = {
    DropdownIndicator: null,
    IndicatorSeparator: null
  };

  const hasItemsToReturn = () =>
    returnItems.some(item => item.return_quantity > 0 && item.unit_price > 0 && item.item_id)

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!returnNumber?.trim()) { showPopup('error', 'Please enter a return number'); return; }
    if (!formData.supplier_id)  { showPopup('error', 'Please select a supplier'); return; }
    if (!hasItemsToReturn())    { showPopup('error', 'Please enter return quantity for at least one item'); return; }
    if (!currentUser?.id)       { showPopup('error', 'User information is missing. Please login again.'); navigate('/login'); return; }

    setIsSubmitting(true);
    const { grandTotal } = calculateTotals();
    
    // Validate settlement doesn't exceed return total
    const totalSettled = getTotalSelectedAmount();
    if (totalSettled > grandTotal) {
      showPopup('error', `Settlement amount (${totalSettled.toFixed(2)}) cannot exceed return total (${grandTotal.toFixed(2)})`);
      setIsSubmitting(false);
      return;
    }

    const itemsToReturn = returnItems
      .filter(item => item.return_quantity > 0 && item.unit_price > 0 && item.item_id)
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        return_quantity: item.return_quantity,
        unit_price: item.unit_price,
        vat_applicable: item.vat_applicable,
        is_new: true
      }));

    const finalFormData = {
      return_number: returnNumber.trim().toUpperCase(),
      purchase_id: null,
      supplier_id: formData.supplier_id,
      return_date: returnDate,
      items: itemsToReturn,
      remarks: remarks || null,
      returned_by: currentUser.id,
      payment_method: formData.payment_method,
      company_id: formData.company_id || null,
      check_number: formData.check_number || null,
      settlements: selectedBillsForSettlement.map(bill => ({
        purchase_id: bill.purchase_id,
        amount: bill.amount
      }))
    };

    try {
      const response = await api.post('/purchase-returns', finalFormData);
      showPopup('success',
        `Return created successfully!\nReturn #: ${response.data.return_number}\nTotal Amount: Rs. ${response.data.summary.total_amount.toFixed(2)}\nSettled: Rs. ${response.data.summary.settled_amount.toFixed(2)}\nBalance: Rs. ${response.data.summary.balance_amount.toFixed(2)}`
      );
      navigate('/purchase-returns/history');
    } catch (error) {
      if (error.response?.data?.error?.includes('Return number already exists')) {
        showPopup('error', 'This return number already exists. Please use a different number.');
      } else {
        showPopup('error', error.response?.data?.error || 'Failed to create return');
      }
      setIsSubmitting(false);
    }
  };

  const totals = calculateTotals();
  const totalSelectedSettlement = getTotalSelectedAmount();
  const remainingAfterSettlement = totals.grandTotal - totalSelectedSettlement;

  const itemOptions = itemsList.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code || ''}) - ${item.unit}`,
    previousPrice: previousPurchasePrices[item.id] || 0,
    unit: item.unit,
    vat_applicable: item.vat_applicable || false
  }));

  return (
    <div className="purchase-return-container">
      {/* PAGE HEADER */}
      <div className="page-header">
        <div className="header-title">
          <button onClick={() => navigate('/purchase-returns/history')} className="back-button" type="button">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1>Create Purchase Return</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="return-form">

        {/* ── RETURN INFORMATION ── */}
        <div className="form-card">
          <h2>Return Information</h2>

          <div className="form-row">
            <div className="form-group">
              <label>Return Number *</label>
              <input
                type="text"
                value={returnNumber}
                onChange={(e) => setReturnNumber(e.target.value.toUpperCase())}
                placeholder="RTN-YYYYMMDD-000"
                required
                className="return-number-input"
              />
              <span className="field-note">Must be unique — system validates duplicates</span>
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
                <FontAwesomeIcon icon={faUser} /> Supplier *
              </label>
              <select
                value={formData.supplier_id}
                onChange={handleSupplierChange}
                className="form-control"
                required
              >
                <option value="">Select supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.vat_registered ? ' · VAT Reg' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faPercent} /> VAT Number
              </label>
              <input
                type="text"
                value={supplierVatNumber}
                readOnly
                className={`form-control ${supplierVatRegistered ? 'vat-active' : 'vat-inactive'}`}
                placeholder={supplierVatRegistered ? 'VAT registered' : 'Not VAT registered'}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCreditCard} /> Payment Method *
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
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
                <FontAwesomeIcon icon={faBuilding} /> Company
              </label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                className="form-control"
              >
                <option value="">Select company (optional)</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="field-note">Optional</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUniversity} /> Reference / Check No.
              </label>
              <input
                type="text"
                value={formData.check_number}
                onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
                placeholder="Optional"
                className="form-control"
              />
              <span className="field-note">For cheque or bank transfer reference</span>
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows="2"
                className="form-control"
                placeholder="Add any notes or remarks..."
              />
            </div>
          </div>
        </div>

        {/* ── ITEMS TO RETURN ── */}
        <div className="form-card">
          <div className="section-header">
            <h2>
              <FontAwesomeIcon icon={faBoxes} /> Items to Return
            </h2>
            <button type="button" className="btn-add-item-header" onClick={addNewItem}>
              <FontAwesomeIcon icon={faPlus} /> Add Item
            </button>
          </div>

          <div className="items-table-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Item</th>
                  <th style={{ width: '10%' }}>Stock</th>
                  <th style={{ width: '7%' }}>Unit</th>
                  <th style={{ width: '12%' }}>Unit Price</th>
                  <th style={{ width: '14%' }}>Qty to Return</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Amount</th>
                  {supplierVatRegistered && <th style={{ width: '10%', textAlign: 'right' }}>VAT (18%)</th>}
                  <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '7%' }}></th>
                </tr>
              </thead>
              <tbody>
                {returnItems.length === 0 ? (
                  <tr>
                    <td colSpan={supplierVatRegistered ? 9 : 8} className="empty-table-message">
                      <div className="empty-state-small">
                        <FontAwesomeIcon icon={faSearch} />
                        <p>No items added. Click "Add Item" to begin.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  returnItems.map((item, index) => {
                    const { amount, vat, total } = calculateItemValues(item);
                    const selectedOption = item.item_id
                      ? itemOptions.find(opt => opt.value === item.item_id)
                      : null;
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
                            isClearable = {false}
                            placeholder="Search item..."
                            classNamePrefix="react-select"
                            components={customSelectComponents}
                            styles={{
                              control: (base) => ({
                                ...base,
                                minHeight: '36px',
                                fontSize: '13px'
                              }),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 })
                            }}
                            menuPortalTarget={document.body}
                          />
                          {item.vat_applicable && (
                            <small style={{ color: '#059669', fontSize: '11px', display: 'block', marginTop: '3px', fontWeight: 600 }}>
                              ✓ VAT
                            </small>
                          )}
                        </td>
                        <td>
                          <span className={`quantity-badge ${stockLevel === 'low' ? 'low-stock-badge' : 'quantity-available'}`}>
                            {item.current_stock?.toLocaleString() || 0}
                          </span>
                          {stockLevel === 'low' && item.current_stock > 0 && (
                            <span className="stock-status low-stock">● Low</span>
                          )}
                          {item.current_stock === 0 && item.item_id && (
                            <span className="stock-status out-of-stock">● Out</span>
                          )}
                        </td>
                        <td>
                          <span className="unit-display">{item.unit || '—'}</span>
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
                            <small style={{ display: 'block', fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
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
                                title="Set to max available stock"
                              >
                                Max
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="amount-column">Rs. {amount?.toFixed(2)}</td>
                        {supplierVatRegistered && (
                          <td className="vat-amount">
                            {item.vat_applicable ? `Rs. ${vat?.toFixed(2)}` : '—'}
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
              Please enter a return quantity for at least one item.
            </div>
          )}
        </div>

        {/* ── SUMMARY ── */}
        <div className="form-card">
          <h2>Summary</h2>
          <div className="summary-section">
            <div className="summary-row">
              <span>Subtotal (Net Amount)</span>
              <span>Rs. {totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row vat">
              <span>VAT ({VAT_RATE}%)</span>
              <span>Rs. {totals.totalVat.toFixed(2)}</span>
            </div>
            <div className="summary-row grand-total">
              <span>Total Return Amount</span>
              <span className="bold">Rs. {totals.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── BILL SETTLEMENT SECTION (NEW) ── */}
        {formData.supplier_id && (
          <div className="form-card bill-settlement-card">
            <div className="section-header">
              <h2>
                <FontAwesomeIcon icon={faReceipt} />
                Bill Settlement (Last 3 Months)
              </h2>
              {returnAmount > 0 && (
                <button
                  type="button"
                  className="btn-settle-bills"
                  onClick={handleSettleWithBills}
                >
                  <FontAwesomeIcon icon={faBalanceScale} />
                  Settle with Bills
                </button>
              )}
            </div>

            {loadingBills ? (
              <div className="loading-bills">Loading bills...</div>
            ) : supplierBills.length === 0 ? (
              <div className="no-bills-message">
                <FontAwesomeIcon icon={faFileInvoice} />
                <p>No outstanding bills found for this supplier from the last 3 months.</p>
                <small>The return amount will be carried forward as balance.</small>
              </div>
            ) : (
              <>
                <div className="bills-table-container">
                  <table className="bills-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Total Amount</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th style={{ width: '180px' }}>Settlement Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierBills.map(bill => {
                        const selectedBill = selectedBillsForSettlement.find(b => b.purchase_id === bill.id);
                        const allocatedAmount = selectedBill?.amount || 0;
                        const remainingForThisBill = bill.balance_amount - allocatedAmount;
                        
                        return (
                          <tr key={bill.id} className={allocatedAmount > 0 ? 'bill-selected' : ''}>
                            <td>
                              <span className="invoice-badge-small">{bill.invoice_no}</span>
                            </td>
                            <td>{dayjs(bill.purchase_date).format('DD MMM YYYY')}</td>
                            <td className="text-right">Rs. {parseFloat(bill.total_with_vat).toFixed(2)}</td>
                            <td className="text-right">Rs. {parseFloat(bill.paid_amount).toFixed(2)}</td>
                            <td className="text-right balance-amount">Rs. {parseFloat(bill.balance_amount).toFixed(2)}</td>
                            <td>
                              <div className="settlement-input-group">
                                <input
                                  type="number"
                                  min="0"
                                  max={bill.balance_amount}
                                  step="0.01"
                                  value={allocatedAmount}
                                  onChange={(e) => handleBillSelection(bill, parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                  className="settlement-amount-input"
                                  disabled={returnAmount <= 0}
                                />
                                {allocatedAmount > 0 && (
                                  <span className="allocated-check">
                                    <FontAwesomeIcon icon={faCheckCircle} />
                                  </span>
                                )}
                              </div>
                              {remainingForThisBill > 0 && allocatedAmount > 0 && (
                                <small className="remaining-hint">
                                  Remaining: Rs. {remainingForThisBill.toFixed(2)}
                                </small>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Settlement Summary */}
                {totalSelectedSettlement > 0 && (
                  <div className="settlement-summary-card">
                    <div className="settlement-summary-header">
                      <FontAwesomeIcon icon={faMoneyBillWave} />
                      <span>Settlement Summary</span>
                    </div>
                    <div className="settlement-summary-details">
                      <div className="summary-detail">
                        <span>Return Total:</span>
                        <span>Rs. {totals.grandTotal.toFixed(2)}</span>
                      </div>
                      <div className="summary-detail success">
                        <span>Settlement Amount:</span>
                        <span>Rs. {totalSelectedSettlement.toFixed(2)}</span>
                      </div>
                      <div className="summary-detail warning">
                        <span>Balance to Carry:</span>
                        <span>Rs. {remainingAfterSettlement.toFixed(2)}</span>
                      </div>
                    </div>
                    {remainingAfterSettlement === 0 && (
                      <div className="fully-settled-badge">
                        <FontAwesomeIcon icon={faCheckCircle} />
                        Fully Settled
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ACTIONS ── */}
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
            {isSubmitting ? 'Processing…' : 'Create Return'}
          </button>
        </div>
      </form>

      {/* Settlement Modal */}
      <SettlementModal
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        supplierId={formData.supplier_id}
        supplierName={suppliers.find(s => s.id === parseInt(formData.supplier_id))?.name || ''}
        returnAmount={totals.grandTotal}
        existingSettlements={selectedBillsForSettlement}
        onConfirm={handleSettlementConfirm}
      />
    </div>
  );
};

export default AddPurchaseReturn;