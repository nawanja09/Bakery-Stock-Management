// src/components/finance/CashReceive.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHandHoldingDollar, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FinanceForm.css';

const RECEIVE_TYPES = ['Customer Payment', 'Owner Capital', 'Other Income', 'Adjustment'];

const CashReceive = () => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState({
    company_id: '',
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
    if (!formData.company_id) { setBalance(null); return; }
    let cancelled = false;
    setLoadingBalance(true);
    api.get(`/finance/cash/balance/${formData.company_id}`)
      .then(res => { if (!cancelled) setBalance(res.data?.balance ?? 0); })
      .catch(() => { if (!cancelled) setBalance(null); })
      .finally(() => { if (!cancelled) setLoadingBalance(false); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    if (!formData.company_id) return setMessage({ type: 'error', text: 'Please select a company' });
    if (!formData.date) return setMessage({ type: 'error', text: 'Date is required' });
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return setMessage({ type: 'error', text: 'Amount must be greater than 0' });
    if (!formData.receive_type) return setMessage({ type: 'error', text: 'Please select a receive type' });
    if (!currentUser?.id) return setMessage({ type: 'error', text: 'Please login again' });

    setSubmitting(true);
    try {
      const res = await api.post('/finance/cash/receive', {
        company_id: formData.company_id,
        date: formData.date,
        amount: amt,
        receive_type: formData.receive_type,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null,
        created_by: currentUser.id
      });
      setMessage({ type: 'success', text: 'Cash receipt recorded successfully!' });
      setBalance(res.data?.balance ?? balance);
      setFormData(prev => ({ ...prev, amount: '', receive_type: '', reference_number: '', remark: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to record cash receipt' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ff-container">
      <div className="ff-header">
        <h2><FontAwesomeIcon icon={faHandHoldingDollar} /> Cash Receive</h2>
      </div>

      {formData.company_id && (
        <div className="ff-balance-card">
          <span>Current Cash In Hand Balance</span>
          <strong>{loadingBalance ? '…' : `Rs. ${parseFloat(balance || 0).toFixed(2)}`}</strong>
        </div>
      )}

      {message && (
        <div className={`ff-message ff-message-${message.type}`}>
          {message.type === 'success' && <FontAwesomeIcon icon={faCheckCircle} />} {message.text}
        </div>
      )}

      <form className="ff-form" onSubmit={handleSubmit}>
        <div className="ff-form-group">
          <label>Company *</label>
          <select name="company_id" value={formData.company_id} onChange={handleChange} required>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
            {RECEIVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="ff-form-group">
          <label>Reference No (Optional)</label>
          <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} placeholder="e.g. receipt number" />
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

export default CashReceive;
