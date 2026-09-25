import React, { useEffect, useState } from 'react';
import api from '../../api';

const FIELDS = [
  ['voucher_number', 'Voucher Number', true], ['date', 'Voucher Date', true],
  ['employee_name', 'Employee Name'], ['payee', 'Payee', true], ['expense_type', 'Expense Type', true],
  ['description', 'Description'], ['vehicle_number', 'Vehicle Number'], ['amount', 'Amount', true], ['receipt_no', 'Receipt Number']
];

export default function PettyCashVoucherAdjustmentEditor({ embeddedId, onCancel, onSaved }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get('/expenses/petty-cash/vouchers?limit=1000').then(({ data }) => {
      const row = (data || []).find((item) => String(item.id) === String(embeddedId));
      if (!row) throw new Error('Voucher not found');
      setForm({ ...row, date: row.date || '', amount: String(row.amount ?? '') });
    }).catch((e) => setError(e.message || 'Unable to load voucher'));
  }, [embeddedId]);
  if (!form) return <p>{error || 'Loading voucher…'}</p>;
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.put(`/expenses/petty-cash/voucher/${embeddedId}`, {
        ...form, voucher_date: form.date, payee_name: form.payee, company_id: form.company_id
      }, { headers: { 'X-RM-Adjustment': 'true' } });
      onSaved?.();
    } catch (e) { setError(e.response?.data?.error || 'Unable to save voucher'); }
    finally { setSaving(false); }
  };
  return <form className="adjustments-form" onSubmit={save}>
    <h3>Edit Petty Cash Voucher</h3>
    <div className="form-grid">{FIELDS.map(([key, label, required]) => <label className="form-group" key={key}>{label}
      {key === 'description' ? <textarea value={form[key] || ''} onChange={(e) => change(key, e.target.value)} /> :
        <input type={key === 'date' ? 'date' : key === 'amount' ? 'number' : 'text'} step={key === 'amount' ? '0.01' : undefined} value={form[key] || ''} required={required} onChange={(e) => change(key, e.target.value)} />}
    </label>)}</div>
    {error && <div className="alert-message error">{error}</div>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</button></div>
  </form>;
}
