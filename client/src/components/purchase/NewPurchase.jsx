//src/components/purchase/NewPurchase.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';

const AddPurchase = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    bill_amount: 0,
    paid_amount: 0,
    payment_method: 'CASH',
    remarks: '',
    items: [
      { item_name: '', quantity: 1, unit_price: 0 }
    ]
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    setCurrentUser(user);
    
    const fetchSuppliers = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/suppliers');
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        const data = await response.json();
        setSuppliers(data);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        alert(`Error loading suppliers: ${error.message}`);
      }
    };
    
    fetchSuppliers();
  }, []);

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
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
    
    // Check if user is available
    if (!currentUser || !currentUser.id) {
      alert('User information is missing. Please login again.');
      navigate('/login');
      return;
    }
    
    // Update form data with user ID
    const updatedFormData = {
      ...formData,
      bill_amount: calculateTotal(),
      prepared_by: currentUser.id // Add user ID here
    };

    try {
      const response = await fetch('http://localhost:5000d/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFormData)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Purchase created successfully! Invoice: ${result.invoice_no}`);
        navigate('/purchase/history');
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
      alert('Server error');
    }
  };

  return (
    <div className="container">
      {/* Add back button at the top */}
      <button 
        onClick={() => navigate('/dashboard')}
        className="btn-back"
        style={{ marginBottom: '20px' }}
      >
        <FontAwesomeIcon icon={faArrowLeft} /> Back to Dashboard
      </button>

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
            <label>Paid Amount (Rs.)</label>
            <input 
              type="number"
              min="0"
              step="0.01"
              value={formData.paid_amount}
              onChange={(e) => setFormData({...formData, paid_amount: parseFloat(e.target.value)})}
              required
            />
          </div>
        </div>
        
        <div className="form-group">
          <label>Remarks</label>
          <textarea 
            value={formData.remarks}
            onChange={(e) => setFormData({...formData, remarks: e.target.value})}
          />
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
                  <input
                    type="text"
                    value={item.item_name}
                    onChange={(e) => handleItemChange(index, 'item_name', e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0.001"
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