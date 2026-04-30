// src/components/Expenses/OnlineExpenses.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTimes, 
  faPlus, 
  faEdit,
  faTrash,
  faSearch,
  faPrint,
  faFileExcel,
  faSync,
  faSpinner,
  faGlobe,
  faWallet,
  faReceipt
} from '@fortawesome/free-solid-svg-icons';
import './OnlineExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const OnlineExpenses = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlineExpenses, setOnlineExpenses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const { showPopup } = usePopup();

  // Form State
  const [formData, setFormData] = useState({
    bill_date: new Date().toISOString().split('T')[0],
    bill_number: '',
    payee_name: '',
    vat_reg_number: '',
    expense_type: '',
    without_vat_amount: '',
    vat_amount: '',
    total_bill_amount: '',
    description: ''
  });

  const expenseTypes = [
    'Raw material',
    'Electricity',
    'Gas',
    'Water',
    'Insurance',
    'Internet'
  ];

  // Calculate total amount when without_vat or vat changes
  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    const total = withoutVat + vat;
    setFormData(prev => ({ ...prev, total_bill_amount: total.toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  // Fetch data on component mount
  useEffect(() => {
    fetchOnlineExpenses();
  }, []);

  const fetchOnlineExpenses = async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/expenses/online');
      setOnlineExpenses(response.data || []);
    } catch (error) {
      console.error('Error fetching online expenses:', error);
      showPopup('error', 'Failed to load data from server');
      // Set demo data if API fails
      setOnlineExpenses([
      ]);
    } finally {
      setIsFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.bill_date || !formData.payee_name || !formData.expense_type) {
      showPopup('error', 'Please fill all required fields');
      return;
    }
    
    if (!formData.without_vat_amount || parseFloat(formData.without_vat_amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        bill_date: formData.bill_date,
        bill_number: formData.bill_number || null,
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type: formData.expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      const response = await api.post('/expenses/online', payload);
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', 'Online expense recorded successfully!');
        
        // Reset form
        setFormData({
          bill_date: new Date().toISOString().split('T')[0],
          bill_number: '',
          payee_name: '',
          vat_reg_number: '',
          expense_type: '',
          without_vat_amount: '',
          vat_amount: '',
          total_bill_amount: '',
          description: ''
        });
        
        // Refresh data
        await fetchOnlineExpenses();
      }
    } catch (error) {
      console.error('Error creating online expense:', error);
      showPopup('error', error.response?.data?.error || 'Failed to record online expense');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (expense) => {
    setEditingId(expense.id);
    setFormData({
      bill_date: expense.bill_date,
      bill_number: expense.bill_number || '',
      payee_name: expense.payee_name,
      vat_reg_number: expense.vat_reg_number || '',
      expense_type: expense.expense_type,
      without_vat_amount: expense.without_vat_amount.toString(),
      vat_amount: expense.vat_amount.toString(),
      total_bill_amount: expense.total_bill_amount.toString(),
      description: expense.description || ''
    });
    // Scroll to form
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    if (!formData.bill_date || !formData.payee_name || !formData.expense_type) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        bill_date: formData.bill_date,
        bill_number: formData.bill_number || null,
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type: formData.expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      const response = await api.put(`/expenses/online/${editingId}`, payload);
      
      if (response.status === 200) {
        showPopup('success', 'Online expense updated successfully!');
        
        // Reset form and editing state
        setFormData({
          bill_date: new Date().toISOString().split('T')[0],
          bill_number: '',
          payee_name: '',
          vat_reg_number: '',
          expense_type: '',
          without_vat_amount: '',
          vat_amount: '',
          total_bill_amount: '',
          description: ''
        });
        setEditingId(null);
        
        // Refresh data
        await fetchOnlineExpenses();
      }
    } catch (error) {
      console.error('Error updating online expense:', error);
      showPopup('error', error.response?.data?.error || 'Failed to update online expense');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this online expense?')) {
      setIsLoading(true);
      try {
        const response = await api.delete(`/expenses/online/${id}`);
        
        if (response.status === 200) {
          showPopup('success', 'Online expense deleted successfully!');
          await fetchOnlineExpenses();
        }
      } catch (error) {
        console.error('Error deleting online expense:', error);
        showPopup('error', error.response?.data?.error || 'Failed to delete online expense');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      bill_date: new Date().toISOString().split('T')[0],
      bill_number: '',
      payee_name: '',
      vat_reg_number: '',
      expense_type: '',
      without_vat_amount: '',
      vat_amount: '',
      total_bill_amount: '',
      description: ''
    });
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'LKR 0.00';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const filteredExpenses = onlineExpenses.filter(expense =>
    expense.bill_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.expense_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.vat_reg_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="online-expenses-container">
      <div className="online-header">
        <h1 className="online-title">
          <FontAwesomeIcon icon={faGlobe} className="title-icon" />
          Online Expenses Management
        </h1>
      </div>

      {/* New Expense Bill Form */}
      <div className="form-card">
        <h3 className="form-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
          {editingId ? 'Edit Expense Bill' : 'New Expense Bill'}
        </h3>
        
        <form onSubmit={editingId ? handleUpdate : handleSubmit} className="online-form">
          <div className="form-row">
            <div className="form-group">
              <label>Bill Date <span className="required">*</span></label>
              <input
                type="date"
                name="bill_date"
                value={formData.bill_date}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Bill Number</label>
              <input
                type="text"
                name="bill_number"
                value={formData.bill_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter bill number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Payee Name <span className="required">*</span></label>
              <input
                type="text"
                name="payee_name"
                value={formData.payee_name}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Enter payee name"
              />
            </div>
            
            <div className="form-group">
              <label>VAT Reg Number</label>
              <input
                type="text"
                name="vat_reg_number"
                value={formData.vat_reg_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter VAT registration number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Expenses Type <span className="required">*</span></label>
              <select
                name="expense_type"
                value={formData.expense_type}
                onChange={handleChange}
                required
                className="form-select"
              >
                <option value="">Select Expense Type</option>
                {expenseTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Without VAT Amount <span className="required">*</span></label>
              <input
                type="number"
                name="without_vat_amount"
                value={formData.without_vat_amount}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="form-input amount-input"
                placeholder="0.00"
              />
            </div>
            
            <div className="form-group">
              <label>VAT Amount</label>
              <input
                type="number"
                name="vat_amount"
                value={formData.vat_amount}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="form-input amount-input"
                placeholder="0.00"
              />
            </div>
            
            <div className="form-group">
              <label>Total Bill Amount</label>
              <input
                type="text"
                name="total_bill_amount"
                value={formData.total_bill_amount}
                readOnly
                className="form-input total-amount"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="form-textarea"
              rows="3"
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-actions">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="btn-secondary"
              >
                <FontAwesomeIcon icon={faTimes} />
                Cancel
              </button>
            )}
            <button 
              type="button" 
              onClick={() => {
                setFormData({
                  bill_date: new Date().toISOString().split('T')[0],
                  bill_number: '',
                  payee_name: '',
                  vat_reg_number: '',
                  expense_type: '',
                  without_vat_amount: '',
                  vat_amount: '',
                  total_bill_amount: '',
                  description: ''
                });
                if (editingId) setEditingId(null);
              }}
              className="btn-secondary"
              disabled={isLoading}
            >
              <FontAwesomeIcon icon={faTimes} />
              Clear
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isLoading}
            >
              <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
              {isLoading ? 'Processing...' : (editingId ? 'Update Bill' : 'Submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Online Expense Details Table */}
      <div className="table-section">
        <div className="table-header">
          <h3 className="table-title">
            <FontAwesomeIcon icon={faReceipt} />
            Online Expense Details
          </h3>
          <div className="table-actions">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search by bill number, payee, expense type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button 
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                >
                  ×
                </button>
              )}
            </div>
            <button 
              onClick={fetchOnlineExpenses} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
            <button className="action-icon-btn" title="Print">
              <FontAwesomeIcon icon={faPrint} />
            </button>
            <button className="action-icon-btn" title="Export to Excel">
              <FontAwesomeIcon icon={faFileExcel} />
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="online-table">
            <thead>
              <tr>
                <th>Bill Date</th>
                <th>Bill Number</th>
                <th>Payee Name</th>
                <th>VAT Reg No</th>
                <th>Without VAT Amount</th>
                <th>VAT Amount</th>
                <th>Total Bill Amount</th>
                <th>Balance</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
                {isFetching ? (
                    <tr>
                        <td colSpan="10" className="loading-row">
                        <FontAwesomeIcon icon={faSpinner} spin /> Loading online expenses...
                        </td>
                    </tr>
                    ) : filteredExpenses.length > 0 ? (
                filteredExpenses.map(expense => (
                  <tr key={expense.id}>
                    <td className="date-cell">{expense.bill_date}</td>
                    <td className="bill-number-cell">{expense.bill_number || '-'}</td>
                    <td className="payee-cell">{expense.payee_name}</td>
                    <td className="vat-cell">{expense.vat_reg_number || '-'}</td>
                    <td className="amount-cell">{formatCurrency(expense.without_vat_amount)}</td>
                    <td className="amount-cell">{formatCurrency(expense.vat_amount)}</td>
                    <td className="amount-cell total">{formatCurrency(expense.total_bill_amount)}</td>
                    <td className={`balance-cell ${expense.balance > 0 ? 'balance-positive' : 'balance-zero'}`}>
                      {formatCurrency(expense.balance || 0)}
                    </td>
                    <td className="description-cell">{expense.description || '-'}</td>
                    <td className="action-cell">
                      <button
                        onClick={() => handleEdit(expense)}
                        className="edit-btn"
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="delete-btn"
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="empty-row">No online expenses found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OnlineExpenses;