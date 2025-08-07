import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Wastage.css';

const AddWastage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    approved_by: '',
    reason: 'Expired',
    remarks: '',
    department_id: '',
    items: [{ item_id: '', quantity: 1, estimated_loss: 0, unit: '' }]
  });

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/items');
        const data = await response.json();
        setItems(data);
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };

    fetchItems();
  }, []);

  useEffect(() => {
      const fetchDepartments = async () => {
        try {
          const response = await fetch('http://localhost:5000/api/departments');
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          const data = await response.json();
          setDepartments(data);
        } catch (error) {
          console.error('Error fetching departments:', error);
          alert(`Error loading departments: ${error.message}`);
        } finally {
          setLoading(false);
        }
      };
  
      fetchDepartments();
    }, []);


  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    // Convert to number for numeric fields
    if (field === 'quantity' || field === 'estimated_loss' || field === 'unit_price') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    // Auto-set unit when item is selected
    if(field === 'item_id') {
      // item.id may be number, value from select is string
      const selectedItem = items.find(item => String(item.id) === String(value));
      newItems[index].unit = selectedItem ? selectedItem.unit : '';
    }

    setFormData({ ...formData, items: newItems });
  };

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      return total + (Number(item.estimated_loss) || 0);
    }, 0).toFixed(2);
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', quantity: 1, estimated_loss: 0, unit: '' }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch('http://localhost:5000/api/wastages', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Wastage recorded successfully! Note #: ${result.wastage_note_number}`);
        navigate('/wastage/history');
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error creating wastage:', error);
      alert('Server error');
    }
  };

  return (
    <div className="wastage-container">
      <h2>Record Wastage</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input 
              type="date" 
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Approved By</label>
            <input 
              type="text"
              value={formData.approved_by}
              onChange={(e) => setFormData({...formData, approved_by: e.target.value})}
              required
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Reason for Wastage</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              required
            >
              <option value="Expired">Expired</option>
              <option value="Damaged">Damaged</option>
              <option value="Overproduction">Overproduction</option>
              <option value="Poor Storage">Poor Storage</option>
              <option value="Forecasting errors">Forecasting errors</option>
              <option value="Human error">Human error</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Which Department</label>
            <select
              value={formData.department_id}
              onChange={(e) => setFormData({...formData, department_id: e.target.value})}
              required
            >
              <option value="">Select Department</option>
              {departments.map(department => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Remarks / Notes</label>
          <textarea 
            value={formData.remarks}
            onChange={(e) => setFormData({...formData, remarks: e.target.value})}
          />
        </div>

        <h3>Wasted Items</h3>
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit of Measurement</th>
              <th>Estimated Loss (Rs.)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={item.item_id}
                    onChange={(e) => handleItemChange(index, 'item_id', e.target.value)}
                    required
                  >
                    <option value="">Select Item</option>
                    {items.map((itm) => (
                      <option key={itm.id} value={itm.id}>
                        {itm.name} ({itm.item_code})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    required
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
                    min="0"
                    step="0.01"
                    value={item.estimated_loss}
                    onChange={(e) => handleItemChange(index, 'estimated_loss', e.target.value)}
                  />
                </td>
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
          <div className="total-loss">
            <strong>Total Estimated Loss:</strong>
            <span>Rs. {calculateTotalLoss()}</span>
          </div>
        </div>
        
        <button type="submit" className="btn-submit">Save Wastage</button>
      </form>
    </div>
  );
};

export default AddWastage;