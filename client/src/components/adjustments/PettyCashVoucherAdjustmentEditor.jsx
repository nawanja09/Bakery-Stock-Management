import React, { useEffect, useState } from 'react';
import api from '../../api';
import useExpenseTypes, { withSavedOption, findExpenseTypeId } from '../Expenses/useExpenseTypes';

const FIELDS = [
  ['voucher_number', 'Voucher Number', true], ['date', 'Voucher Date', true],
  ['employee_name', 'Employee Name'], ['payee', 'Payee', true], ['expense_type', 'Expenses Type', true],
  ['description', 'Description'], ['vehicle_number', 'Vehicle Number'], ['amount', 'Amount', true], ['receipt_no', 'Receipt Number']
];

export default function PettyCashVoucherAdjustmentEditor({ embeddedId, onCancel, onSaved }) {
  const [form, setForm] = useState(null);
  // Values as saved, so a legacy voucher (no Sub Expenses Type yet) can still
  // be adjusted without being forced to pick one while its type is unchanged.
  const [original, setOriginal] = useState({ expense_type_id: '', sub_expense_type_id: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { expenseTypes, subExpenseTypes, loadSubExpenseTypes } = useExpenseTypes();

  useEffect(() => {
    api.get('/expenses/petty-cash/vouchers?limit=1000').then(({ data }) => {
      const row = (data || []).find((item) => String(item.id) === String(embeddedId));
      if (!row) throw new Error('Voucher not found');
      const typeId = row.expense_type_id ? String(row.expense_type_id) : '';
      setForm({
        ...row,
        date: row.date || '',
        amount: String(row.amount ?? ''),
        expense_type_id: typeId,
        sub_expense_type_id: row.sub_expense_type_id ? String(row.sub_expense_type_id) : '',
        sub_expense_type: row.sub_expense_type || ''
      });
      setOriginal({ expense_type_id: typeId, sub_expense_type_id: row.sub_expense_type_id ? String(row.sub_expense_type_id) : '' });
      loadSubExpenseTypes(typeId);
    }).catch((e) => setError(e.message || 'Unable to load voucher'));
  }, [embeddedId, loadSubExpenseTypes]);

  // A legacy voucher stored only the type name; once the managed list has
  // loaded, link it to the matching Expenses Type so its Sub Expenses Type
  // options can be offered.
  useEffect(() => {
    if (!form || form.expense_type_id || !form.expense_type || !expenseTypes.length) return;
    const matchId = findExpenseTypeId(expenseTypes, null, form.expense_type);
    if (!matchId) return;
    setForm((current) => (current && !current.expense_type_id ? { ...current, expense_type_id: matchId } : current));
    setOriginal((current) => (current.expense_type_id ? current : { ...current, expense_type_id: matchId }));
    loadSubExpenseTypes(matchId);
  }, [form, expenseTypes, loadSubExpenseTypes]);

  if (!form) return <p>{error || 'Loading voucher…'}</p>;
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

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

  const legacyBlankSub = !original.sub_expense_type_id && String(form.expense_type_id) === String(original.expense_type_id);
  const subRequired = subExpenseTypes.length > 0 && !legacyBlankSub;
  // A legacy name with no managed match is kept visible as its own option.
  const typeOptions = withSavedOption(expenseTypes, form.expense_type_id, form.expense_type);
  const typeValue = form.expense_type_id || (form.expense_type ? `saved:${form.expense_type}` : '');

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.put(`/expenses/petty-cash/voucher/${embeddedId}`, {
        ...form, voucher_date: form.date, payee_name: form.payee, company_id: form.company_id,
        expense_type_id: form.expense_type_id || null,
        sub_expense_type_id: form.sub_expense_type_id || null
      }, { headers: { 'X-RM-Adjustment': 'true' } });
      onSaved?.();
    } catch (e) { setError(e.response?.data?.error || 'Unable to save voucher'); }
    finally { setSaving(false); }
  };

  const renderField = ([key, label, required]) => {
    if (key === 'expense_type') {
      return <React.Fragment key={key}>
        <label className="form-group">{label}
          <select value={typeValue} required onChange={(e) => changeExpenseType(e.target.value)}>
            <option value="" disabled>Select Expenses Type</option>
            {typeOptions.map((type) => <option key={type.id} value={type.id} disabled={String(type.id).startsWith('saved:')}>{type.name}</option>)}
          </select>
        </label>
        <label className="form-group">Sub Expenses Type
          <select value={form.sub_expense_type_id || ''} required={subRequired} disabled={!form.expense_type_id}
            onChange={(e) => changeSubExpenseType(e.target.value)}>
            <option value="">{form.expense_type_id ? 'Select Sub Expenses Type' : 'Select Expenses Type first'}</option>
            {withSavedOption(subExpenseTypes, form.sub_expense_type_id, form.sub_expense_type).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
          </select>
        </label>
      </React.Fragment>;
    }
    return <label className="form-group" key={key}>{label}
      {key === 'description' ? <textarea value={form[key] || ''} onChange={(e) => change(key, e.target.value)} /> :
        <input type={key === 'date' ? 'date' : key === 'amount' ? 'number' : 'text'} step={key === 'amount' ? '0.01' : undefined} value={form[key] || ''} required={required} onChange={(e) => change(key, e.target.value)} />}
    </label>;
  };

  return <form className="adjustments-form" onSubmit={save}>
    <h3>Edit Petty Cash Voucher</h3>
    <div className="form-grid">{FIELDS.map(renderField)}</div>
    {error && <div className="alert-message error">{error}</div>}
    <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</button></div>
  </form>;
}
