// src/components/purchase/EditPurchase.jsx
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
  const [selectedSupplierVat, setSelectedSupplierVat] = useState('');
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

        // Get supplier VAT number
        const supplier = suppliersRes.data.find(s => s.id === purchaseData.supplier_id);
        setSelectedSupplierVat(supplier?.vat_number || 'N/A');

        // Set form data with VAT fields
        setFormData({
          purchase_date: dayjs(purchaseData.purchase_date).format('YYYY-MM-DD'),
          supplier_id: purchaseData.supplier_id,
          subtotal: parseFloat(purchaseData.subtotal || purchaseData.bill_amount) || 0,
          vat_amount: parseFloat(purchaseData.vat_amount) || 0,
          vat_rate: parseFloat(purchaseData.vat_rate) || VAT_RATE,
          total_with_vat: parseFloat(purchaseData.total_with_vat || purchaseData.bill_amount) || 0,
          paid_amount: parseFloat(purchaseData.paid_amount) || 0,
          payment_method: purchaseData.payment_method,
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

  // Calculate VAT when items change
  useEffect(() => {
    const subtotal = formData.items.reduce((total, item) => {
      return total + (item.quantity * item.unit_price);
    }, 0);
    
    const vatAmount = subtotal * (VAT_RATE / 100);
    const totalWithVAT = subtotal + vatAmount;
    
    setFormData(prev => ({
      ...prev,
      subtotal,
      vat_amount: vatAmount,
      total_with_vat: totalWithVAT
    }));
  }, [formData.items]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = parseFloat(value) || 0;
    setFormData({ ...formData, items: newItems });
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
      unit_price: newItems[index].unit_price || previousPrice, // Keep existing price or use previous
      unit: selectedItem.unit
    };

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: '', item_name: '', quantity: 1, unit_price: 0, unit: '' }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();

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
      showPopup('error', `Error: ${error.response?.data?.error || 'Server error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemOptions = itemsList.map(itm => ({
    value: itm.id,
    label: `${itm.name} (${itm.item_code || ''})`
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
            <p className="subtitle">Invoice: {formData.invoice_no}</p>
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
              <label>VAT Number</label>
              <input
                type="text"
                value={selectedSupplierVat}
                readOnly
                className="vat-display"
              />
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
              </select>
            </div>

            <div className="form-group">
              <label>Company</label>
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

          <button type="button" onClick={addItemRow} className="btn-add-item">
            <FontAwesomeIcon icon={faPlus} />
            Add Item
          </button>

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
        </div>

        <div className="form-card">
          <h2>Payment Information</h2>
          <div className="payment-section">
            <div className="form-group">
              <label>Paid Amount (Rs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: parseFloat(e.target.value) || 0 })}
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
              <div className="info-item due">
                <span className="label">Balance Due:</span>
                <span className="value">Rs. {(formData.total_with_vat - formData.paid_amount).toFixed(2)}</span>
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