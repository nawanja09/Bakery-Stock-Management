// src/components/finance/CashReceive.jsx
//
// Cash Receive. Reached from Finance -> Cash Ledger -> [ Cash Received ] (modal);
// the standalone page layout is kept for backwards compatibility.
//
// A receipt is classified EITHER by an existing Receive Type (original
// behaviour, unchanged) OR by an Other Ledger (Cash Ledger debit + Other Ledger
// credit, posted by the server as one linked transaction). The two are mutually
// exclusive: choosing one disables the other, and one of them is required.
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHandHoldingDollar, faSpinner, faCheckCircle, faTimes, faCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import './FinanceForm.css';
import './StaffLoans.css'; // shared modal look (sl-modal*)

const CashReceive = ({ modal = false, defaultCompanyId = '', onClose, onSaved }) => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [receiveTypes, setReceiveTypes] = useState([]);
  const [otherLedgers, setOtherLedgers] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const dialogRef = useRef(null);
  const errorRef = useRef(null);

  // Escape closes the popup, except while the receipt is being saved.
  useDialog(dialogRef, { open: modal, onClose: submitting ? undefined : onClose });

  // A validation error must be seen: bring it into view whenever it changes.
  useEffect(() => {
    if (message?.type === 'error') errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);

  const [formData, setFormData] = useState({
    company_id: defaultCompanyId ? String(defaultCompanyId) : '',
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    receive_type: '',
    other_ledger_id: '',
    reference_number: '',
    remark: ''
  });

  useEffect(() => {
    api.get('/purchases/companies')
      .then(res => {
        const list = res.data || [];
        setCompanies(list);
        setFormData(prev => (prev.company_id || list.length === 0 ? prev : { ...prev, company_id: String(list[0].id) }));
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    api.get('/receive-types')
      .then(res => setReceiveTypes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setReceiveTypes([]));
  }, []);

  // Only ACTIVE Other Ledgers linked to the selected company can be chosen; a
  // ledger picked for another company is cleared when the company changes.
  useEffect(() => {
    if (!formData.company_id) { setOtherLedgers([]); setFormData(prev => ({ ...prev, other_ledger_id: '' })); return; }
    let cancelled = false;
    api.get('/other-ledgers/active', { params: { companyId: formData.company_id } })
      .then(res => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setOtherLedgers(list);
        setFormData(prev => (list.some(l => String(l.id) === String(prev.other_ledger_id)) ? prev : { ...prev, other_ledger_id: '' }));
      })
      .catch(() => { if (!cancelled) { setOtherLedgers([]); setFormData(prev => ({ ...prev, other_ledger_id: '' })); } });
    return () => { cancelled = true; };
  }, [formData.company_id]);

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

  const usingOtherLedger = !!formData.other_ledger_id;
  const usingReceiveType = !!formData.receive_type;

  const handleSubmit = async e => {
    e.preventDefault();
    setMessage(null);

    // `field` marks the input the message is about (aria-invalid).
    const fail = (field, text) => setMessage({ type: 'error', text, field });
    if (!formData.company_id) return fail('company_id', 'Please select a company');
    if (!formData.date) return fail('date', 'Date is required');
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return fail('amount', 'Amount must be greater than 0');
    if (usingReceiveType && usingOtherLedger) return fail('classification', 'Select either a Receive Type or an Other Ledger, not both');
    if (!usingReceiveType && !usingOtherLedger) return fail('classification', 'Please select a Receive Type or an Other Ledger');
    if (!currentUser?.id) return setMessage({ type: 'error', text: 'Please login again' });

    setSubmitting(true);
    try {
      const payload = {
        company_id: formData.company_id,
        date: formData.date,
        amount: amt,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null,
        created_by: currentUser.id,
        classification: usingOtherLedger ? 'other_ledger' : 'receive_type'
      };
      if (usingOtherLedger) payload.other_ledger_id = formData.other_ledger_id;
      else payload.receive_type = formData.receive_type;

      const res = await api.post('/finance/cash/receive', payload);
      setBalance(res.data?.balance ?? balance);
      setFormData(prev => ({ ...prev, amount: '', receive_type: '', other_ledger_id: '', reference_number: '', remark: '' }));
      if (modal) {
        if (onSaved) onSaved('Cash receipt recorded successfully!');
        return;
      }
      setMessage({ type: 'success', text: 'Cash receipt recorded successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to record cash receipt' });
    } finally {
      setSubmitting(false);
    }
  };

  const gridClass = modal ? 'form-grid' : 'form-grid two-col';

  const invalid = (...names) => (message?.type === 'error' && names.includes(message.field)
    ? { 'aria-invalid': true, 'aria-describedby': 'cr-error' }
    : {});

  const alertBox = message && (
    <div ref={errorRef} id="cr-error" className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} role="alert" style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24' }}>
      {message.type === 'success' && <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: '8px' }} />} {message.text}
    </div>
  );

  const fields = (
    <>
      <div className={gridClass}>
        <div className="form-group">
          <label>Company <span className="required">*</span></label>
          <select name="company_id" value={formData.company_id} onChange={handleChange} required className="form-select" {...invalid('company_id')}>
            <option value="">Select Company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Date <span className="required">*</span></label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required className="form-input" {...invalid('date')} />
        </div>
      </div>
      <div className={gridClass}>
        <div className="form-group">
          <label>Receive Type {!usingOtherLedger && <span className="required">*</span>}</label>
          <select name="receive_type" value={formData.receive_type} onChange={handleChange} disabled={usingOtherLedger} className="form-select" {...invalid('classification')}>
            <option value="">Select type</option>
            {receiveTypes.map(type => (
              <option key={type.id} value={type.type_name}>{type.type_name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Other Ledger {!usingReceiveType && <span className="required">*</span>}</label>
          <select name="other_ledger_id" value={formData.other_ledger_id} onChange={handleChange} disabled={usingReceiveType} className="form-select" {...invalid('classification')}>
            <option value="">Select Other Ledger</option>
            {otherLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {formData.company_id && otherLedgers.length === 0 && (
            <span className="fl-field-hint">No Other Ledger is linked to this company</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: '-4px 0 var(--spacing-sm)' }}>
        Choose a Receive Type <strong>or</strong> an Other Ledger. To switch, clear the one already selected.
      </div>
      <div className={gridClass}>
        <div className="form-group">
          <label>Amount (Rs.) <span className="required">*</span></label>
          <input type="number" name="amount" min="0.01" step="0.01" value={formData.amount} onChange={handleChange} placeholder="0.00" required className="form-input" {...invalid('amount')} />
        </div>
        <div className="form-group">
          <label>Reference No (Optional)</label>
          <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} placeholder="e.g. receipt number" className="form-input" />
        </div>
      </div>
      <div className="form-group">
        <label>Remark</label>
        <textarea name="remark" rows={2} value={formData.remark} onChange={handleChange} placeholder="Add a note..." className="form-textarea" />
      </div>
    </>
  );

  if (modal) {
    return (
      // The backdrop is inert: a stray click outside must not discard the typed receipt.
      <div className="sl-modal-overlay">
        <div ref={dialogRef} className="sl-modal" role="dialog" aria-modal="true" aria-labelledby="cr-title">
          <div className="sl-modal-header">
            <h3 id="cr-title">
              <FontAwesomeIcon icon={faHandHoldingDollar} style={{ color: '#059669', marginRight: '8px' }} />
              Cash Received
            </h3>
            <button type="button" className="sl-modal-close" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faTimes} /></button>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="sl-modal-body">
              {/* At the top of the form so it is not hidden below the fold */}
              {message && message.type === 'error' && <div ref={errorRef} id="cr-error" className="sl-modal-error" role="alert">{message.text}</div>}
              {formData.company_id && (
                <div className="sl-summary-card">
                  <div className="sl-summary-row">
                    <span className="sl-summary-lbl">Current Cash In Hand</span>
                    <strong>{loadingBalance ? '…' : `Rs. ${parseFloat(balance || 0).toFixed(2)}`}</strong>
                  </div>
                </div>
              )}
              {fields}
            </div>
            <div className="sl-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : <><FontAwesomeIcon icon={faCheck} /> Save Receipt</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}><FontAwesomeIcon icon={faHandHoldingDollar} style={{ marginRight: '8px' }} /> Cash Receive</h2>
        </div>
      </header>

      {formData.company_id && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
          <div style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faHandHoldingDollar} /></div>
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Current Cash In Hand Balance</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
              {loadingBalance ? '…' : `Rs. ${parseFloat(balance || 0).toFixed(2)}`}
            </div>
          </div>
        </div>
      )}

      {alertBox}

      <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
        <form onSubmit={handleSubmit}>
          {fields}
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

export default CashReceive;
