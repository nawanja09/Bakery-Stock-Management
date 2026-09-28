import React, { useEffect, useState } from 'react';
import api from '../../api';
import useExpenseTypes, { withSavedOption } from '../Expenses/useExpenseTypes';

// Expenses Type / Sub Expenses Type are dropdowns fed by Expenses Type
// Management (rendered separately below), not free-text fields.
const FIELDS = [
  ['bill_date', 'Bill Date', 'date'], ['bill_number', 'Bill Number', 'text'], ['payee_name', 'Payee', 'text'],
  ['vat_reg_number', 'VAT Registration Number', 'text'],
  ['without_vat_amount', 'Amount Before VAT', 'number'],
  ['vat_amount', 'VAT Amount', 'number'], ['total_bill_amount', 'Total Amount', 'number'], ['description', 'Description', 'text']
];
export default function ExpenseBillAdjustmentEditor({ embeddedId, onCancel, onSaved }) {
  const [form, setForm] = useState(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const { expenseTypes, subExpenseTypes, loadSubExpenseTypes } = useExpenseTypes();
  useEffect(() => {
    let active = true;
    setForm(null);
    setError('');
    Promise.all([api.get(`/new-expenses/${embeddedId}`), api.get('/purchases/companies')]).then(([{ data }, companyResponse]) => {
      if (active) {
        setForm({
          ...data,
          company_id: String(data.company_id ?? ''),
          expense_type_id: data.expense_type_id ? String(data.expense_type_id) : '',
          sub_expense_type_id: data.sub_expense_type_id ? String(data.sub_expense_type_id) : ''
        });
        setCompanies(companyResponse.data || []);
        loadSubExpenseTypes(data.expense_type_id);
      }
    }).catch((e) => {
      if (active) setError(e.response?.data?.error || e.message || 'Unable to load expense');
    });
    return () => { active = false; };
  }, [embeddedId, loadSubExpenseTypes]);
  if (!form) return <p>{error || 'Loading expense…'}</p>;

  const changeExpenseType = (id) => {
    const type = expenseTypes.find((t) => String(t.id) === String(id));
    setForm((current) => ({
      ...current, expense_type_id: id, expense_type: type ? type.name : '', sub_expense_type_id: '', sub_expense_type: ''
    }));
    loadSubExpenseTypes(id);
  };
  const changeSubExpenseType = (id) => {
    const sub = subExpenseTypes.find((s) => String(s.id) === String(id));
    setForm((current) => ({ ...current, sub_expense_type_id: id, sub_expense_type: sub ? sub.name : '' }));
  };

  const save = async (event) => { event.preventDefault(); setSaving(true); setError(''); try {
    await api.put(`/new-expenses/${embeddedId}`, form, { headers: { 'X-RM-Adjustment': 'true' } }); onSaved?.();
  } catch (e) { setError(e.response?.data?.error || 'Unable to save expense'); } finally { setSaving(false); } };
  return <form className="adjustments-form" onSubmit={save}><h3>Edit Expense Bill</h3><div className="form-grid">{FIELDS.slice(0, 4).map(([key, label, type]) => <label className="form-group" key={key}>{label}<input type={type} step={type === 'number' ? '0.01' : undefined} value={form[key] ?? ''} required={['bill_date','payee_name'].includes(key)} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
    <label className="form-group">Expenses Type<select value={form.expense_type_id || ''} required onChange={(e) => changeExpenseType(e.target.value)}><option value="" disabled>Select Expenses Type</option>{withSavedOption(expenseTypes, form.expense_type_id, form.expense_type).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    <label className="form-group">Sub Expenses Type<select value={form.sub_expense_type_id || ''} required disabled={!form.expense_type_id} onChange={(e) => changeSubExpenseType(e.target.value)}><option value="" disabled>{form.expense_type_id ? 'Select Sub Expenses Type' : 'Select Expenses Type first'}</option>{withSavedOption(subExpenseTypes, form.sub_expense_type_id, form.sub_expense_type).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></label>
    {FIELDS.slice(4).map(([key, label, type]) => <label className="form-group" key={key}>{label}<input type={type} step={type === 'number' ? '0.01' : undefined} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
    <label className="form-group">Company Name<select value={form.company_id || ''} required onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="" disabled>Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
    </div>
    {error && <div className="alert-message error">{error}</div>}<div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</button></div></form>;
}
