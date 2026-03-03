// src/components/purchase/NewPurchase.jsx
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
  const [selectedSupplierVat, setSelectedSupplierVat] = useState('');
  
  // VAT rate constant
  const VAT_RATE = 18;

  const [formData, setFormData] = useState({
    purchase_date: new Date().toLocaleDateString('en-CA'),
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
      unit: ''
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

  // Handle supplier change to get VAT number
  const handleSupplierChange = async (e) => {
    const supplierId = e.target.value;
    setFormData({ ...formData, supplier_id: supplierId });
    
    if (supplierId) {
      try {
        const response = await api.get(`/suppliers/${supplierId}`);
        setSelectedSupplierVat(response.data.vat_number || 'N/A');
      } catch (error) {
        console.error('Error fetching supplier details:', error);
        setSelectedSupplierVat('');
      }
    } else {
      setSelectedSupplierVat('');
    }
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((total, item) => {
      return total + (item.quantity * item.unit_price);
    }, 0);
  };

  const calculateVAT = (subtotal) => {
    return subtotal * (VAT_RATE / 100);
  };

  const calculateTotalWithVAT = (subtotal, vatAmount) => {
    return subtotal + vatAmount;
  };

  // Update calculations whenever items change
  useEffect(() => {
    const subtotal = calculateSubtotal();
    const vatAmount = calculateVAT(subtotal);
    const totalWithVAT = calculateTotalWithVAT(subtotal, vatAmount);
    
    setFormData(prev => ({
      ...prev,
      subtotal,
      vat_amount: vatAmount,
      total_with_vat: totalWithVAT
    }));
  }, [formData.items]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }

    newItems[index][field] = value;

    setFormData({
      ...formData,
      items: newItems
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
      items: [...formData.items, { id: '', item_name: '', quantity: 1, unit_price: 0, unit: '' }]
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
      unit: selectedItem.unit
    };

    setFormData({ ...formData, items: newItems });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
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
      company_id: formData.company_id === '' ? null : formData.company_id
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
    label: `${itm.name} (${itm.item_code || ''})`,
    previousPrice: previousPurchasePrices[itm.id] || 0
  }));

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
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>VAT Number</label>
            <input
              type="text"
              value={selectedSupplierVat}
              readOnly
              className="vat-display"
              placeholder="Auto-filled from supplier"
            />
          </div>
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
        </div>

        {/* Company */}
        <div className="form-row">
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
              <th>Item</th>
              <th>Previous Price</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => {
              const previousPrice = previousPurchasePrices[item.id] || 0;
              
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
                  <td className="previous-price">
                    {previousPrice > 0 ? `Rs. ${previousPrice.toFixed(2)}` : 'No history'}
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
                  <td>Rs. {(item.quantity * item.unit_price).toFixed(2)}</td>
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

        {/* VAT Calculation Section */}
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
            <span>Total (with VAT):</span>
            <span>Rs. {formData.total_with_vat.toFixed(2)}</span>
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
              onChange={(e) => setFormData({
                ...formData, 
                paid_amount: parseFloat(e.target.value) || 0
              })}
              required
            />
          </div>
        </div>

        {/* Summary */}
        <div className="summary">
          <div className="total">
            <strong>Total Bill Amount:</strong>
            <span>Rs. {formData.total_with_vat.toFixed(2)}</span>
          </div>
          <div className="balance">
            <strong>Balance/Due:</strong>
            <span>Rs. {(formData.total_with_vat - formData.paid_amount).toFixed(2)}</span>
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