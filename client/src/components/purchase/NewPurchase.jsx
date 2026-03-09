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
  
  const VAT_RATE = 18;

  const [formData, setFormData] = useState({
    purchase_date: new Date().toLocaleDateString('en-CA'),
    invoice_no: '', // Add this line
    supplier_id: '',
    subtotal: 0,
    vat_amount: 0,
    vat_rate: VAT_RATE,
    total_with_vat: 0,
    paid_amount: 0,
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
      line_total: 0
    }]
  });

  const [autoAddedRow, setAutoAddedRow] = useState(false);
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchSuppliers = async () => {
      try {
        const response = await api.get('/suppliers');
        setSuppliers(response.data);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
      }
    };

    const fetchItems = async () => {
      try {
        const response = await api.get('/items');
        setItemsList(response.data);
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };

    const fetchCompanies = async () => {
      try {
        const response = await api.get('/purchases/companies');
        setCompanies(response.data);
      } catch (error) {
        console.error('Error fetching companies:', error);
      }
    };

    fetchSuppliers();
    fetchItems();
    fetchCompanies();
  }, []);

  useEffect(() => {
    const fetchPreviousPurchasePrices = async () => {
      try {
        const response = await api.get('/purchases/previous-prices');
        setPreviousPurchasePrices(response.data);
      } catch (error) {
        console.error('Error fetching previous purchase prices:', error);
      }
    };

    fetchPreviousPurchasePrices();
  }, []);

  // Calculate item amount, vat, and line total
  const calculateItemValues = (item, supplierVatRegistered) => {
    const amount = item.quantity * item.unit_price;
    let vat = 0;
    
    // Calculate VAT only if supplier is VAT registered AND item has VAT applicable
    if (supplierVatRegistered && item.vat_applicable) {
      vat = amount * (VAT_RATE / 100);
    }
    
    const lineTotal = amount + vat;
    
    return { amount, vat, lineTotal };
  };

  // Calculate totals
  const calculateTotals = (items, supplierVatRegistered) => {
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
    
    return { subtotal, totalVat, grandTotal };
  };

  // Handle supplier change
  const handleSupplierChange = async (e) => {
    const supplierId = e.target.value;
    const supplier = suppliers.find(s => s.id === parseInt(supplierId));
    
    setSelectedSupplier(supplier);
    setSupplierVatRegistered(supplier?.vat_registered || false);
    setSupplierVatNumber(supplier?.vat_number || '');
    
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId
    }));
  };

  // Handle item change
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }

    newItems[index][field] = value;

    // Recalculate item values
    const { amount, vat, lineTotal } = calculateItemValues(
      newItems[index], 
      supplierVatRegistered
    );
    
    newItems[index].amount = amount;
    newItems[index].vat = vat;
    newItems[index].lineTotal = lineTotal;

    // Recalculate totals
    const { subtotal, totalVat, grandTotal } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );

    setFormData({
      ...formData,
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal
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
    
    // For net unit price calculation based on VAT applicable
    let unitPrice = previousPrice;
    if (selectedItem.vat_applicable) {
      // Net unit price is automatically calculated (same as unit price for now)
      // You can modify this logic based on your business rules
      unitPrice = previousPrice;
    }

    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: unitPrice,
      unit: selectedItem.unit,
      vat_applicable: selectedItem.vat_applicable || false
    };

    // Recalculate item values
    const { amount, vat, lineTotal } = calculateItemValues(
      newItems[index], 
      supplierVatRegistered
    );
    
    newItems[index].amount = amount;
    newItems[index].vat = vat;
    newItems[index].lineTotal = lineTotal;

    // Recalculate totals
    const { subtotal, totalVat, grandTotal } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );

    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    
    // Recalculate totals
    const { subtotal, totalVat, grandTotal } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );
    
    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal
    });
  };

  const handlePaidAmountChange = (e) => {
    const paidAmount = parseFloat(e.target.value) || 0;
    const dueAmount = Math.max(0, formData.total_with_vat - paidAmount);
    
    setFormData({
      ...formData,
      paid_amount: paidAmount,
      due_amount: dueAmount
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;

    if (timeSinceLastSubmit < 2000) {
      showPopup('warning', '⚠️ Duplicate submission detected! Please wait a moment.');
      return;
    }

    if (isSubmitting) {
      showPopup('warning', 'Submission already in progress...');
      return;
    }

    setIsSubmitting(true);
    setLastSubmitTime(now);

    if (formData.items.some(item => !item.id)) {
      showPopup('error', 'Please select valid items for all rows');
      setIsSubmitting(false);
      return;
    }

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information is missing. Please login again.');
      navigate('/login');
      setIsSubmitting(false);
      return;
    }

    const updatedFormData = {
      ...formData,
      prepared_by: currentUser.id,
      company_id: formData.company_id === '' ? null : formData.company_id,
      supplier_vat_registered: supplierVatRegistered,
      supplier_vat_number: supplierVatNumber
    };

    try {
      const response = await api.post('/purchases', updatedFormData);
      showPopup('success', `Purchase created successfully! Invoice: ${response.data.invoice_no}`);
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error creating purchase:', error);
      const errorMessage = error.response?.data?.error || 'Server error';
      showPopup('error', `Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''}) - ${itm.vat_applicable ? 'VAT Applicable' : 'No VAT'}`,
    previousPrice: previousPurchasePrices[itm.id] || 0,
    vat_applicable: itm.vat_applicable
  }));

  const dueAmount = Math.max(0, formData.total_with_vat - (formData.paid_amount || 0));

  return (
    <div className="new-purchase-container">
      <h2>Add New Purchase</h2>
      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div className="form-row">
          <div className="form-group">
            <label>Purchase Date</label>
            <input 
              type="date" 
              value={formData.purchase_date}
              onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Supplier</label>
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
            <label>Invoice Number <span className="required">*</span></label>
            <input
              type="text"
              value={formData.invoice_no || ''}
              onChange={(e) => setFormData({...formData, invoice_no: e.target.value})}
              placeholder="Enter invoice number (e.g., INV-2025-001)"
              required
              className="invoice-input"
            />
            <small className="field-note">Must be unique - system will validate duplicates</small>
          </div>
          <div className="form-group">
            <label>VAT Number</label>
            <input
              type="text"
              value={supplierVatNumber}
              readOnly
              className="vat-display"
              placeholder={supplierVatRegistered ? "Auto-filled from supplier" : "Supplier not VAT registered"}
            />
          </div>
        </div>

        {/* Company */}
        <div className="form-row">
          <div className="form-group">
            <label>Payment Method</label>
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
            <label>Company</label>
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
          <div className="form-group">
            <label>Invoice Number</label>
            <input
              type="text"
              value={formData.check_number}
              onChange={(e) => setFormData({...formData, check_number: e.target.value})}
              placeholder="Enter invoice number"
            />
          </div>
          <div className="form-group">
            <label>Remarks</label>
            <textarea 
              value={formData.remarks}
              onChange={(e) => setFormData({...formData, remarks: e.target.value})}
            />
          </div>
        </div>

        {/* Purchased Items */}
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
                  <td style={{ minWidth: '250px' }}>
                    <Select
                      options={itemOptions}
                      value={itemOptions.find(opt => opt.value === item.id) || null}
                      onChange={(selected) => handleItemSelect(index, selected)}
                      isSearchable
                      placeholder="Select or search item..."
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.unit || ''}
                      readOnly
                      className="unit-display"
                      placeholder="Auto-filled"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                      required
                    />
                  </td>
                  <td>Rs. {amount.toFixed(2)}</td>
                  {supplierVatRegistered && (
                    <td className="vat-column">Rs. {vat.toFixed(2)}</td>
                  )}
                  <td>Rs. {lineTotal.toFixed(2)}</td>
                  <td>
                    <button 
                      type="button" 
                      className="btn-remove"
                      onClick={() => removeItemRow(index)}
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

        {/* Summary Section */}
        <div className="summary-section">
          <div className="summary-row">
            <span>Subtotal (Net Amount):</span>
            <span>Rs. {formData.subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Total VAT:</span>
            <span>Rs. {formData.vat_amount.toFixed(2)}</span>
          </div>
          <div className="summary-row grand-total">
            <span>Grand Total:</span>
            <span className={formData.total_with_vat > 0 ? 'bold' : ''}>
              Rs. {formData.total_with_vat.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment */}
        <div className="form-row">
          <div className="form-group">
            <label>Paid Amount (Rs.)</label>
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
            <label>Due Amount</label>
            <input
              type="number"
              value={dueAmount.toFixed(2)}
              readOnly
              className={dueAmount > 0 ? 'due-amount' : ''}
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