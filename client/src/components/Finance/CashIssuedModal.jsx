// src/components/Finance/CashIssuedModal.jsx
//
// Finance -> Cash Ledger -> [ Cash Issued ]: a Cash OUT to an Other Ledger.
// The server posts ONE Cash Ledger credit plus its linked Other Ledger debit in
// a single DB transaction (POST /finance/cash/issued). With `record` set the
// same form edits that transaction in place (PUT /finance/cash/issued/:id).
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillTransfer, faSpinner, faTimes, faCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import './FinanceForm.css';
import './StaffLoans.css'; // shared modal look (sl-modal*)

const CashIssuedModal = ({ defaultCompanyId = '', record = null, onClose, onSaved }) => {
  const isEdit = !!record;
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [otherLedgers, setOtherLedgers] = useState([]);
  const [balance, setBalance] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  // Escape closes (not while saving); focus moves in; Tab and page scroll stay put.
  useDialog(dialogRef, { open: true, onClose: submitting ? undefined : onClose });
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    company_id: record ? String(record.company_id) : (defaultCompanyId ? String(defaultCompanyId) : ''),
    date: record ? record.date : new Date().toISOString().slice(0, 10),
    other_ledger_id: record ? String(record.other_ledger_id) : '',
    amount: record ? String(record.amount) : '',
    reference_number: record?.reference_number || '',
    remark: record?.remark || ''
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

  // Only ACTIVE Other Ledgers linked to the selected company are offered; a
  // ledger picked for another company is cleared when the company changes.
  // When editing, the transaction's own ledger stays selectable even if it has
  // since been made inactive.
  useEffect(() => {
    if (!formData.company_id) { setOtherLedgers([]); return; }
    let cancelled = false;
    api.get('/other-ledgers/active', { params: { companyId: formData.company_id } })
      .then(res => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        if (record && !list.some(l => Number(l.id) === Number(record.other_ledger_id))) {
          list.push({ id: record.other_ledger_id, name: `${record.other_ledger_name} (Inactive)` });
        }
        setOtherLedgers(list);
        setFormData(prev => (list.some(l => String(l.id) === String(prev.other_ledger_id)) ? prev : { ...prev, other_ledger_id: '' }));
      })
      .catch(() => { if (!cancelled) setOtherLedgers([]); });
    return () => { cancelled = true; };
  }, [record, formData.company_id]);

  useEffect(() => {
    if (!formData.company_id) { setBalance(null); return; }
    let cancelled = false;
    api.get(`/finance/cash/balance/${formData.company_id}`)
      .then(res => { if (!cancelled) setBalance(res.data?.balance ?? 0); })
      .catch(() => { if (!cancelled) setBalance(null); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!formData.company_id) return setError('Please select a company');
    if (!formData.date) return setError('Date is required');
    if (!formData.other_ledger_id) return setError('Please select an Other Ledger');
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return setError('Amount must be greater than 0');
    if (!currentUser?.id) return setError('Please login again');

    setSubmitting(true);
    try {
      const payload = {
        company_id: formData.company_id,
        date: formData.date,
        other_ledger_id: formData.other_ledger_id,
        amount: amt,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null,
        created_by: currentUser.id
      };
      if (isEdit) await api.put(`/finance/cash/issued/${record.id}`, payload);
      else await api.post('/finance/cash/issued', payload);
      if (onSaved) onSaved(isEdit ? 'Cash issued updated successfully!' : 'Cash issued recorded successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save cash issued');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Backdrop is inert: an outside click must not discard what was typed.
    <div className="sl-modal-overlay">
      <div ref={dialogRef} className="sl-modal" role="dialog" aria-modal="true" aria-labelledby="ci-title">
        <div className="sl-modal-header">
          <h3 id="ci-title">
            <FontAwesomeIcon icon={faMoneyBillTransfer} style={{ color: '#dc2626', marginRight: '8px' }} />
            {isEdit ? 'Edit Cash Issued' : 'Cash Issued'}
          </h3>
          <button type="button" className="sl-modal-close" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faTimes} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="sl-modal-body">
            {formData.company_id && (
              <div className="sl-summary-card">
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">Current Cash In Hand</span>
                  <strong>{balance === null ? '…' : `Rs. ${parseFloat(balance || 0).toFixed(2)}`}</strong>
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} disabled={isEdit} className="form-select">
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date <span className="required">*</span></label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label>Other Ledger <span className="required">*</span></label>
              <select name="other_ledger_id" value={formData.other_ledger_id} onChange={handleChange} className="form-select" autoFocus>
                <option value="">Select Other Ledger</option>
                {otherLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {formData.company_id && otherLedgers.length === 0 && (
                <span className="fl-field-hint">No Other Ledger is linked to this company</span>
              )}
            </div>
            <div className="form-group">
              <label>Amount (Rs.) <span className="required">*</span></label>
              <input type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" value={formData.amount} onChange={handleChange} placeholder="0.00" className="form-input" />
            </div>
            <div className="form-group">
              <label>Reference No (Optional)</label>
              <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} placeholder="e.g. voucher number" className="form-input" />
            </div>
            <div className="form-group">
              <label>Remark / Description</label>
              <textarea name="remark" rows={2} value={formData.remark} onChange={handleChange} placeholder="Add a note..." className="form-textarea" />
            </div>
            {error && <div className="sl-modal-error" role="alert">{error}</div>}
          </div>
          <div className="sl-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting
                ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                : <><FontAwesomeIcon icon={faCheck} /> {isEdit ? 'Save Changes' : 'Save'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashIssuedModal;
