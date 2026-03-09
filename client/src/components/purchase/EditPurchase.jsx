import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
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
    items: []
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch all required data in parallel
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

        // Find the supplier
        const supplier = suppliersRes.data.find(s => s.id === purchaseData.supplier_id);
        setSelectedSupplier(supplier);
        setSupplierVatRegistered(supplier?.vat_registered || false);
        setSupplierVatNumber(supplier?.vat_number || '');

        // Process items with VAT calculations
        const processedItems = purchaseData.items.map(item => {
          const itemDetails = itemsRes.data.find(i => i.id === item.item_id) || {};
          const amount = parseFloat(item.quantity) * parseFloat(item.unit_price);
          const vat = (supplier?.vat_registered && itemDetails.vat_applicable) ? 
            amount * (VAT_RATE / 100) : 0;
          
          return {
            id: item.item_id,
            item_name: item.item_name,
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unit_price),
            unit: item.unit || itemDetails.unit || '',
            vat_applicable: itemDetails.vat_applicable || false,
            amount: amount,
            vat: vat,
            lineTotal: amount + vat
          };
        });

        // Calculate totals
        const subtotal = processedItems.reduce((sum, item) => sum + item.amount, 0);
        const totalVat = processedItems.reduce((sum, item) => sum + item.vat, 0);
        const grandTotal = subtotal + totalVat;

        setFormData({
          purchase_date: dayjs(purchaseData.purchase_date).format('YYYY-MM-DD'),
          supplier_id: purchaseData.supplier_id,
          subtotal: subtotal,
          vat_amount: totalVat,
          vat_rate: parseFloat(purchaseData.vat_rate) || VAT_RATE,
          total_with_vat: grandTotal,
          paid_amount: parseFloat(purchaseData.paid_amount) || 0,
          payment_method: purchaseData.payment_method,
          check_number: purchaseData.check_number || '',
          remarks: purchaseData.remarks || '',
          company_id: purchaseData.company_id || '',
          items: processedItems,
          due_amount: Math.max(0, grandTotal - (parseFloat(purchaseData.paid_amount) || 0))
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

  // Calculate item values
  const calculateItemValues = (item, supplierVatRegistered) => {
    const amount = item.quantity * item.unit_price;
    let vat = 0;
    
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
    const paidAmount = formData.paid_amount || 0;
    const dueAmount = Math.max(0, grandTotal - paidAmount);
    
    return { subtotal, totalVat, grandTotal, dueAmount };
  };

  const handleSupplierChange = async (e) => {
    const supplierId = parseInt(e.target.value);
    const supplier = suppliers.find(s => s.id === supplierId);
    
    setSelectedSupplier(supplier);
    setSupplierVatRegistered(supplier?.vat_registered || false);
    setSupplierVatNumber(supplier?.vat_number || '');
    
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId
    }));

    // Recalculate all items with new supplier VAT status
    const newItems = formData.items.map(item => {
      const { amount, vat, lineTotal } = calculateItemValues(item, supplier?.vat_registered || false);
      return { ...item, amount, vat, lineTotal };
    });

    const { subtotal, totalVat, grandTotal, dueAmount } = calculateTotals(
      newItems, 
      supplier?.vat_registered || false
    );

    setFormData(prev => ({
      ...prev,
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      due_amount: dueAmount
    }));
  };

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
    const { subtotal, totalVat, grandTotal, dueAmount } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );

    setFormData({
      ...formData,
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      due_amount: dueAmount
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
      unit_price: previousPrice || newItems[index].unit_price || 0,
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
    const { subtotal, totalVat, grandTotal, dueAmount } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );

    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      due_amount: dueAmount
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
    
    // Recalculate totals
    const { subtotal, totalVat, grandTotal, dueAmount } = calculateTotals(
      newItems, 
      supplierVatRegistered
    );
    
    setFormData({ 
      ...formData, 
      items: newItems,
      subtotal,
      vat_amount: totalVat,
      total_with_vat: grandTotal,
      due_amount: dueAmount
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

    if (isSubmitting) return;

    // Validate items
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

    // Prepare data for submission
    const submitData = {
      purchase_date: formData.purchase_date,
      supplier_id: formData.supplier_id,
      items: formData.items.map(item => ({
        item_id: item.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit: item.unit
      })),
      subtotal: formData.subtotal,
      vat_amount: formData.vat_amount,
      vat_rate: VAT_RATE,
      total_with_vat: formData.total_with_vat,
      paid_amount: formData.paid_amount,
      payment_method: formData.payment_method,
      check_number: formData.check_number,
      remarks: formData.remarks,
      prepared_by: currentUser.id,
      company_id: formData.company_id || null
    };

    try {
      const response = await api.put(`/purchases/${id}`, submitData);
      showPopup('success', `Purchase updated successfully! Invoice: ${response.data.invoice_no || response.data.message}`);
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error updating purchase:', error);
      showPopup('error', `Error: ${error.response?.data?.error || 'Server error'}`);
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
            <p className="subtitle">Purchase ID: {id}</p>
          </div>
        </div>
        <div className="header-badge">
          Edit Mode
        </div>
      </div>

      <form onSubmit={handleSubmit} className="purchase-form">
        <div className="form-card">
          <h2>Basic Information</h2>
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
              <label>VAT Number</label>
              <input
                type="text"
                value={supplierVatNumber}
                readOnly
                className="vat-display"
                placeholder={supplierVatRegistered ? "Auto-filled from supplier" : "Supplier not VAT registered"}
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
              <label>Invoice Number</label>
              <input
                type="text"
                value={formData.check_number}
                onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
                placeholder="Enter invoice number"
              />
            </div>

            <div className="form-group full-width">
              <label>Remarks</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows="3"
                placeholder="Add any notes or remarks..."
              />
            </div>
          </div>
        </div>

        <div className="form-card">
          <h2>Purchased Items</h2>

          <div className="items-table-container">
            <table className="items-table">
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
                  const isPriceDifferent = previousPrice > 0 && item.unit_price !== previousPrice;
                  
                  return (
                    <tr key={index}>
                      <td style={{ minWidth: '250px' }}>
                        <Select
                          options={itemOptions}
                          value={itemOptions.find(opt => opt.value === item.id) || null}
                          onChange={(selected) => handleItemSelect(index, selected)}
                          isSearchable
                          placeholder="Select or search item..."
                          className="react-select-container"
                          classNamePrefix="react-select"
                        />
                        {item.vat_applicable && (
                          <small style={{ color: '#28a745', display: 'block', marginTop: '4px' }}>
                            ⚡ VAT Applicable
                          </small>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                          required
                          className="quantity-input"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.unit || ''}
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
                          onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                          required
                          className={`price-input ${isPriceDifferent ? 'price-different' : ''}`}
                        />
                        {isPriceDifferent && (
                          <small style={{ color: '#dc3545', display: 'block' }}>
                            Prev: Rs. {previousPrice.toFixed(2)}
                          </small>
                        )}
                      </td>
                      <td className="text-right">Rs. {item.amount.toFixed(2)}</td>
                      {supplierVatRegistered && (
                        <td className="vat-column text-right">Rs. {item.vat.toFixed(2)}</td>
                      )}
                      <td className="text-right"><strong>Rs. {item.lineTotal.toFixed(2)}</strong></td>
                      <td>
                        <button 
                          type="button" 
                          className="btn-remove-item"
                          onClick={() => removeItemRow(index)}
                          disabled={formData.items.length <= 1}
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

          <button type="button" onClick={addItemRow} className="btn-add-item">
            <FontAwesomeIcon icon={faPlus} />
            Add Item
          </button>

          <div className="vat-summary">
            <div className="vat-row">
              <span>Subtotal (Net Amount):</span>
              <span>Rs. {formData.subtotal.toFixed(2)}</span>
            </div>
            <div className="vat-row">
              <span>Total VAT ({VAT_RATE}%):</span>
              <span>Rs. {formData.vat_amount.toFixed(2)}</span>
            </div>
            <div className="vat-row total">
              <span>Grand Total:</span>
              <span className={formData.total_with_vat > 0 ? 'bold' : ''}>
                Rs. {formData.total_with_vat.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="form-card">
          <h2>Payment Information</h2>
          <div className="payment-section">
            <div className="form-group">
              <label>Paid Amount (Rs.) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.paid_amount}
                onChange={handlePaidAmountChange}
                required
                className="paid-input"
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
              <div className={`info-item due ${formData.due_amount > 0 ? 'negative' : ''}`}>
                <span className="label">Balance Due:</span>
                <span className="value due-amount">
                  Rs. {formData.due_amount.toFixed(2)}
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