//src/components/purchase/NewPurchase.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Purchase.css'; 
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const AddPurchase = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]); // For item dropdown
  const [companies, setCompanies] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { showPopup } = usePopup();
  const [formData, setFormData] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    bill_amount: 0,
    paid_amount: 0,
    payment_method: 'CASH',
    remarks: '',
    company_id : '',   // ✅ new field
    items: [
      { id: '', item_name: '', quantity: 1, unit_price: 0 }
    ]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);

    const fetchSuppliers = async () => {
      try {
        const response = await api.get('/suppliers');
        setSuppliers(response.data);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        alert(`Error loading suppliers: ${error.message}`);
      }
    };

    const fetchItems = async () => {
      try {
        const response = await api.get('/items');
        setItemsList(response.data);
      } catch (error) {
        console.error('Error fetching items:', error);
        alert(`Error loading items: ${error.message}`);
      }
    };

    // ✅ Added fetchCompanies function
    const fetchCompanies = async () => {
      try {
        const response = await api.get('/purchases/companies');
        setCompanies(response.data);
      } catch (error) {
        console.error('Error fetching companies:', error);
        alert(`Error loading companies: ${error.message}`);
      }
    };

    fetchSuppliers();
    fetchItems();
    fetchCompanies(); // ✅ Call the function
  }, []);  

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    // Convert to number for numeric fields
    if (field === 'quantity' || field === 'unit_price') {
      value = parseFloat(value) || 0;
    }
    
    newItems[index][field] = value;
    
    // Calculate total price if quantity or price changes
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
    }
    
    setFormData({
      ...formData,
      items: newItems
    });
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { item_name: '', quantity: 1, unit_price: 0 }
      ]
    });
  };

  // Create a new handler for item selection
  const handleItemSelect = (index, itemId) => {
    const selectedItem = itemsList.find(item => item.id === parseInt(itemId));
    if (!selectedItem) return;

    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      id: selectedItem.id,
      item_name: selectedItem.name,
      unit_price: selectedItem.purchase_price || 0
    };
    
    setFormData({ ...formData, items: newItems });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => {
      return total + (item.quantity * item.unit_price);
    }, 0).toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all items have IDs
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
      const response = await api.post('/purchases', updatedFormData);
      // Axios puts response data in response.data
      showPopup('success', `Purchase created successfully! Invoice: ${response.data.invoice_no}`);
      navigate('/purchase/history');
    } catch (error) {
      console.error('Error creating purchase:', error);
      // Axios error response is in error.response.data
      const errorMessage = error.response?.data?.error || 'Server error';
      showPopup('error', `Error: ${errorMessage}`);
    }
  };

  return (
    <div className="new-purchase-container">
      <h2>Add New Purchase</h2>
      <form onSubmit={handleSubmit}>
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
              onChange={(e) => setFormData({...formData, supplier_id: e.target.value})}
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
            <label>Payment Method</label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
              required
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CREDIT">Credit</option>
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
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Remarks</label>
              <textarea 
                value={formData.remarks}
                onChange={(e) => setFormData({...formData, remarks: e.target.value})}
              />
          </div>
        </div>

        <h3>Purchased Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit Price (Rs.)</th>
              <th>Total (Rs.)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={item.id}
                    onChange={(e) => handleItemSelect(index, e.target.value)}
                    required
                  >
                    <option value="">Select Item</option>
                    {itemsList.map((itm) => (
                      <option key={itm.id} value={itm.id}>
                        {itm.name}
                      </option>
                    ))}
                  </select>
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
                  />
                </td>
                <td>{(item.quantity * item.unit_price).toFixed(2)}</td>
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
            ))}
          </tbody>
        </table>
        
        <button 
          type="button" 
          className="btn-add"
          onClick={addItemRow}
        >
          + Add Item
        </button>
        
        <div className="form">
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
        
        <button type="submit" className="btn-submit">Save Purchase</button>
      </form>
    </div>
  );
};

export default AddPurchase;