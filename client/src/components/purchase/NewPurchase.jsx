import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Purchase.css'; 
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import Select from 'react-select';

const AddPurchase = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierVatRegistered, setSupplierVatRegistered] = useState(false);
  const [supplierVatNumber, setSupplierVatNumber] = useState('');
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  
  const VAT_RATE = 18;

  const [formData, setFormData] = useState({
    purchase_date: new Date().toLocaleDateString('en-CA'),
    invoice_no: '',
    supplier_id: '',
    subtotal: 0,
    vat_amount: 0,
    vat_rate: VAT_RATE,
    total_with_vat: 0,
    paid_amount: 0,
    balance_amount: 0,
    balance_status: 0,
    payment_method: 'CASH',
    check_number: '',
    remarks: '',
    company_id: '',
    items: [{ 
      id: '', 
      item_name: '', 
      quantity: 1, 
      unit_price: 0,
      unit: '',
      vat_applicable: false,
      amount: 0,
      vat: 0,
      lineTotal: 0
    }]
  });

  const [autoAddedRow, setAutoAddedRow] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchData = async () => {
      try {
        const [suppliersRes, itemsRes, companiesRes, pricesRes] = await Promise.all([
          api.get('/suppliers'),
          api.get('/items'),
          api.get('/purchases/companies'),
          api.get('/purchases/previous-prices')
        ]);
        
        setSuppliers(suppliersRes.data);
        setItemsList(itemsRes.data);
        setCompanies(companiesRes.data);
        setPreviousPurchasePrices(pricesRes.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        showPopup('error', 'Failed to load form data');
      }
    };

    fetchData();
  }, [showPopup]);

  const calculateItemValues = (item, supplierVatRegistered) => {
    const amount = item.quantity * item.unit_price;
    let vat = 0;
    
    if (supplierVatRegistered && item.vat_applicable) {
      vat = amount * (VAT_RATE / 100);
    }
    
    const lineTotal = amount + vat;
    
    return { amount, vat, lineTotal };
  };

  const calculateTotals = (items, supplierVatRegistered, paidAmount) => {
    let subtotal = 0;
    let totalVat = 0;
    
    items.forEach(item => {
      const amount = item.quantity * item.unit_price;
      subtotal += amount;
      
      if (supplierVatRegistered && item.vat_applicable) {
        totalVat += amount * (VAT_RATE / 100);
      }
    });
    
    const grandTotal = subtotal + totalVat;
    const balanceAmount = Math.max(0, grandTotal - paidAmount);
    const balanceStatus = balanceAmount > 0 ? 1 : 0;
    
    return { subtotal, totalVat, grandTotal, balanceAmount, balanceStatus };
  };

  const handleSupplierChange = (e) => {
    const supplierId = parseInt(e.target.value);
    const supplier = suppliers.find(s => s.id === supplierId);
    
    setSelectedSupplier(supplier);
    setSupplierVatRegistered(supplier?.vat_registered || false);
    setSupplierVatNumber(supplier?.vat_number || '');
    
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId
    }));

    const newItems = formData.items.map(item => {
      const { amount, vat, lineTotal } = calculateItemValues(item, supplier?.vat_registered || false);
      return { ...item, amount, vat, lineTotal };
    });

    const { subtotal, totalVat, grandTotal, balanceAmount, balanceStatus } = calculateTotals(
      newItems, 
      supplier?.vat_registered || false,
      formData.paid_amount
    );

    setFormData(prev => ({
      ...prev,
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      balance_amount: balanceAmount,
      balance_status: balanceStatus
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }

    newItems[index][field] = value;

    const { amount, vat, lineTotal } = calculateItemValues(
      newItems[index], 
      supplierVatRegistered
    );
    
    newItems[index].amount = amount;
    newItems[index].vat = vat;
    newItems[index].lineTotal = lineTotal;

    const { subtotal, totalVat, grandTotal, balanceAmount, balanceStatus } = calculateTotals(
      newItems, 
      supplierVatRegistered,
      formData.paid_amount
    );

    setFormData({
      ...formData,
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      balance_amount: balanceAmount,
      balance_status: balanceStatus
    });

    if (field === 'unit_price' && index === formData.items.length - 1 && !autoAddedRow) {
      addItemRow();
      setAutoAddedRow(true);
    }

    if (index !== formData.items.length - 1) {
      setAutoAddedRow(false);
    }
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { 
        id: '', 
        item_name: '', 
        quantity: 1, 
        unit_price: 0, 
        unit: '',
        vat_applicable: false,
        amount: 0,
        vat: 0,
        lineTotal: 0
      }]
    });
  };

  const handleItemSelect = (index, selectedOption) => {
    if (!selectedOption) return;
    
    const selectedItem = itemsList.find(item => item.id === selectedOption.value);
    if (!selectedItem) return;

    const previousPrice = previousPurchasePrices[selectedItem.id] || 0;

    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: previousPrice,
      unit: selectedItem.unit,
      vat_applicable: selectedItem.vat_applicable || false
    };

    const { amount, vat, lineTotal } = calculateItemValues(
      newItems[index], 
      supplierVatRegistered
    );
    
    newItems[index].amount = amount;
    newItems[index].vat = vat;
    newItems[index].lineTotal = lineTotal;

    const { subtotal, totalVat, grandTotal, balanceAmount, balanceStatus } = calculateTotals(
      newItems, 
      supplierVatRegistered,
      formData.paid_amount
    );

    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      balance_amount: balanceAmount,
      balance_status: balanceStatus
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    
    const newItems = formData.items.filter((_, i) => i !== index);
    
    const { subtotal, totalVat, grandTotal, balanceAmount, balanceStatus } = calculateTotals(
      newItems, 
      supplierVatRegistered,
      formData.paid_amount
    );
    
    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      balance_amount: balanceAmount,
      balance_status: balanceStatus
    });
  };

  const handlePaidAmountChange = (e) => {
    const paidAmount = parseFloat(e.target.value) || 0;
    const balanceAmount = Math.max(0, formData.total_with_vat - paidAmount);
    const balanceStatus = balanceAmount > 0 ? 1 : 0;
    
    setFormData({
      ...formData,
      paid_amount: paidAmount,
      balance_amount: balanceAmount,
      balance_status: balanceStatus
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = Date.now();
    if (now - lastSubmitTime < 2000) {
      showPopup('warning', 'Please wait a moment before submitting again.');
      return;
    }

    if (isSubmitting) return;

    if (formData.items.some(item => !item.id)) {
      showPopup('error', 'Please select valid items for all rows');
      return;
    }

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information is missing. Please login again.');
      navigate('/login');
      return;
    }

    setIsSubmitting(true);
    setLastSubmitTime(now);

    const submitData = {
      ...formData,
      prepared_by: currentUser.id,
      company_id: formData.company_id || null,
      items: formData.items.map(item => ({
        item_id: item.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit: item.unit
      }))
    };

    try {
      const response = await api.post('/purchases', submitData);
      showPopup('success', `Purchase created successfully! Invoice: ${response.data.invoice_no}`);
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error creating purchase:', error);
      showPopup('error', error.response?.data?.error || 'Server error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''}) - ${itm.vat_applicable ? 'VAT Applicable' : 'No VAT'}`,
    previousPrice: previousPurchasePrices[itm.id] || 0
  }));

  return (
    <div className="new-purchase-container">
      <h2>Add New Purchase</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Purchase Date *</label>
            <input 
              type="date" 
              value={formData.purchase_date}
              onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Supplier *</label>
            <select
              value={formData.supplier_id}
              onChange={handleSupplierChange}
              required
            >
              <option value="">Select Supplier</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} {supplier.vat_registered ? '(VAT Registered)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Invoice Number *</label>
            <input
              type="text"
              value={formData.invoice_no}
              onChange={(e) => setFormData({...formData, invoice_no: e.target.value})}
              placeholder="Enter invoice number"
              required
              className="invoice-input"
            />
          </div>
          <div className="form-group">
            <label>VAT Number</label>
            <input
              type="text"
              value={supplierVatNumber}
              readOnly
              className="vat-display"
              placeholder={supplierVatRegistered ? "Auto-filled" : "Not VAT registered"}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Payment Method *</label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
              required
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>
          <div className="form-group">
            <label>Company *</label>
            <select
              value={formData.company_id}
              onChange={(e) => setFormData({...formData, company_id: e.target.value})}
              required
            >
              <option value="">Select Company</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Reference/Check Number</label>
            <input
              type="text"
              value={formData.check_number}
              onChange={(e) => setFormData({...formData, check_number: e.target.value})}
              placeholder="Enter reference number"
            />
          </div>
          <div className="form-group">
            <label>Remarks</label>
            <textarea 
              value={formData.remarks}
              onChange={(e) => setFormData({...formData, remarks: e.target.value})}
              rows="2"
            />
          </div>
        </div>

        <h3>Purchased Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Price (Net)</th>
              <th>Amount</th>
              {supplierVatRegistered && (
                <th className="vat-column">VAT 18%</th>
              )}
              <th>Line Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => {
              const previousPrice = previousPurchasePrices[item.id] || 0;
              const amount = item.quantity * item.unit_price;
              const vat = (supplierVatRegistered && item.vat_applicable) ? 
                amount * (VAT_RATE / 100) : 0;
              const lineTotal = amount + vat;
              
              return (
                <tr key={index}>
                  <td>
                    <Select
                      options={itemOptions}
                      value={itemOptions.find(opt => opt.value === item.id) || null}
                      onChange={(selected) => handleItemSelect(index, selected)}
                      isSearchable
                      placeholder="Select item..."
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.unit}
                      readOnly
                      className="unit-display"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                      required
                      className={previousPrice && item.unit_price !== previousPrice ? 'price-different' : ''}
                    />
                    {previousPrice > 0 && (
                      <small>Prev: Rs.{previousPrice}</small>
                    )}
                  </td>
                  <td>Rs. {amount.toFixed(2)}</td>
                  {supplierVatRegistered && (
                    <td className="vat-column">Rs. {vat.toFixed(2)}</td>
                  )}
                  <td><strong>Rs. {lineTotal.toFixed(2)}</strong></td>
                  <td>
                    <button 
                      type="button" 
                      className="btn-remove"
                      onClick={() => removeItemRow(index)}
                      disabled={formData.items.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button type="button" className="btn-add" onClick={addItemRow}>
          + Add Item
        </button>

        <div className="summary-section">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>Rs. {formData.subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>VAT ({VAT_RATE}%):</span>
            <span>Rs. {formData.vat_amount.toFixed(2)}</span>
          </div>
          <div className="summary-row grand-total">
            <span>Grand Total:</span>
            <span>Rs. {formData.total_with_vat.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Paid Amount:</span>
            <span>Rs. {formData.paid_amount.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Balance Amount:</span>
            <span className={formData.balance_amount > 0 ? 'due-amount' : ''}>
              Rs. {formData.balance_amount.toFixed(2)}
            </span>
          </div>
          <div className="summary-row">
            <span>Balance Status:</span>
            <span>
              <span className={`status-badge ${formData.balance_status === 0 ? 'status-paid' : 'status-due'}`}>
                {formData.balance_status} ({formData.balance_status === 0 ? 'No Balance' : 'Balance Available'})
              </span>
            </span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Paid Amount (Rs.) *</label>
            <input 
              type="number"
              min="0"
              step="0.01"
              value={formData.paid_amount}
              onChange={handlePaidAmountChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Balance Amount</label>
            <input
              type="number"
              value={formData.balance_amount.toFixed(2)}
              readOnly
              className={formData.balance_amount > 0 ? 'due-amount' : ''}
            />
          </div>

          <div className="form-group">
            <label>Balance Status</label>
            <input
              type="text"
              value={`${formData.balance_status} (${formData.balance_status === 0 ? 'No Balance' : 'Balance Available'})`}
              readOnly
              className={formData.balance_status === 1 ? 'status-due-bg' : 'status-paid-bg'}
            />
          </div>
        </div>

        <button 
          type="submit" 
          className="btn-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Purchase'}
        </button>
      </form>
    </div>
  );
};

export default AddPurchase;