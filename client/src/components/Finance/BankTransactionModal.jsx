// src/components/Finance/BankTransactionModal.jsx
//
// Finance -> Bank Ledger -> [ Bank Received ] / [ Bank Issued ].
//   mode="receive": money into the selected bank account (POST /finance/bank/receive),
//                   classified EITHER by a Receive Type OR by an Other Ledger -
//                   never both. Other Ledger = Bank DEBIT + Other Ledger CREDIT.
//                   Card receive types are filed as Pending in the Card Ledger.
//   mode="issued":  money out of the source bank account to an Other Ledger
//                   (POST /finance/bank/issued) = Bank CREDIT + Other Ledger DEBIT.
// The server posts the Bank Ledger row and its linked Other Ledger entry in one
// DB transaction.
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLandmark, faMoneyBillTransfer, faSpinner, faTimes, faCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import useDialog from '../common/ui/useDialog';
import './FinanceForm.css';
import './StaffLoans.css'; // shared modal look (sl-modal*)

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const BankTransactionModal = ({ mode = 'receive', defaultBank = null, onClose, onSaved }) => {
  const isReceive = mode === 'receive';
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [receiveTypes, setReceiveTypes] = useState([]);
  const [otherLedgers, setOtherLedgers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankLoadError, setBankLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  // Escape closes (not while saving); focus moves in; Tab and page scroll stay put.
  useDialog(dialogRef, { open: true, onClose: submitting ? undefined : onClose });
  const [error, setError] = useState('');
  // Bank account picked on the ledger page; preselected once its company's accounts load.
  const preferredBankId = useRef(defaultBank ? String(defaultBank.id) : '');

  const [formData, setFormData] = useState({
    company_id: '',
    bank_id: '',
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
        const match = defaultBank && list.find(c => sameName(c.name, defaultBank.company));
        const initial = match || list[0];
        if (initial) setFormData(prev => ({ ...prev, company_id: String(initial.id) }));
      })
      .catch(() => setCompanies([]));
  }, [defaultBank]);

  useEffect(() => {
    if (!isReceive) return;
    api.get('/receive-types')
      .then(res => setReceiveTypes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setReceiveTypes([]));
  }, [isReceive]);

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
        const preferred = list.find(b => String(b.id) === preferredBankId.current);
        preferredBankId.current = '';
        setFormData(prev => ({ ...prev, bank_id: preferred ? String(preferred.id) : list.length > 0 ? String(list[0].id) : '' }));
      })
      .catch(() => { if (!cancelled) { setBankAccounts([]); setBankLoadError(true); } })
      .finally(() => { if (!cancelled) setLoadingBanks(false); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  const selectedBank = bankAccounts.find(b => String(b.id) === String(formData.bank_id));
  const usingOtherLedger = !!formData.other_ledger_id;
  const usingReceiveType = !!formData.receive_type;

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!formData.company_id) return setError('Please select a company');
    if (!formData.bank_id) return setError(isReceive ? 'Please select a bank account' : 'Please select the source bank account');
    if (!formData.date) return setError('Date is required');
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return setError('Amount must be greater than 0');
    if (isReceive) {
      if (usingReceiveType && usingOtherLedger) return setError('Select either a Receive Type or an Other Ledger, not both');
      if (!usingReceiveType && !usingOtherLedger) return setError('Please select a Receive Type or an Other Ledger');
    } else if (!usingOtherLedger) {
      return setError('Please select the Other Ledger to issue to');
    }
    if (!currentUser?.id) return setError('Please login again');

    setSubmitting(true);
    try {
      const payload = {
        company_id: formData.company_id,
        bank_id: formData.bank_id,
        date: formData.date,
        amount: amt,
        reference_number: formData.reference_number || null,
        remark: formData.remark || null
      };
      if (isReceive) {
        const res = await api.post('/finance/bank/receive', usingOtherLedger
          ? { ...payload, classification: 'other_ledger', other_ledger_id: formData.other_ledger_id }
          : { ...payload, classification: 'receive_type', receive_type: formData.receive_type });
        // Card payment: filed as Pending in the Card Ledger, so the bank balance is unchanged.
        if (onSaved) onSaved(res.data?.pending ? res.data.message : 'Bank receipt recorded successfully!', formData.bank_id);
      } else {
        await api.post('/finance/bank/issued', { ...payload, other_ledger_id: formData.other_ledger_id });
        if (onSaved) onSaved('Bank issued recorded successfully!', formData.bank_id);
      }
    } catch (err) {
      setError(err.response?.data?.error || (isReceive ? 'Failed to record bank receipt' : 'Failed to record bank issued'));
    } finally {
      setSubmitting(false);
    }
  };

  const title = isReceive ? 'Bank Received' : 'Bank Issued';

  return (
    // Backdrop is inert: an outside click must not discard what was typed.
    <div className="sl-modal-overlay">
      <div ref={dialogRef} className="sl-modal" role="dialog" aria-modal="true" aria-labelledby="bt-title">
        <div className="sl-modal-header">
          <h3 id="bt-title">
            <FontAwesomeIcon
              icon={isReceive ? faLandmark : faMoneyBillTransfer}
              style={{ color: isReceive ? '#16a34a' : '#dc2626', marginRight: '8px' }}
            />
            {title}
          </h3>
          <button type="button" className="sl-modal-close" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faTimes} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="sl-modal-body">
            {selectedBank && (
              <div className="sl-summary-card">
                <div className="sl-summary-row">
                  <span className="sl-summary-lbl">
                    {selectedBank.bank_name}{selectedBank.account_number ? ` — ${selectedBank.account_number}` : ''}
                  </span>
                  <strong>Rs. {parseFloat(selectedBank.current_balance || 0).toFixed(2)}</strong>
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} className="form-select">
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{isReceive ? 'Bank Account' : 'Source Bank Account'} <span className="required">*</span></label>
              <select name="bank_id" value={formData.bank_id} onChange={handleChange} disabled={loadingBanks} className="form-select">
                <option value="">
                  {loadingBanks ? 'Loading…' : bankLoadError ? 'Unable to load bank accounts' : bankAccounts.length === 0 ? 'No active bank accounts available' : 'Select bank account'}
                </option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date <span className="required">*</span></label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label>Amount (Rs.) <span className="required">*</span></label>
              <input type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" value={formData.amount} onChange={handleChange} placeholder="0.00" className="form-input" autoFocus />
            </div>
            {isReceive && (
              <>
                <div className="form-group">
                  <label>Receive Type {!usingOtherLedger && <span className="required">*</span>}</label>
                  <select name="receive_type" value={formData.receive_type} onChange={handleChange} disabled={usingOtherLedger} className="form-select">
                    <option value="">Select type</option>
                    {receiveTypes.map(type => (
                      <option key={type.id} value={type.type_name}>{type.type_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Other Ledger {!usingReceiveType && <span className="required">*</span>}</label>
                  <select name="other_ledger_id" value={formData.other_ledger_id} onChange={handleChange} disabled={usingReceiveType} className="form-select">
                    <option value="">Select Other Ledger</option>
                    {otherLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {formData.company_id && otherLedgers.length === 0 && (
                    <span className="fl-field-hint">No Other Ledger is linked to this company</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: '-4px 0 var(--spacing-sm)' }}>
                  Choose a Receive Type <strong>or</strong> an Other Ledger. To switch, clear the one already selected.
                </div>
              </>
            )}
            {!isReceive && (
              <div className="form-group">
                <label>Other Ledger (Issue To) <span className="required">*</span></label>
                <select name="other_ledger_id" value={formData.other_ledger_id} onChange={handleChange} className="form-select">
                  <option value="">Select Other Ledger</option>
                  {otherLedgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {formData.company_id && otherLedgers.length === 0 && (
                  <span className="fl-field-hint">No Other Ledger is linked to this company</span>
                )}
              </div>
            )}
            <div className="form-group">
              <label>Reference No (Optional)</label>
              <input
                type="text"
                name="reference_number"
                value={formData.reference_number}
                onChange={handleChange}
                placeholder={isReceive ? 'e.g. deposit slip number' : 'e.g. cheque / voucher number'}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Remark</label>
              <textarea name="remark" rows={2} value={formData.remark} onChange={handleChange} placeholder="Add a note..." className="form-textarea" />
            </div>
            {error && <div className="sl-modal-error" role="alert">{error}</div>}
          </div>
          <div className="sl-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting
                ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                : <><FontAwesomeIcon icon={faCheck} /> Save</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankTransactionModal;
