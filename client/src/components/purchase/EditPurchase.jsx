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

  const [formData, setFormData] = useState({
    purchase_date: new Date().toLocaleDateString('en-CA'),
    supplier_id: '',
    bill_amount: 0,
    paid_amount: 0,
    payment_method: 'CASH',
    check_number: '',
    remarks: '',
    company_id: '',
    items: [{ id: '', item_name: '', quantity: 1, unit_price: 0 }]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchData = async () => {
      try {
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

        // Set form data - IMPORTANT: Use original purchase prices, NOT previous prices
        setFormData({
          purchase_date: new Date(purchaseData.purchase_date).toLocaleDateString('en-CA'),
          supplier_id: purchaseData.supplier_id,
          bill_amount: purchaseData.bill_amount,
          paid_amount: purchaseData.paid_amount,
          payment_method: purchaseData.payment_method,
          check_number: purchaseData.check_number || '',
          remarks: purchaseData.remarks || '',
          company_id: purchaseData.company_id || '',
          items: purchaseData.items.map(item => ({
            id: item.item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price // Use original unit_price from purchase
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

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }

    newItems[index][field] = value;
    
    // Calculate total for the item
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
    }

    setFormData({ ...formData, items: newItems });

    // Auto-add new row only for new purchases, not for edits
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

    // For EDIT mode: Only use previous price if the current unit_price is 0 or not set
    const newItems = [...formData.items];
    const currentUnitPrice = newItems[index].unit_price;
    
    // Only auto-fill previous price if current price is 0 or empty
    const newUnitPrice = (currentUnitPrice === 0 || currentUnitPrice === '') 
      ? (previousPurchasePrices[selectedItem.id] || 0)
      : currentUnitPrice;

    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: newUnitPrice
    };

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: '', item_name: '', quantity: 1, unit_price: 0 }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => total + (item.quantity * item.unit_price), 0).toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (formData.items.some(item => !item.id)) {
      showPopup('error', 'Please select valid items for all rows');
      return;
    }

    if (!currentUser || !currentUser.id) {
      showPopup('error', 'User information is missing. Please login again.');
      navigate('/login');
      return;
    }

    const updatedFormData = {
      ...formData,
      bill_amount: calculateTotal(),
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
    }
  };

  // Prepare item options for dropdown
  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`,
    previousPrice: previousPurchasePrices[itm.id] || 0
  }));

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="new-purchase-container">
      <div className="header-with-actions">
        <h2>Edit Purchase</h2>
        <button onClick={() => navigate('/purchase/history')} className="btn-secondary">
          ← Back to History
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div className="form-row">
          <div className="form-group">
            <label>Purchase Date</label>
            <input
              type="date"
              value={formData.purchase_date}
              onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Supplier</label>
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              required
            >
              <option value="">Select Supplier</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Payment Method</label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              required
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
        </div>

        {/* Company & Invoice */}
        <div className="form-row">
          <div className="form-group">
            <label>Company</label>
            <select
              value={formData.company_id}
              onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
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

          <div className="form-group">
            <label>Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            />
          </div>
        </div>

        {/* Purchased Items */}
        <h3>Purchased Items</h3>
        <div className="info-note">
          💡 <strong>Note:</strong> When editing, original purchase prices are preserved. 
          Previous month's prices are shown for reference only.
        </div>
        
        <table className="item-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Last Month Price (Rs.)</th>
              <th>Quantity</th>
              <th>Unit Price (Rs.)</th>
              <th>Total (Rs.)</th>
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
                    />
                  </td>
                  <td className={isPriceDifferent ? 'price-different' : ''}>
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
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                      required
                      className={isPriceDifferent ? 'current-price-different' : ''}
                    />
                    {isPriceDifferent && (
                      <div className="price-change-indicator">
                        Price changed from last month
                      </div>
                    )}
                  </td>
                  <td>{(item.quantity * item.unit_price).toFixed(2)}</td>
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

        {/* Payment */}
        <div className="form-row">
          <div className="form-group">
            <label>Paid Amount (Rs.)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.paid_amount}
              onChange={(e) => setFormData({ ...formData, paid_amount: parseFloat(e.target.value) || 0 })}
              required
            />
          </div>
        </div>

        {/* Summary */}
        <div className="summary">
          <div className="total">
            <strong>Total Bill Amount:</strong>
            <span>Rs. {calculateTotal()}</span>
          </div>
          <div className="balance">
            <strong>Balance/Due:</strong>
            <span>Rs. {(calculateTotal() - formData.paid_amount).toFixed(2)}</span>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/purchase/history')}>
            Cancel
          </button>
          <button type="submit" className="btn-submit">Update Purchase</button>
        </div>
      </form>
    </div>
  );
};

export default EditPurchase;

// src/controllers/purchaseController.js