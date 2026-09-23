import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit, FiPlus, FiPower, FiSearch, FiX } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import '../common/ManagementList.css';

const emptyForm = { expense_type_id: '', name: '', status: '1' };

const SubExpenseTypeManagement = () => {
  const { showPopup } = usePopup();
  const [records, setRecords] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchRecords = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/sub-expense-types');
      setRecords(response.data || []);
    } catch (error) {
      console.error('Error loading sub expense types:', error);
      showPopup('error', 'Failed to load sub expense types');
    } finally {
      setIsLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    const fetchExpenseTypes = async () => {
      try {
        const response = await api.get('/expense-types');
        setExpenseTypes(response.data || []);
      } catch (error) {
        console.error('Error loading expense types:', error);
        showPopup('error', 'Failed to load expense types');
      }
    };
    fetchRecords();
    fetchExpenseTypes();
  }, [fetchRecords, showPopup]);

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return records;
    return records.filter(record =>
      record.name.toLowerCase().includes(query) ||
      record.expense_type_name.toLowerCase().includes(query)
    );
  }, [records, searchTerm]);

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsEditorOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    setForm({
      expense_type_id: String(record.expense_type_id),
      name: record.name,
      status: String(record.status)
    });
    setIsEditorOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.expense_type_id || !form.name.trim()) {
      showPopup('error', 'Expense type and sub expense type name are required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), status: Number(form.status) };
      const response = editingId
        ? await api.put(`/sub-expense-types/${editingId}`, payload)
        : await api.post('/sub-expense-types', payload);
      showPopup('success', response.data?.message || 'Sub expense type saved successfully');
      closeEditor();
      await fetchRecords();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to save sub expense type');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (record) => {
    const nextStatus = record.status ? 0 : 1;
    const action = nextStatus ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} "${record.name}"?`)) return;
    try {
      const response = await api.patch(`/sub-expense-types/${record.id}/status`, { status: nextStatus });
      showPopup('success', response.data?.message || 'Status updated successfully');
      await fetchRecords();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>Sub Expenses Type Management</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          <FiPlus size={16} /> Add Sub Expense Type
        </button>
      </div>

      <div className="filters-section">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search expense or sub expense types..." />
        </div>
      </div>

      {isEditorOpen && (
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit Sub Expense Type' : 'Add Sub Expense Type'}</h3>
            <button type="button" className="btn-icon" onClick={closeEditor} title="Close"><FiX size={16} /></button>
          </div>
          <form onSubmit={handleSubmit} className="form-grid two-col">
            <div className="form-group">
              <label>Expenses Type <span className="required">*</span></label>
              <select className="form-control" value={form.expense_type_id} onChange={(event) => setForm(current => ({ ...current, expense_type_id: event.target.value }))} required>
                <option value="">Select Expense Type</option>
                {expenseTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Sub Expenses Type Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={(event) => setForm(current => ({ ...current, name: event.target.value }))} maxLength="100" required />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.status} onChange={(event) => setForm(current => ({ ...current, status: event.target.value }))}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            <div className="form-actions" style={{ alignSelf: 'end', display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={closeEditor} disabled={isSaving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? <div className="loading-state"><div className="loading-spinner" /> Loading sub expense types...</div> : (
          <div className="overflow-x-auto">
            <table className="erp-data-table">
              <thead><tr><th>EXPENSES TYPE</th><th>SUB EXPENSES TYPE</th><th>STATUS</th><th style={{ textAlign: 'right' }}>ACTIONS</th></tr></thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr><td colSpan="4" className="empty-state">{records.length ? 'No matching sub expense types found.' : 'No sub expense types found. Add your first sub expense type to get started.'}</td></tr>
                ) : filteredRecords.map(record => (
                  <tr key={record.id}>
                    <td>{record.expense_type_name}</td>
                    <td><strong>{record.name}</strong></td>
                    <td><span className={`badge ${record.status ? 'badge-success' : 'badge-neutral'}`}>{record.status ? 'Active' : 'Inactive'}</span></td>
                    <td><div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-icon edit" title="Edit" onClick={() => openEdit(record)}><FiEdit size={14} /></button>
                      <button type="button" className={record.status ? 'btn-icon delete' : 'btn-icon edit'} title={record.status ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(record)}><FiPower size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubExpenseTypeManagement;
