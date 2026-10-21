// src/components/purchase/EditPurchase.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlus, faTrash, faMoneyBillWave, faCreditCard, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import './NewPurchase.css';
import {
  purchaseItemSelectComponents,
  purchaseItemSelectStyles
} from './PurchaseItemSelect';
import { fetchVatRate, DEFAULT_VAT_RATE } from '../../utils/vatRate';
import { formatPurchasingCurrency as formatCurrency } from '../../utils/formatters';

// props.embeddedId / props.onSaved / props.onCancel are optional.
// When absent (standalone route usage via /purchase/edit/:id), behavior is unchanged.
const EditPurchase = ({ embeddedId, onSaved, onCancel, isRmAdjustment = false } = {}) => {
  const params = useParams();
  const id = embeddedId || params.id;
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  const goBack = () => (onCancel ? onCancel() : navigate('/purchase/history'));
  const goAfterSave = () => (onSaved ? onSaved() : navigate('/purchase/history'));

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
  
  // Fallback only - an existing purchase keeps its own stored vat_rate; this is
  // just the management-configured default (client/src/utils/vatRate.js), not a
  // hardcoded 18, used when a purchase has none.
  const [VAT_RATE, setVatRate] = useState(DEFAULT_VAT_RATE);

  const [formData, setFormData] = useState({
    purchase_date: '',
    invoice_date: '',
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
        
        const [purchaseRes, suppliersRes, itemsRes, companiesRes, previousPricesRes, defaultVatRate] = await Promise.all([
          api.get(`/purchases/${id}`),
          api.get('/suppliers'),
          api.get('/items'),
          api.get('/purchases/companies'),
          api.get('/purchases/previous-prices'),
          fetchVatRate()
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

        // This invoice keeps the rate it was created with; the fetched setting is
        // only the fallback for an old record saved before vat_rate existed.
        const effectiveVatRate = parseFloat(purchaseData.vat_rate) || defaultVatRate;
        setVatRate(effectiveVatRate);

        let processedItems = [];

        if (purchaseData.items && purchaseData.items.length > 0) {
          processedItems = purchaseData.items.map(item => {
            const itemDetails = itemsRes.data.find(i => i.id === item.item_id) || {};
            const quantity = parseFloat(item.quantity) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const amount = quantity * unitPrice;
            const vat = (supplier?.vat_registered && (item.vat_applicable || itemDetails.vat_applicable)) ?
              amount * (effectiveVatRate / 100) : 0;
            
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
          invoice_date: purchaseData.invoice_date ? dayjs(purchaseData.invoice_date).format('YYYY-MM-DD') : '',
          invoice_no: purchaseData.invoice_no || '',
          supplier_id: purchaseData.supplier_id,
          subtotal: subtotal,
          vat_amount: totalVat,
          vat_rate: effectiveVatRate,
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
        goBack();
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
      const response = await api.put(`/purchases/${id}`, submitData, {
        headers: isRmAdjustment ? { 'X-RM-Adjustment': 'true' } : undefined
      });
      
      let successMessage = `Purchase updated successfully! Invoice: ${response.data.invoice_no}`;
      
      if (formData.payment_status === 'Paid') {
        successMessage += ' (Fully Paid)';
      } else if (formData.payment_status === 'Partially Paid') {
        successMessage += ` (Partially Paid - Balance: ${formatCurrency(formData.balance_amount)})`;
      }
      
      showPopup('success', successMessage);
      goAfterSave();
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

  // Create item options for react-select with proper formatting
  const itemOptions = itemsList.map(item => ({
    value: item.id,
    label: `${item.name}${item.item_code ? ` (${item.item_code})` : ''}`,
    name: item.name,
    item_code: item.item_code,
    unit: item.unit,
    current_stock: item.current_stock ?? item.stock_quantity ?? item.stock ?? item.available_stock,
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
  const fullTotal = formData.items.reduce(
    (total, item) => total + (parseFloat(item.lineTotal) || 0),
    0
  );

  if (loading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="loading-spinner"></div>
        <p>Loading purchase data...</p>
      </div>
    );
  }

  return (
    <div className="purchase-form-container erp-purchase-page">
      <div className="page-header">
        <div className="header-title">
          {!embeddedId && (
            <button onClick={goBack} className="back-button">
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
          )}
           <h1>Edit RM Purchase Invoice</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="purchase-form">
        {/* Basic Information Section */}
        <div className="form-card">
          <h3>Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Purchase Date - Delivery Date *</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Invoice Date</label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
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
          </div>
        </div>

        {/* Purchase Items Section */}
        <div className="form-card">
          <h3>Purchase Items</h3>

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
                          isClearable
                          placeholder="Search or select item..."
                          className="purchase-item-select"
                          classNamePrefix="react-select"
                          components={purchaseItemSelectComponents}
                          styles={purchaseItemSelectStyles}
                          menuPlacement="auto"
                          closeMenuOnSelect
                          blurInputOnSelect
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
                          step="0.0001"
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
                          min="0.0001"
                          step="0.0001"
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
                      <td className="text-center action-cell">
                        <button 
                          type="button" 
                          className="btn btn-outline-danger btn-sm"
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

          {/* Add Item Button - Positioned below table on the left */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-secondary" onClick={addItemRow}>
              <FontAwesomeIcon icon={faPlus} /> Add Item
            </button>
          </div>

          <div className="vat-summary">
            <div className="vat-row">
              <span>Subtotal:</span>
              <span>{formatCurrency(formData.subtotal)}</span>
            </div>
            <div className="vat-row">
              <span>VAT ({VAT_RATE}%):</span>
              <span>{formatCurrency(formData.vat_amount)}</span>
            </div>
            <div className="vat-row total">
              <span>Grand Total:</span>
              <span>{formatCurrency(formData.total_with_vat)}</span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={goBack} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            <FontAwesomeIcon icon={faSave} />
            {isSubmitting ? 'Updating...' : 'Update Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPurchase;
