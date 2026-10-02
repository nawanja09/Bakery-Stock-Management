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
  const [bankLoadError, setBankLoadError] = useState(false);
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
    setBankLoadError(false);
    setBankAccounts([]);
    setFormData(prev => ({ ...prev, bank_id: '' }));
    api.get('/finance/bank/accounts', { params: { companyId: formData.company_id } })
      .then(res => {
        if (cancelled) return;
        const list = res.data || [];
        setBankAccounts(list);
        setFormData(prev => ({ ...prev, bank_id: list.length > 0 ? String(list[0].id) : '' }));
      })
      .catch(() => { if (!cancelled) { setBankAccounts([]); setBankLoadError(true); } })
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
        company_id: formData.company_id,
        bank_id: formData.bank_id,
        date: formData.date,
        amount: amt,
        receive_type: formData.receive_type,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null
      });
      if (res.data?.pending) {
        // Card payment: filed as Pending in the Card Ledger, so the bank balance is unchanged.
        setMessage({ type: 'success', text: res.data.message });
      } else {
        setMessage({ type: 'success', text: 'Bank receipt recorded successfully!' });
        setBankAccounts(prev => prev.map(b => String(b.id) === String(formData.bank_id) ? { ...b, current_balance: res.data?.balance ?? b.current_balance } : b));
      }
      setFormData(prev => ({ ...prev, amount: '', receive_type: '', reference_number: '', remark: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to record bank receipt' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}><FontAwesomeIcon icon={faLandmark} style={{ marginRight: '8px' }} /> Bank Receive</h2>
        </div>
      </header>

      {selectedBank && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
          <div style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faLandmark} /></div>
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              {selectedBank.bank_name}{selectedBank.account_number ? ` — ${selectedBank.account_number}` : ''}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
              Rs. {parseFloat(selectedBank.current_balance || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24' }}>
          {message.type === 'success' && <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: '8px' }} />} {message.text}
        </div>
      )}

      <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-grid two-col">
            <div className="form-group">
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} required className="form-select">
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Bank Account <span className="required">*</span></label>
              <select name="bank_id" value={formData.bank_id} onChange={handleChange} required disabled={loadingBanks} className="form-select">
                <option value="">
                  {loadingBanks ? 'Loading…' : bankLoadError ? 'Unable to load bank accounts' : bankAccounts.length === 0 ? 'No active bank accounts available' : 'Select bank account'}
                </option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-grid two-col">
            <div className="form-group">
              <label>Date <span className="required">*</span></label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} required className="form-input" />
            </div>
            <div className="form-group">
              <label>Amount (Rs.) <span className="required">*</span></label>
              <input type="number" name="amount" min="0.01" step="0.01" value={formData.amount} onChange={handleChange} placeholder="0.00" required className="form-input" />
            </div>
          </div>
          <div className="form-grid two-col">
            <div className="form-group">
              <label>Receive Type <span className="required">*</span></label>
              <select name="receive_type" value={formData.receive_type} onChange={handleChange} required className="form-select">
                <option value="">Select type</option>
                {receiveTypes.map(type => (
                  <option key={type.id} value={type.type_name}>{type.type_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Reference No (Optional)</label>
              <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} placeholder="e.g. deposit slip number" className="form-input" />
            </div>
          </div>
          <div className="form-grid two-col">
            <div className="form-group">
              <label>Remark</label>
              <textarea name="remark" rows={2} value={formData.remark} onChange={handleChange} placeholder="Add a note..." className="form-textarea" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : 'Save Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankReceive;
