// src/components/Expenses/ChequeExpenses.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTimes, 
  faPlus, 
  faSearch,
  faPrint,
  faFileExcel,
  faEye,
  faSync,
  faSpinner,
  faMoneyCheck,
  faCalendarCheck,
} from '@fortawesome/free-solid-svg-icons';
import './ChequeExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const ChequeExpenses = () => {
  const [activeTab, setActiveTab] = useState('voucher'); // 'voucher' or 'unrealised'
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [chequeVouchers, setChequeVouchers] = useState([]);
  const [unrealisedCheques, setUnrealisedCheques] = useState([]);
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
    'Office Supplies',
    'Utilities',
    'Rent',
    'Maintenance',
    'Professional Fees',
    'Advertising',
    'Travel',
    'Training',
    'Insurance',
    'Communication',
    'Transport',
    'Other'
  ];

  // Fetch data on component mount
  useEffect(() => {
    fetchChequeData();
  }, []);

  // Calculate total amount when without_vat or vat changes
  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    const total = withoutVat + vat;
    setFormData(prev => ({ ...prev, total_bill_amount: total.toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  const fetchChequeData = async () => {
    setIsFetching(true);
    try {
      // Fetch cheque vouchers
      const vouchersRes = await api.get('/expenses/cheque/vouchers');
      setChequeVouchers(vouchersRes.data || []);
      
      // Fetch unrealised cheques
      const unrealisedRes = await api.get('/expenses/cheque/unrealised');
      setUnrealisedCheques(unrealisedRes.data || []);
    } catch (error) {
      console.error('Error fetching cheque data:', error);
      showPopup('error', 'Failed to load data from server');
      // Set demo data if API fails
      setChequeVouchers([
        { id: 1, date: '2026-03-15', voucher_number: '9281', cheque_number: '750254', payee_name: 'Jayawardena Agencies(Pvt) Ltd', amount: 255400.00, is_realised: false },
        { id: 2, date: '2026-03-03', voucher_number: '9260', cheque_number: '749600', payee_name: 'Jayawardena Agencies(Pvt) Ltd', amount: 230040.00, is_realised: false },
        { id: 3, date: '2026-03-03', voucher_number: '9261', cheque_number: '750251', payee_name: 'Jayawardena Agencies(Pvt) Ltd', amount: 172000.00, is_realised: false },
      ]);
      setUnrealisedCheques([
        { id: 1, date: '2026-03-15', voucher_number: '9281', cheque_number: '750254', payee_name: 'Jayawardena Agencies(Pvt) Ltd', amount: 255400.00, is_realised: false },
        { id: 2, date: '2026-03-03', voucher_number: '9260', cheque_number: '749600', payee_name: 'Jayawardena Agencies(Pvt) Ltd', amount: 230040.00, is_realised: false },
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

      const response = await api.post('/expenses/cheque/voucher', payload);
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', 'Cheque expense voucher created successfully!');
        
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
        await fetchChequeData();
      }
    } catch (error) {
      console.error('Error creating cheque voucher:', error);
      showPopup('error', error.response?.data?.error || 'Failed to create voucher');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRealiseCheque = async (chequeId, realiseDate) => {
    if (!realiseDate) {
      showPopup('error', 'Please select realise date');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put(`/expenses/cheque/realise/${chequeId}`, {
        realise_date: realiseDate
      });
      
      if (response.status === 200) {
        showPopup('success', 'Cheque realised successfully!');
        await fetchChequeData();
      }
    } catch (error) {
      console.error('Error realising cheque:', error);
      showPopup('error', error.response?.data?.error || 'Failed to realise cheque');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChequeRealiseChange = (id, field, value) => {
    setUnrealisedCheques(prev => 
      prev.map(cheque => 
        cheque.id === id ? { ...cheque, [field]: value } : cheque
      )
    );
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

  const filteredCheques = unrealisedCheques.filter(cheque =>
    cheque.cheque_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="cheque-expenses-container">
      <div className="cheque-header">
        <h1 className="cheque-title">
          <FontAwesomeIcon icon={faMoneyCheck} className="title-icon" />
          Cheque Expenses Management
        </h1>
        <div className="cheque-breadcrumb">
          Dashboard / Expenses / Cheque Expenses
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="cheque-tabs">
        <button 
          className={`tab-button ${activeTab === 'voucher' ? 'active' : ''}`}
          onClick={() => setActiveTab('voucher')}
        >
          <FontAwesomeIcon icon={faPlus} />
          Expenses Cheque Book
        </button>
        <button 
          className={`tab-button ${activeTab === 'unrealised' ? 'active' : ''}`}
          onClick={() => setActiveTab('unrealised')}
        >
          <FontAwesomeIcon icon={faCalendarCheck} />
          Unrealise Expense Cheques
        </button>
      </div>

      {/* New Expense Voucher Form */}
      {activeTab === 'voucher' && (
        <div className="voucher-form-container">
          <div className="form-card">
            <h3 className="form-title">
              <FontAwesomeIcon icon={faPlus} />
              New Expense Voucher
            </h3>
            
            <form onSubmit={handleSubmit} className="cheque-form">
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
                  {isLoading ? 'Submitting...' : 'Submit Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unrealise Expense Cheques Table */}
      {activeTab === 'unrealised' && (
        <div className="unrealised-container">
          <div className="search-section">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search from Cheque Number, Payee Name, Voucher Number..."
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
              onClick={fetchChequeData} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
          </div>

          <div className="table-container">
            <table className="cheque-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher Number</th>
                  <th>Cheque Number</th>
                  <th>Payee Name</th>
                  <th>Amount (LKR)</th>
                  <th>Cheque Realise</th>
                  <th>Realise Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr>
                    <td colSpan="8" className="loading-row">
                      <FontAwesomeIcon icon={faSpinner} spin /> Loading cheques...
                    </td>
                  </tr>
                ) : filteredCheques.length > 0 ? (
                  filteredCheques.map(cheque => (
                    <tr key={cheque.id}>
                      <td>{cheque.date}</td>
                      <td className="voucher-number">{cheque.voucher_number}</td>
                      <td className="cheque-number">{cheque.cheque_number}</td>
                      <td>{cheque.payee_name}</td>
                      <td className="amount-cell">{formatCurrency(cheque.amount)}</td>
                      <td className="checkbox-cell">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={cheque.is_realised || false}
                            onChange={(e) => handleChequeRealiseChange(cheque.id, 'is_realised', e.target.checked)}
                            className="realise-checkbox"
                          />
                          <span className="checkmark"></span>
                        </label>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={cheque.realise_date || ''}
                          onChange={(e) => handleChequeRealiseChange(cheque.id, 'realise_date', e.target.value)}
                          className="realise-date-input"
                          disabled={cheque.is_realised}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleRealiseCheque(cheque.id, cheque.realise_date)}
                          className="save-btn"
                          disabled={!cheque.realise_date || cheque.is_realised}
                        >
                          <FontAwesomeIcon icon={faSave} />
                          Save
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-row">No unrealised cheques found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChequeExpenses;