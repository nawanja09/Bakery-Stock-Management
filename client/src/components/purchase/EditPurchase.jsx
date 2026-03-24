// src/components/purchase/EditPurchase.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlus, faTrash, faMoneyBillWave, faCreditCard, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import './Purchase.css';

const EditPurchase = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierVatRegistered, setSupplierVatRegistered] = useState(false);
  const [supplierVatNumber, setSupplierVatNumber] = useState('');
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  
  const VAT_RATE = 18;

  const [formData, setFormData] = useState({
    purchase_date: '',
    invoice_no: '',
    supplier_id: '',
    subtotal: 0,
    vat_amount: 0,
    vat_rate: VAT_RATE,
    total_with_vat: 0,
    paid_amount: 0,
    balance_amount: 0,
    balance_status: 0,
    payment_status: 'Non-Paid',
    payment_method: 'CASH',
    check_number: '',
    remarks: '',
    company_id: '',
    items: []
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [purchaseRes, suppliersRes, itemsRes, companiesRes, previousPricesRes] = await Promise.all([
          api.get(`/purchases/${id}`),
          api.get('/suppliers'),
          api.get('/items'),
          api.get('/purchases/companies'),
          api.get('/purchases/previous-prices')
        ]);

        const purchaseData = purchaseRes.data;
        
        setSuppliers(suppliersRes.data);
        setItemsList(itemsRes.data);
        setCompanies(companiesRes.data);
        setPreviousPurchasePrices(previousPricesRes.data);

        const supplier = suppliersRes.data.find(s => s.id === purchaseData.supplier_id);
        setSelectedSupplier(supplier);
        setSupplierVatRegistered(supplier?.vat_registered || false);
        setSupplierVatNumber(supplier?.vat_number || '');

        let processedItems = [];
        
        if (purchaseData.items && purchaseData.items.length > 0) {
          processedItems = purchaseData.items.map(item => {
            const itemDetails = itemsRes.data.find(i => i.id === item.item_id) || {};
            const quantity = parseFloat(item.quantity) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const amount = quantity * unitPrice;
            const vat = (supplier?.vat_registered && (item.vat_applicable || itemDetails.vat_applicable)) ? 
              amount * (VAT_RATE / 100) : 0;
            
            return {
              id: item.item_id,
              item_name: item.item_name || itemDetails.name || '',
              quantity: quantity,
              unit_price: unitPrice,
              unit: item.unit || itemDetails.unit || '',
              vat_applicable: item.vat_applicable || itemDetails.vat_applicable || false,
              amount: amount,
              vat: vat,
              lineTotal: amount + vat
            };
          });
        } else {
          processedItems = [{
            id: '',
            item_name: '',
            quantity: 1,
            unit_price: 0,
            unit: '',
            vat_applicable: false,
            amount: 0,
            vat: 0,
            lineTotal: 0
          }];
        }

        const subtotal = processedItems.reduce((sum, item) => sum + item.amount, 0);
        const totalVat = processedItems.reduce((sum, item) => sum + item.vat, 0);
        const grandTotal = subtotal + totalVat;
        const paidAmount = parseFloat(purchaseData.paid_amount) || 0;
        const balanceAmount = Math.max(0, grandTotal - paidAmount);
        const balanceStatus = balanceAmount > 0 ? 1 : 0;

        setFormData({
          purchase_date: dayjs(purchaseData.purchase_date).format('YYYY-MM-DD'),
          invoice_no: purchaseData.invoice_no || '',
          supplier_id: purchaseData.supplier_id,
          subtotal: subtotal,
          vat_amount: totalVat,
          vat_rate: parseFloat(purchaseData.vat_rate) || VAT_RATE,
          total_with_vat: grandTotal,
          paid_amount: paidAmount,
          balance_amount: balanceAmount,
          balance_status: balanceStatus,
          payment_status: purchaseData.payment_status || 'Non-Paid',
          payment_method: purchaseData.payment_method || 'CASH',
          check_number: purchaseData.check_number || '',
          remarks: purchaseData.remarks || '',
          company_id: purchaseData.company_id || '',
          items: processedItems
        });

        setLoading(false);
      } catch (error) {
        console.error('Error fetching purchase data:', error);
        showPopup('error', 'Failed to load purchase data');
        navigate('/purchase/history');
      }
    };

    fetchData();
  }, [id, navigate, showPopup]);

  // Calculate payment status whenever paid_amount or total changes
  useEffect(() => {
    const total = formData.total_with_vat;
    const paid = formData.paid_amount;
    
    let paymentStatus = 'Non-Paid';
    let balanceStatus = 0;
    
    if (paid >= total && total > 0) {
      paymentStatus = 'Paid';
      balanceStatus = 0;
    } else if (paid > 0 && paid < total) {
      paymentStatus = 'Partially Paid';
      balanceStatus = 1;
    } else {
      paymentStatus = 'Non-Paid';
      balanceStatus = total > 0 ? 1 : 0;
    }
    
    const balance = Math.max(0, total - paid);
    
    setFormData(prev => ({
      ...prev,
      balance_amount: balance,
      balance_status: balanceStatus,
      payment_status: paymentStatus
    }));
    
  }, [formData.paid_amount, formData.total_with_vat]);

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
  };

  const handleItemSelect = (index, selectedOption) => {
    if (!selectedOption) {
      // Clear the item selection
      const newItems = [...formData.items];
      newItems[index] = {
        ...newItems[index],
        id: '',
        item_name: '',
        unit: '',
        vat_applicable: false,
        unit_price: 0,
        amount: 0,
        vat: 0,
        lineTotal: 0
      };
      
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
      return;
    }
    
    const selectedItem = itemsList.find(item => item.id === selectedOption.value);
    if (!selectedItem) return;

    const previousPrice = previousPurchasePrices[selectedItem.id] || 0;

    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: previousPrice > 0 ? previousPrice : newItems[index].unit_price,
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

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) {
      showPopup('warning', 'At least one item is required');
      return;
    }
    
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
    
    if (paidAmount > formData.total_with_vat) {
      showPopup('warning', `Paid amount cannot exceed total bill amount (${formatCurrency(formData.total_with_vat)})`);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      paid_amount: paidAmount
    }));
  };

  const setFullPayment = () => {
    setFormData(prev => ({
      ...prev,
      paid_amount: prev.total_with_vat
    }));
  };

  const setNoPayment = () => {
    setFormData(prev => ({
      ...prev,
      paid_amount: 0
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!formData.invoice_no.trim()) {
      showPopup('error', 'Invoice number is required');
      return;
    }

    if (!formData.supplier_id) {
      showPopup('error', 'Please select a supplier');
      return;
    }

    if (!formData.company_id) {
      showPopup('error', 'Please select a company');
      return;
    }

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
      const response = await api.put(`/purchases/${id}`, submitData);
      
      let successMessage = `Purchase updated successfully! Invoice: ${response.data.invoice_no}`;
      
      if (formData.payment_status === 'Paid') {
        successMessage += ' (Fully Paid)';
      } else if (formData.payment_status === 'Partially Paid') {
        successMessage += ` (Partially Paid - Balance: ${formatCurrency(formData.balance_amount)})`;
      }
      
      showPopup('success', successMessage);
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error updating purchase:', error);
      
      if (error.response?.data?.error?.includes('Invoice number already exists')) {
        showPopup('error', 'This invoice number already exists. Please use a different number.');
      } else {
        showPopup('error', error.response?.data?.error || 'Server error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  // Create item options for react-select with proper formatting
  const itemOptions = itemsList.map(item => ({
    value: item.id,
    label: `${item.item_code} - ${item.name} ${item.vat_applicable ? '(VAT)' : ''}`,
    unit: item.unit,
    vat_applicable: item.vat_applicable,
    previousPrice: previousPurchasePrices[item.id] || 0
  }));

  const getPaymentStatusInfo = () => {
    switch(formData.payment_status) {
      case 'Paid':
        return { 
          color: '#28a745', 
          icon: faCheckCircle,
          text: 'Fully Paid',
          bg: '#d4edda'
        };
      case 'Partially Paid':
        return { 
          color: '#fd7e14', 
          icon: faExclamationTriangle,
          text: 'Partially Paid',
          bg: '#fff3cd'
        };
      default:
        return { 
          color: '#dc3545', 
          icon: faMoneyBillWave,
          text: 'Non-Paid',
          bg: '#f8d7da'
        };
    }
  };

  const paymentInfo = getPaymentStatusInfo();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading purchase data...</p>
      </div>
    );
  }

  return (
    <div className="purchase-form-container">
      <div className="page-header">
        <div className="header-title">
          <button onClick={() => navigate('/purchase/history')} className="back-button">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <div>
            <h1>Edit Purchase</h1>
            <p className="subtitle">Invoice: {formData.invoice_no}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="purchase-form">
        {/* Basic Information Section */}
        <div className="form-card">
          <h3>Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Purchase Date *</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
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

            <div className="form-group">
              <label>Invoice Number *</label>
              <input
                type="text"
                value={formData.invoice_no}
                onChange={(e) => setFormData({ ...formData, invoice_no: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>VAT Number</label>
              <input
                type="text"
                value={supplierVatNumber}
                readOnly
                className="vat-display"
              />
            </div>

            <div className="form-group">
              <label>Payment Method *</label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                required
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <div className="form-group">
              <label>Company *</label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                required
              >
                <option value="">Select Company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Reference/Check Number</label>
              <input
                type="text"
                value={formData.check_number}
                onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
              />
            </div>

            <div className="form-group full-width">
              <label>Remarks</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows="3"
              />
            </div>
          </div>
        </div>

        {/* Purchase Items Section */}
        <div className="form-card">
          <h3>Purchase Items</h3>

          <div className="items-table-container">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Item Name</th>
                  <th style={{ width: '10%' }}>Quantity</th>
                  <th style={{ width: '8%' }}>Unit</th>
                  <th style={{ width: '15%' }}>Unit Price (Net)</th>
                  <th style={{ width: '12%' }}>Amount</th>
                  {supplierVatRegistered && <th style={{ width: '10%' }}>VAT 18%</th>}
                  <th style={{ width: '12%' }}>Line Total</th>
                  <th style={{ width: '8%' , textAlign: 'center'}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, index) => {
                  const selectedOption = item.id ? itemOptions.find(opt => opt.value === item.id) : null;
                  const previousPrice = previousPurchasePrices[item.id] || 0;
                  
                  return (
                    <tr key={index}>
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
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          required
                          className="quantity-input"
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
                          <small style={{ display: 'block', fontSize: '11px', color: '#6c757d' }}>
                            Prev: Rs.{previousPrice}
                          </small>
                        )}
                      </td>
                      <td className="text-right">Rs. {item.amount.toFixed(2)}</td>
                      {supplierVatRegistered && (
                        <td className="text-right vat-column">
                          {item.vat_applicable ? `Rs. ${item.vat.toFixed(2)}` : '-'}
                        </td>
                      )}
                      <td className="text-right">
                        <strong>Rs. {item.lineTotal.toFixed(2)}</strong>
                      </td>
                      <td className="action-cell">
                        <button 
                          type="button" 
                          className="btn-delete-item"
                          onClick={() => removeItemRow(index)}
                          disabled={formData.items.length <= 1}
                          title="Remove this item"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Item Button - Positioned below table on the left */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
            <button type="button" className="btn-add-item" onClick={addItemRow}>
              <FontAwesomeIcon icon={faPlus} /> Add Item
            </button>
          </div>

          <div className="vat-summary">
            <div className="vat-row">
              <span>Subtotal:</span>
              <span>Rs. {formData.subtotal.toFixed(2)}</span>
            </div>
            <div className="vat-row">
              <span>VAT ({VAT_RATE}%):</span>
              <span>Rs. {formData.vat_amount.toFixed(2)}</span>
            </div>
            <div className="vat-row total">
              <span>Grand Total:</span>
              <span>Rs. {formData.total_with_vat.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Information Section */}
        <div className="form-card">
          <h3>Payment Information</h3>
          
          <div className="payment-status-banner" style={{
            background: paymentInfo.bg,
            border: `1px solid ${paymentInfo.color}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FontAwesomeIcon icon={paymentInfo.icon} style={{ color: paymentInfo.color, fontSize: '24px' }} />
              <div>
                <div style={{ fontWeight: '600', color: paymentInfo.color, fontSize: '16px' }}>
                  {paymentInfo.text}
                </div>
                <div style={{ color: '#6c757d', fontSize: '14px' }}>
                  Total: {formatCurrency(formData.total_with_vat)} | 
                  Paid: {formatCurrency(formData.paid_amount)} | 
                  Balance: {formatCurrency(formData.balance_amount)}
                </div>
              </div>
            </div>
            <div>
              <span className={`payment-badge ${formData.payment_status?.toLowerCase().replace(' ', '-')}`}>
                {formData.payment_status}
              </span>
            </div>
          </div>

          <div className="payment-section">
            <div className="form-group">
              <label>Paid Amount (Rs.) *</label>
              <div className="amount-input-group" style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.paid_amount}
                  onChange={handlePaidAmountChange}
                  required
                  style={{ flex: 1 }}
                />
                <button 
                  type="button" 
                  className="btn-small"
                  onClick={setFullPayment}
                  style={{ 
                    background: '#28a745', 
                    color: 'white',
                    border: 'none',
                    padding: '0 12px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Full
                </button>
                <button 
                  type="button" 
                  className="btn-small"
                  onClick={setNoPayment}
                  style={{ 
                    background: '#6c757d', 
                    color: 'white',
                    border: 'none',
                    padding: '0 12px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  None
                </button>
              </div>
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

            <div className="balance-info">
              <div className="info-item">
                <span className="label">Total Bill:</span>
                <span className="value">Rs. {formData.total_with_vat.toFixed(2)}</span>
              </div>
              <div className="info-item">
                <span className="label">Paid:</span>
                <span className="value">Rs. {formData.paid_amount.toFixed(2)}</span>
              </div>
              <div className="info-item">
                <span className="label">Balance:</span>
                <span className={`value ${formData.balance_amount > 0 ? 'due-amount' : ''}`}>
                  Rs. {formData.balance_amount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => navigate('/purchase/history')} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            <FontAwesomeIcon icon={faSave} />
            {isSubmitting ? 'Updating...' : 'Update Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPurchase;