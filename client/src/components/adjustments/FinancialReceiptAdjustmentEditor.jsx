import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';

const FinancialReceiptAdjustmentEditor = ({ embeddedId, category, source, onCancel, onSaved }) => {
  const { showPopup } = usePopup();
  const [form, setForm] = useState(null);
  const [receiveTypes, setReceiveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [recordResponse, typesResponse] = await Promise.all([
          api.get(`/adjustments/records/${encodeURIComponent(category)}/${source}/${embeddedId}`),
          api.get('/receive-types')
        ]);
        if (!active) return;
        const record = recordResponse.data;
        setForm({
          date: String(record.date || '').slice(0, 10),
          company_name: record.company_name || '',
          bank_name: record.bank_name || '',
          account_number: record.account_number || '',
          receive_type: record.receive_type || '',
          reference_number: record.reference_number || '',
          amount: String(record.amount ?? ''),
          remark: record.remark || '',
          status: record.status || ''
        });
        setReceiveTypes(Array.isArray(typesResponse.data) ? typesResponse.data : []);
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.error || 'Unable to load receive record details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [category, embeddedId, source]);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    const parsedAmount = Number(form.amount);
    if (!form.date) return setError('Date is required.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('Amount must be greater than 0.');
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
          remark: form.remark || null
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

  return (
    <form className="adjustments-form" onSubmit={save}>
      <h3>Edit {category}</h3>
      <div className="form-grid">
        <label className="form-group">Company
          <input className="form-input" value={form.company_name} disabled readOnly />
        </label>
        {category === 'Bank Receive' && (
          <label className="form-group">Bank Account
            <input className="form-input" value={`${form.bank_name}${form.account_number ? ` — ${form.account_number}` : ''}`} disabled readOnly />
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
      {source === 'card' && form.status !== 'Pending' && (
        <div className="alert-message info">This card receipt has been completed in the Card Ledger and is read-only.</div>
      )}
      {error && <div className="alert-message error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving || (source === 'card' && form.status !== 'Pending')}>
          {saving ? 'Saving…' : 'Save Adjustment'}
        </button>
      </div>
    </form>
  );
};

export default FinancialReceiptAdjustmentEditor;
