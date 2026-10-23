import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';

const FinancialReceiptAdjustmentEditor = ({ embeddedId, category, source, onCancel, onSaved }) => {
  const { showPopup } = usePopup();
  const [form, setForm] = useState(null);
  const [receiveTypes, setReceiveTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyBanks, setCompanyBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isBankReceive = category === 'Bank Receive';
  // A realised (Completed) card receipt already posted its Bank Ledger debit
  // and Hidden Expenses under its Company / Bank Account: moving it means
  // unwinding and re-posting the whole realisation, not a field correction -
  // reverse it to Pending in Card Ledger first. Receive Type for a card
  // receipt is always "Visa Card Payment" (it is not a stored column; the row
  // lives in the Card Ledger because it IS one) and can never be changed here.
  const cardLocked = source === 'card' && form?.status && form.status !== 'Pending';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [recordResponse, typesResponse, companiesResponse] = await Promise.all([
          api.get(`/adjustments/records/${encodeURIComponent(category)}/${source}/${embeddedId}`),
          api.get('/receive-types'),
          api.get('/purchases/companies')
        ]);
        if (!active) return;
        const record = recordResponse.data;
        setForm({
          date: String(record.date || '').slice(0, 10),
          company_id: record.company_id != null ? String(record.company_id) : '',
          bank_id: record.bank_id != null ? String(record.bank_id) : '',
          // Kept only so its current Bank Account still shows in the list below
          // if that account has since been deactivated (and so is not among the
          // active ones /finance/bank/accounts returns).
          bank_name: record.bank_name || '',
          account_number: record.account_number || '',
          receive_type: record.receive_type || '',
          reference_number: record.reference_number || '',
          amount: String(record.amount ?? ''),
          remark: record.remark || '',
          status: record.status || ''
        });
        setReceiveTypes(Array.isArray(typesResponse.data) ? typesResponse.data : []);
        setCompanies(Array.isArray(companiesResponse.data) ? companiesResponse.data : []);
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.error || 'Unable to load receive record details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [category, embeddedId, source]);

  // Bank Account options follow the chosen Company; its own bank is kept
  // selected if the Company (and therefore the list) has not changed yet.
  useEffect(() => {
    if (!isBankReceive || !form?.company_id) { setCompanyBanks([]); return undefined; }
    let active = true;
    setLoadingBanks(true);
    api.get('/finance/bank/accounts', { params: { companyId: form.company_id } })
      .then((res) => { if (active) setCompanyBanks(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (active) setCompanyBanks([]); })
      .finally(() => { if (active) setLoadingBanks(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBankReceive, form?.company_id]);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const changeCompany = (value) => setForm((current) => ({ ...current, company_id: value, bank_id: '' }));

  const save = async (event) => {
    event.preventDefault();
    const parsedAmount = Number(form.amount);
    if (!form.date) return setError('Date is required.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('Amount must be greater than 0.');
    if (!form.company_id) return setError('Company is required.');
    if (isBankReceive && !form.bank_id) return setError('Bank Account is required.');
    if (!form.receive_type) return setError('Receive type is required.');

    setSaving(true);
    setError('');
    try {
      await api.put(
        `/adjustments/records/${encodeURIComponent(category)}/${source}/${embeddedId}`,
        {
          date: form.date,
          amount: parsedAmount,
          receive_type: form.receive_type,
          reference_number: form.reference_number || null,
          remark: form.remark || null,
          company_id: Number(form.company_id),
          ...(isBankReceive ? { bank_id: Number(form.bank_id) } : {})
        }
      );
      showPopup('success', `${category} adjustment saved successfully!`);
      onSaved?.();
    } catch (saveError) {
      setError(saveError.response?.data?.error || `Unable to save ${category.toLowerCase()} adjustment.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p><FontAwesomeIcon icon={faSpinner} spin /> Loading receive details...</p>;
  }
  if (!form) {
    return <div className="form-section">
      <div className="alert-message error">{error}</div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Back</button>
      </div>
    </div>;
  }

  const availableTypes = receiveTypes.map((type) => type.type_name);
  if (form.receive_type && !availableTypes.includes(form.receive_type)) availableTypes.unshift(form.receive_type);
  if (source === 'card' && !availableTypes.includes('Visa Card Payment')) availableTypes.unshift('Visa Card Payment');

  // Its own bank stays in the list even if deactivated since, or while the
  // Company's list is still loading.
  const bankOptions = form.bank_id && !companyBanks.some((bank) => String(bank.id) === form.bank_id)
    ? [{ id: form.bank_id, bank_name: form.bank_name, account_number: form.account_number }, ...companyBanks]
    : companyBanks;

  return (
    <form className="adjustments-form" onSubmit={save}>
      <h3>Edit {category}</h3>
      <div className="form-grid">
        <label className="form-group">Company <span className="required">*</span>
          <select className="form-input" value={form.company_id} required disabled={cardLocked}
            onChange={(event) => changeCompany(event.target.value)}>
            <option value="" disabled>Select company</option>
            {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </label>
        {isBankReceive && (
          <label className="form-group">Bank Account <span className="required">*</span>
            <select className="form-input" value={form.bank_id} required disabled={cardLocked || !form.company_id || loadingBanks}
              onChange={(event) => change('bank_id', event.target.value)}>
              <option value="" disabled>{loadingBanks ? 'Loading...' : 'Select bank account'}</option>
              {bankOptions.map((bank) => (
                <option key={bank.id} value={String(bank.id)}>
                  {bank.bank_name}{bank.account_number ? ` — ${bank.account_number}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-group">Date <span className="required">*</span>
          <input className="form-input" type="date" value={form.date} required onChange={(event) => change('date', event.target.value)} />
        </label>
        <label className="form-group">Amount (Rs.) <span className="required">*</span>
          <input className="form-input" type="number" min="0.01" step="0.01" value={form.amount} required
            onChange={(event) => change('amount', event.target.value)} />
        </label>
        <label className="form-group">Receive Type <span className="required">*</span>
          <select className="form-input" value={form.receive_type} required disabled={source === 'card'}
            title={source === 'card' ? "A card receipt is always \"Visa Card Payment\" and cannot be reclassified here" : undefined}
            onChange={(event) => change('receive_type', event.target.value)}>
            <option value="" disabled>Select receive type</option>
            {availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="form-group">Reference No.
          <input className="form-input" maxLength={100} value={form.reference_number}
            onChange={(event) => change('reference_number', event.target.value)} />
        </label>
        <label className="form-group">Description / Remark
          <textarea className="form-textarea" maxLength={255} rows={3} value={form.remark}
            onChange={(event) => change('remark', event.target.value)} />
        </label>
      </div>
      {source === 'card' && form.status && form.status !== 'Pending' && (
        <div className="alert-message info">
          This card receipt is {form.status} in the Card Ledger. Amount changes only apply when its realisation covers a single
          transaction; Company and Bank Account are fixed here - reverse it to Pending in Card Ledger first to move it.
        </div>
      )}
      {error && <div className="alert-message error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Adjustment'}
        </button>
      </div>
    </form>
  );
};

export default FinancialReceiptAdjustmentEditor;
