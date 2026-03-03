// src/components/purchase/EditPurchase.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import Select from 'react-select';
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
  const [autoAddedRow, setAutoAddedRow] = useState(false);
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // VAT rate (can be made configurable)
  const VAT_RATE = 18.00;

  const [formData, setFormData] = useState({
    purchase_date: new Date().toLocaleDateString('en-CA'),
    supplier_id: '',
    supplier_vat_number: '',
    subtotal: 0,
    vat_amount: 0,
    total_with_vat: 0,
    vat_rate: VAT_RATE,
    bill_amount: 0,
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
      unit: ''
    }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch data in parallel for better performance
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

        // Find selected supplier
        const supplier = suppliersRes.data.find(s => s.id === purchaseData.supplier_id);
        setSelectedSupplier(supplier);

        // Set form data with VAT fields
        setFormData({
          purchase_date: new Date(purchaseData.purchase_date).toLocaleDateString('en-CA'),
          supplier_id: purchaseData.supplier_id,
          supplier_vat_number: supplier?.vat_number || purchaseData.supplier_vat_number || '',
          subtotal: parseFloat(purchaseData.subtotal || 0),
          vat_amount: parseFloat(purchaseData.vat_amount || 0),
          total_with_vat: parseFloat(purchaseData.total_with_vat || purchaseData.bill_amount || 0),
          vat_rate: parseFloat(purchaseData.vat_rate || VAT_RATE),
          bill_amount: parseFloat(purchaseData.bill_amount || 0),
          paid_amount: parseFloat(purchaseData.paid_amount || 0),
          payment_method: purchaseData.payment_method || 'CASH',
          check_number: purchaseData.check_number || '',
          remarks: purchaseData.remarks || '',
          company_id: purchaseData.company_id || '',
          items: purchaseData.items.map(item => ({
            id: item.item_id,
            item_name: item.item_name,
            quantity: parseFloat(item.quantity),
            unit_price: parseFloat(item.unit_price),
            unit: item.unit || ''
          }))
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

  // Recalculate VAT when items change
  useEffect(() => {
    const subtotal = formData.items.reduce((total, item) => {
      return total + (item.quantity * item.unit_price);
    }, 0);
    
    const vatAmount = subtotal * (formData.vat_rate / 100);
    const totalWithVat = subtotal + vatAmount;

    setFormData(prev => ({
      ...prev,
      subtotal: subtotal,
      vat_amount: vatAmount,
      total_with_vat: totalWithVat,
      bill_amount: totalWithVat // Keep bill_amount for backward compatibility
    }));
  }, [formData.items, formData.vat_rate]);

  const handleSupplierChange = (e) => {
    const supplierId = e.target.value;
    const supplier = suppliers.find(s => s.id.toString() === supplierId);
    
    setSelectedSupplier(supplier);
    setFormData({
      ...formData,
      supplier_id: supplierId,
      supplier_vat_number: supplier?.vat_number || ''
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }

    newItems[index][field] = value;

    setFormData({ ...formData, items: newItems });

    // Auto-add new row only when appropriate
    if (field === 'unit_price' && index === formData.items.length - 1 && !autoAddedRow) {
      addItemRow();
      setAutoAddedRow(true);
    }

    if (index !== formData.items.length - 1) {
      setAutoAddedRow(false);
    }
  };

  const handleItemSelect = (index, selectedOption) => {
    if (!selectedOption) return;
    
    const selectedItem = itemsList.find(item => item.id === selectedOption.value);
    if (!selectedItem) return;

    const newItems = [...formData.items];
    const currentUnitPrice = newItems[index].unit_price;
    
    // Only auto-fill previous price if current price is 0
    const newUnitPrice = (currentUnitPrice === 0 || currentUnitPrice === '') 
      ? (previousPurchasePrices[selectedItem.id] || 0)
      : currentUnitPrice;

    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: newUnitPrice,
      unit: selectedItem.unit
    };

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { 
        id: '', 
        item_name: '', 
        quantity: 1, 
        unit_price: 0,
        unit: ''
      }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateItemsTotal = () => {
    return formData.items.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;

    // Prevent double submission within 2 seconds
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

    // Validation
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
      company_id: formData.company_id === '' ? null : formData.company_id
    };

    try {
      await api.put(`/purchases/${id}`, updatedFormData);
      showPopup('success', 'Purchase updated successfully!');
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error updating purchase:', error);
      const errorMessage = error.response?.data?.error || 'Server error';
      showPopup('error', `Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare item options for dropdown
  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''}) - ${itm.unit}`,
    previousPrice: previousPurchasePrices[itm.id] || 0
  }));

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading purchase data...</div>
      </div>
    );
  }

  return (
    <div className="purchase-container">
      <div className="header-with-actions">
        <h2>Edit Purchase</h2>
        <button onClick={() => navigate('/purchase/history')} className="btn-secondary">
          ← Back to History
        </button>
      </div>

      <form onSubmit={handleSubmit} className="purchase-form">
        {/* Basic Info Section */}
        <div className="form-section">
          <h3>Basic Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Purchase Date <span className="required">*</span></label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Supplier <span className="required">*</span></label>
              <select
                value={formData.supplier_id}
                onChange={handleSupplierChange}
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Supplier VAT Number</label>
              <input
                type="text"
                value={formData.supplier_vat_number}
                readOnly
                className="vat-display"
                placeholder="Auto-filled from supplier"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Payment Method <span className="required">*</span></label>
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
              <label>Company <span className="required">*</span></label>
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
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label>Remarks</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows="3"
                placeholder="Enter any additional notes or remarks"
              />
            </div>
          </div>
        </div>

        {/* Items Section */}
        <div className="form-section">
          <h3>Purchased Items</h3>
          <div className="info-note">
            💡 <strong>Note:</strong> When editing, original purchase prices are preserved. 
            Previous prices are shown for reference only.
          </div>
          
          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Item</th>
                  <th style={{ width: '10%' }}>Previous Price</th>
                  <th style={{ width: '10%' }}>Quantity</th>
                  <th style={{ width: '10%' }}>Unit</th>
                  <th style={{ width: '12%' }}>Unit Price (Rs.)</th>
                  <th style={{ width: '12%' }}>Total (Rs.)</th>
                  <th style={{ width: '8%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, index) => {
                  const selectedItem = itemsList.find(itm => itm.id === item.id);
                  const previousPrice = previousPurchasePrices[item.id] || 0;
                  const isPriceDifferent = previousPrice > 0 && item.unit_price !== previousPrice;
                  
                  return (
                    <tr key={index}>
                      <td>
                        <Select
                          options={itemOptions}
                          value={itemOptions.find(opt => opt.value === item.id) || null}
                          onChange={(selected) => handleItemSelect(index, selected)}
                          isSearchable
                          placeholder="Select or search item..."
                          className="item-select"
                        />
                      </td>
                      <td className={`previous-price ${isPriceDifferent ? 'price-different' : ''}`}>
                        {previousPrice > 0 ? `Rs. ${previousPrice.toFixed(2)}` : 'No history'}
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
                          value={item.unit || selectedItem?.unit || ''}
                          readOnly
                          className="unit-display"
                          placeholder="Unit"
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
                          className={`price-input ${isPriceDifferent ? 'current-price-different' : ''}`}
                        />
                        {isPriceDifferent && (
                          <div className="price-change-indicator">
                            Changed from last month
                          </div>
                        )}
                      </td>
                      <td className="item-total">
                        Rs. {(item.quantity * item.unit_price).toFixed(2)}
                      </td>
                      <td>
                        <button 
                          type="button" 
                          className="btn-remove"
                          onClick={() => removeItemRow(index)}
                          disabled={formData.items.length <= 1}
                          title="Remove item"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" className="btn-add-item" onClick={addItemRow}>
            + Add Another Item
          </button>
        </div>

        {/* VAT Calculation Section */}
        <div className="form-section">
          <h3>VAT Calculation</h3>
          <div className="vat-calculation-section">
            <div className="calculation-row">
              <span className="label">1. Subtotal (Without VAT):</span>
              <span className="value">Rs. {formData.subtotal.toFixed(2)}</span>
            </div>
            
            <div className="calculation-row">
              <span className="label">2. VAT Rate:</span>
              <span className="value">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.vat_rate}
                  onChange={(e) => setFormData({
                    ...formData, 
                    vat_rate: parseFloat(e.target.value) || 0
                  })}
                  className="vat-rate-input"
                />%
              </span>
            </div>

            <div className="calculation-row">
              <span className="label">3. VAT Amount ({formData.vat_rate}%):</span>
              <span className="value">Rs. {formData.vat_amount.toFixed(2)}</span>
            </div>
            
            <div className="calculation-row total-row">
              <span className="label">4. Total Amount (With VAT):</span>
              <span className="value">Rs. {formData.total_with_vat.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div className="form-section">
          <h3>Payment Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Paid Amount (Rs.) <span className="required">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  paid_amount: parseFloat(e.target.value) || 0 
                })}
                required
                className="paid-input"
              />
            </div>
          </div>
        </div>

        {/* Summary Section */}
        <div className="summary-section">
          <div className="summary-card">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>Rs. {formData.subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>VAT ({formData.vat_rate}%):</span>
              <span>Rs. {formData.vat_amount.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Total Bill Amount:</span>
              <span>Rs. {formData.total_with_vat.toFixed(2)}</span>
            </div>
            <div className="summary-row paid">
              <span>Paid Amount:</span>
              <span>Rs. {formData.paid_amount.toFixed(2)}</span>
            </div>
            <div className="summary-row balance">
              <span>Balance/Due:</span>
              <span className={formData.total_with_vat - formData.paid_amount > 0 ? 'due-amount' : ''}>
                Rs. {(formData.total_with_vat - formData.paid_amount).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => navigate('/purchase/history')}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Update Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPurchase;