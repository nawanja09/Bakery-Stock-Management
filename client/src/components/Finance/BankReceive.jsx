// src/components/finance/BankReceive.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLandmark, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FinanceForm.css';
import ReceiveTypeManagement from './ReceiveTypeManagement';


const BankReceive = () => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [receiveTypes, setReceiveTypes] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState({
    company_id: '',
    bank_id: '',
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    receive_type: '',
    reference_number: '',
    remark: ''
  });

  useEffect(() => {
    api.get('/purchases/companies')
      .then(res => {
        const list = res.data || [];
        setCompanies(list);
        if (list.length > 0) setFormData(prev => ({ ...prev, company_id: String(list[0].id) }));
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    api.get('/receive-types')
      .then(res => setReceiveTypes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setReceiveTypes([]));
  }, []);

  useEffect(() => {
    if (!formData.company_id) { setBankAccounts([]); return; }
    let cancelled = false;
    setLoadingBanks(true);
    api.get('/finance/bank/accounts', { params: { companyId: formData.company_id } })
      .then(res => {
        if (cancelled) return;
        const list = res.data || [];
        setBankAccounts(list);
        setFormData(prev => ({ ...prev, bank_id: list.length > 0 ? String(list[0].id) : '' }));
      })
      .catch(() => { if (!cancelled) setBankAccounts([]); })
      .finally(() => { if (!cancelled) setLoadingBanks(false); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  const selectedBank = bankAccounts.find(b => String(b.id) === String(formData.bank_id));

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    if (!formData.company_id) return setMessage({ type: 'error', text: 'Please select a company' });
    if (!formData.bank_id) return setMessage({ type: 'error', text: 'Please select a bank account' });
    if (!formData.date) return setMessage({ type: 'error', text: 'Date is required' });
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return setMessage({ type: 'error', text: 'Amount must be greater than 0' });
    if (!formData.receive_type) return setMessage({ type: 'error', text: 'Please select a receive type' });
    if (!currentUser?.id) return setMessage({ type: 'error', text: 'Please login again' });

    setSubmitting(true);
    try {
      const res = await api.post('/finance/bank/receive', {
        bank_id: formData.bank_id,
        date: formData.date,
        amount: amt,
        receive_type: formData.receive_type,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null,
        created_by: currentUser.id
      });
      setMessage({ type: 'success', text: 'Bank receipt recorded successfully!' });
      setBankAccounts(prev => prev.map(b => String(b.id) === String(formData.bank_id) ? { ...b, current_balance: res.data?.balance ?? b.current_balance } : b));
      setFormData(prev => ({ ...prev, amount: '', receive_type: '', reference_number: '', remark: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to record bank receipt' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ff-container">
      <div className="ff-header">
        <h2><FontAwesomeIcon icon={faLandmark} /> Bank Receive</h2>
      </div>

      {selectedBank && (
        <div className="ff-balance-card">
          <span>{selectedBank.bank_name}{selectedBank.account_number ? ` — ${selectedBank.account_number}` : ''}</span>
          <strong>Rs. {parseFloat(selectedBank.current_balance || 0).toFixed(2)}</strong>
        </div>
      )}

      {message && (
        <div className={`ff-message ff-message-${message.type}`}>
          {message.type === 'success' && <FontAwesomeIcon icon={faCheckCircle} />} {message.text}
        </div>
      )}

      <form className="ff-form" onSubmit={handleSubmit}>
        <div className="ff-form-row">
          <div className="ff-form-group">
            <label>Company *</label>
            <select name="company_id" value={formData.company_id} onChange={handleChange} required>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ff-form-group">
            <label>Bank Account *</label>
            <select name="bank_id" value={formData.bank_id} onChange={handleChange} required disabled={loadingBanks}>
              <option value="">{loadingBanks ? 'Loading…' : 'Select bank account'}</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ff-form-row">
          <div className="ff-form-group">
            <label>Date *</label>
            <input type="date" name="date" value={formData.date} onChange={handleChange} required />
          </div>
          <div className="ff-form-group">
            <label>Amount (Rs.) *</label>
            <input type="number" name="amount" min="0.01" step="0.01" value={formData.amount} onChange={handleChange} placeholder="0.00" required />
          </div>
        </div>

        <div className="ff-form-group">
          <label>Receive Type *</label>
          <select name="receive_type" value={formData.receive_type} onChange={handleChange} required>
            <option value="">Select type</option>
            {receiveTypes.map(type => (
              <option key={type.id} value={type.type_name}>{type.type_name}</option>
            ))}
          </select>
        </div>

        <div className="ff-form-group">
          <label>Reference No (Optional)</label>
          <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} placeholder="e.g. deposit slip number" />
        </div>

        <div className="ff-form-group">
          <label>Remark</label>
          <textarea name="remark" rows={2} value={formData.remark} onChange={handleChange} placeholder="Add a note..." />
        </div>

        <button className="ff-submit-btn" type="submit" disabled={submitting}>
          {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : 'Save Receipt'}
        </button>
      </form>
    </div>
  );
};

export default BankReceive;
