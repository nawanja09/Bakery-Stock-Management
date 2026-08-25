// src/components/purchase/NewPurchase.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faPlus, 
  faTrash,
  faMoneyBillWave,
  faUniversity,
  faCheckCircle,
  faExclamationTriangle,
  faFileInvoice,
  faBuilding,
  faUser,
  faCalendar,
  faPercent,
  faBoxes,
  faShoppingCart
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import './NewPurchase.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import PendingInvoicesSection from './PendingInvoicesSection';

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
  const [pendingRefreshKey, setPendingRefreshKey] = useState(0);
  
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
    payment_status: 'Non-Paid',
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

    if (field === 'quantity' && value > 0 && index === formData.items.length - 1 && !autoAddedRow) {
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

  // Custom components to hide dropdown indicator and separator
  const customSelectComponents = {
    DropdownIndicator: null,
    IndicatorSeparator: null
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = Date.now();
    if (now - lastSubmitTime < 2000) {
      showPopup('warning', 'Please wait a moment before submitting again.');
      return;
    }

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
      
      let successMessage = `Purchase created successfully! Invoice: ${response.data.invoice_no}`;
      
      if (response.data.payment_status === 'Paid') {
        successMessage += ' (Fully Paid)';
      } else if (response.data.payment_status === 'Partially Paid') {
        successMessage += ` (Partially Paid - Balance: ${formatCurrency(formData.balance_amount)})`;
      } else {
        successMessage += ` (Non-Paid - Amount Due: ${formatCurrency(formData.total_with_vat)})`;
      }
      
      showPopup('success', successMessage);
    } catch (error) {
      console.error('Error creating purchase:', error);
      
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

  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`,
    previousPrice: previousPurchasePrices[itm.id] || 0
  }));

  const getPaymentStatusInfo = () => {
    switch(formData.payment_status) {
      case 'Paid':
        return { 
          color: '#10b981', 
          icon: faCheckCircle,
          text: 'Fully Paid',
          bg: '#d1fae5'
        };
      case 'Partially Paid':
        return { 
          color: '#f59e0b', 
          icon: faExclamationTriangle,
          text: 'Partially Paid',
          bg: '#fef3c7'
        };
      default:
        return { 
          color: '#ef4444', 
          icon: faMoneyBillWave,
          text: 'Non-Paid',
          bg: '#fee2e2'
        };
    }
  };

  const paymentInfo = getPaymentStatusInfo();
  const fullTotal = formData.items.reduce(
    (total, item) => total + (parseFloat(item.lineTotal) || 0),
    0
  );

  return (
    <div className="purchase-container">
      <div className="page-header">
          <h1>RM Purchasing Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="purchase-form">
        {/* Basic Information Section */}
        <div className="form-section">
          <div className="section-header">
            <h2>
              <FontAwesomeIcon icon={faFileInvoice} className="section-icon" />
              Basic Information
            </h2>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCalendar} />
                Purchase Date
              </label>
              <input 
                type="date" 
                value={formData.purchase_date}
                onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faFileInvoice} />
                Invoice Number
              </label>
              <input
                type="text"
                value={formData.invoice_no}
                onChange={(e) => setFormData({...formData, invoice_no: e.target.value})}
                placeholder="INV-2024-001"
                className="form-control"
                required
              />
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUser} />
                Supplier
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

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faBuilding} />
                Company
              </label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({...formData, company_id: e.target.value})}
                className="form-control"
                required
              >
                <option value="">Select company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

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
            </div>
          </div>
        </div>

        {/* Items Table Section */}
        <div className="form-section">
          <div className="section-header">
            <h2>
              <FontAwesomeIcon icon={faBoxes} className="section-icon" />
              Purchase Items
            </h2>
          </div>
          
            <div className="items-table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th className="text-left" style={{ width: '35%' }}>Item Name</th>
                    <th className="text-right" style={{ width: '10%' }}>Quantity</th>
                    <th className="text-center" style={{ width: '8%' }}>Unit</th>
                    <th className="text-right" style={{ width: '15%' }}>Unit Price (Net)</th>
                    <th className="text-right" style={{ width: '12%' }}>Amount</th>
                    {supplierVatRegistered && <th className="text-right" style={{ width: '10%' }}>VAT 18%</th>}
                    <th className="text-right" style={{ width: '12%' }}>Line Total</th>
                    <th className="text-center" style={{ width: '8%' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => {
                    const selectedOption = item.id ? itemOptions.find(opt => String(opt.value) === String(item.id)) : null;
                    const previousPrice = previousPurchasePrices[item.id] || 0;
                    
                    return (
                      <tr key={index}>
                        <td>
                          <Select
                            options={itemOptions}
                            value={itemOptions.find(opt => String(opt.value) === String(item.id)) || null}
                            onChange={(selected) => handleItemSelect(index, selected)}
                            isSearchable
                            placeholder="Select item..."
                            className="react-select-container"
                            classNamePrefix="react-select"
                            components={customSelectComponents}
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
                              Prev: {formatCurrency(previousPrice)}
                            </small>
                          )}
                        </td>
                        <td className="text-right">{formatCurrency(item.amount)}</td>
                        {supplierVatRegistered && (
                          <td className="text-right vat-column">
                            {item.vat_applicable ? formatCurrency(item.vat) : '-'}
                          </td>
                        )}
                        <td className="text-right">
                          <strong>{formatCurrency(item.lineTotal)}</strong>
                        </td>
                        <td className="text-center">
                          <button 
                            type="button" 
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => removeItemRow(index)}
                            disabled={formData.items.length <= 1}
                            title="Remove item"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="full-total-row">
                    <td colSpan={supplierVatRegistered ? 6 : 5} className="text-right">
                      <strong>Full Total:</strong>
                    </td>
                    <td className="text-right full-total-value">
                      <strong>{formatCurrency(fullTotal)}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={addItemRow}
          >
          <FontAwesomeIcon icon={faPlus} />
            Add New Item
          </button>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isSubmitting}
          >
            <FontAwesomeIcon icon={faSave} />
            {isSubmitting ? 'Creating...' : 'Create Purchase'}
          </button>
        </div>

        <PendingInvoicesSection
          supplierId={formData.supplier_id}
          supplierName={selectedSupplier?.name || ''}
          suppliers={suppliers}
          companies={companies}
          refreshKey={pendingRefreshKey}
        />

      </form>
    </div>
  );
};

export default AddPurchase;