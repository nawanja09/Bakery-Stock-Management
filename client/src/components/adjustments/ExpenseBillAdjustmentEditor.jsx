import React, { useEffect, useState } from 'react';
import api from '../../api';

const FIELDS = [
  ['bill_date', 'Bill Date', 'date'], ['bill_number', 'Bill Number', 'text'], ['payee_name', 'Payee', 'text'],
  ['vat_reg_number', 'VAT Registration Number', 'text'], ['expense_type_id', 'Expense Type ID', 'number'],
  ['expense_type', 'Expense Type', 'text'], ['sub_expense_type_id', 'Sub Expense Type ID', 'number'],
  ['sub_expense_type', 'Sub Expense Type', 'text'], ['without_vat_amount', 'Amount Before VAT', 'number'],
  ['vat_amount', 'VAT Amount', 'number'], ['total_bill_amount', 'Total Amount', 'number'], ['description', 'Description', 'text']
];
export default function ExpenseBillAdjustmentEditor({ embeddedId, onCancel, onSaved }) {
  const [form, setForm] = useState(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setForm(null);
    setError('');
    api.get(`/new-expenses/${embeddedId}`).then(({ data }) => {
      if (active) setForm({ ...data });
    }).catch((e) => {
      if (active) setError(e.response?.data?.error || e.message || 'Unable to load expense');
    });
    return () => { active = false; };
  }, [embeddedId]);
  if (!form) return <p>{error || 'Loading expense…'}</p>;
  const save = async (event) => { event.preventDefault(); setSaving(true); setError(''); try {
    await api.put(`/new-expenses/${embeddedId}`, form, { headers: { 'X-RM-Adjustment': 'true' } }); onSaved?.();
  } catch (e) { setError(e.response?.data?.error || 'Unable to save expense'); } finally { setSaving(false); } };
  return <form className="adjustments-form" onSubmit={save}><h3>Edit Expense Bill</h3><div className="form-grid">{FIELDS.map(([key, label, type]) => <label className="form-group" key={key}>{label}<input type={type} step={type === 'number' ? '0.01' : undefined} value={form[key] ?? ''} required={['bill_date','payee_name','expense_type_id','sub_expense_type_id','company_id'].includes(key)} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
    <label className="form-group">Company ID<input type="number" value={form.company_id || ''} required onChange={(e) => setForm({ ...form, company_id: e.target.value })} /></label>
    {error && <div className="alert-message error">{error}</div>}<div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</button></div></form>;
}
