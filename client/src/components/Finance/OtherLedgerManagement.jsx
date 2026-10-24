// src/components/Finance/OtherLedgerManagement.jsx
//
// Management -> Other Ledgers (Director, Biyagama, AR, Short, Excess, ...).
// Follows the Receive Types management pattern. The balance is derived on the
// server from the ledger transactions and is read-only here. Ledgers are never
// deleted - "Inactive" hides one from new transactions but keeps its history.
// Company-wise: each ledger is linked to the companies that may post to it, and
// its balance is shown per company (companies are never added together).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FiSearch, FiPlus, FiEdit, FiToggleLeft, FiToggleRight, FiDollarSign } from 'react-icons/fi';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import usePermissions from '../../hooks/usePermissions';

import { useConfirm } from '../common/ui';
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OtherLedgerManagement = () => {
  const confirm = useConfirm();
  const { canWrite } = usePermissions();
  const { showPopup } = usePopup();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [newName, setNewName] = useState('');
  const [newCompanyIds, setNewCompanyIds] = useState([]);
  const [editName, setEditName] = useState('');
  const [editCompanyIds, setEditCompanyIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFor, setOpeningFor] = useState(null); // the ledger an Opening Balance is being set for, or null
  const [openingCompanyId, setOpeningCompanyId] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [savingOpening, setSavingOpening] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/other-ledgers');
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      showPopup('error', 'Failed to load Other Ledgers');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get('/purchases/companies')
      .then((res) => setCompanies(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCompanies([]));
  }, []);

  const toggleId = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const companyPicker = (selected, setSelected) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
      <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Companies:</span>
      {companies.map((c) => (
        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((prev) => toggleId(prev, c.id))} />
          {c.name}
        </label>
      ))}
    </div>
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return showPopup('error', 'Name is required');
    if (newCompanyIds.length === 0) return showPopup('error', 'Select at least one company');
    setSubmitting(true);
    try {
      await api.post('/other-ledgers', { name: newName.trim(), company_ids: newCompanyIds });
      showPopup('success', 'Other Ledger added');
      setNewName('');
      setNewCompanyIds([]);
      setShowAddForm(false);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add Other Ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (!editName.trim()) return showPopup('error', 'Name is required');
    if (editCompanyIds.length === 0) return showPopup('error', 'Select at least one company');
    setSubmitting(true);
    try {
      await api.put(`/other-ledgers/${editingRecord.id}`, { name: editName.trim(), company_ids: editCompanyIds });
      showPopup('success', 'Other Ledger updated');
      setEditingRecord(null);
      setEditName('');
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update Other Ledger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (record) => {
    const makeActive = record.status !== 1;
    const message = makeActive
      ? `Activate "${record.name}"?`
      : `Make "${record.name}" inactive? It will no longer appear in new transactions, but its history is kept.`;
    if (!await confirm(message)) return;
    try {
      await api.patch(`/other-ledgers/${record.id}/status`, { status: makeActive ? 1 : 0 });
      showPopup('success', makeActive ? `"${record.name}" activated` : `"${record.name}" made inactive`);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to change status');
    }
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditName(record.name);
    setEditCompanyIds((record.companies || []).map((c) => c.id));
    setShowAddForm(false);
    setOpeningFor(null);
  };

  const openOpeningBalance = (record) => {
    setOpeningFor(record);
    setOpeningCompanyId((record.companies || [])[0]?.id ?? '');
    setOpeningDate(''); // must predate every other entry for the chosen company - no safe default
    setOpeningAmount('');
    setShowAddForm(false);
    setEditingRecord(null);
  };

  const handleSetOpeningBalance = async (e) => {
    e.preventDefault();
    const amt = parseFloat(openingAmount);
    if (!openingCompanyId) return showPopup('error', 'Select a company');
    if (Number.isNaN(amt)) return showPopup('error', 'Enter a valid opening balance');
    setSavingOpening(true);
    try {
      await api.post(`/other-ledgers/${openingFor.id}/opening-balance`, {
        company_id: openingCompanyId, date: openingDate, amount: amt
      });
      showPopup('success', `Opening balance set for "${openingFor.name}"`);
      setOpeningFor(null);
      await fetchAll();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to set opening balance');
    } finally {
      setSavingOpening(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    return t ? records.filter((r) => r.name.toLowerCase().includes(t)) : records;
  }, [records, searchTerm]);

  const inputStyle = { flex: 1, minWidth: 200, height: 'var(--input-height)', padding: '0 0.75rem', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' };

  return (
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>Other Ledgers</h2>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingRecord(null); setOpeningFor(null); }}>
            <FiPlus size={16} /> Add Other Ledger
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input type="text" placeholder="Search Other Ledgers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {showAddForm && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-primary)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text" autoFocus maxLength={100} required
              placeholder="e.g. Director, Biyagama, AR, Short, Excess"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ ...inputStyle, border: '1px solid var(--color-border)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
            {companyPicker(newCompanyIds, setNewCompanyIds)}
          </form>
        </div>
      )}

      {editingRecord && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-warning)' }}>
          <form onSubmit={handleEdit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
              Editing: <em style={{ color: 'var(--color-text-primary)', fontStyle: 'normal' }}>{editingRecord.name}</em>
            </label>
            <input
              type="text" autoFocus maxLength={100} required
              value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ ...inputStyle, border: '1px solid var(--color-primary)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingRecord(null)}>Cancel</button>
            {companyPicker(editCompanyIds, setEditCompanyIds)}
          </form>
        </div>
      )}

      {openingFor && (
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--color-success)' }}>
          <form onSubmit={handleSetOpeningBalance} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
              Opening balance for: <em style={{ color: 'var(--color-text-primary)', fontStyle: 'normal' }}>{openingFor.name}</em>
            </label>
            <select
              required value={openingCompanyId} onChange={(e) => setOpeningCompanyId(e.target.value)}
              style={{ ...inputStyle, flex: '0 0 160px', border: '1px solid var(--color-border)' }}
            >
              <option value="" disabled>Select company</option>
              {(openingFor.companies || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              type="date" required aria-label="Opening balance date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)}
              style={{ ...inputStyle, flex: '0 0 160px', border: '1px solid var(--color-border)' }}
            />
            <input
              type="number" step="0.01" required placeholder="Opening amount" autoFocus
              value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)}
              style={{ ...inputStyle, flex: '0 0 180px', border: '1px solid var(--color-border)' }}
            />
            <button type="submit" className="btn btn-primary" disabled={savingOpening}>{savingOpening ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpeningFor(null)}>Cancel</button>
            <span className="text-muted font-sm" style={{ flexBasis: '100%' }}>
              The date must be earlier than this Other Ledger's earliest entry for the chosen company, if it has any. You can enter a negative amount to open overdrawn.
            </span>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading-state" role="status" aria-live="polite"><div className="loading-spinner"></div>Loading Other Ledgers…</div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <p>{records.length === 0 ? 'No Other Ledgers yet. Add your first one to get started.' : `No results for "${searchTerm}".`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>COMPANIES</th>
                  <th style={{ textAlign: 'right' }}>BALANCE (PER COMPANY)</th>
                  <th style={{ textAlign: 'center' }}>ACTIONS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} style={rec.status === 1 ? undefined : { opacity: 0.65 }}>
                    <td>
                      <strong>{rec.name}</strong>
                      {rec.is_system && <span className="badge badge-neutral" style={{ marginLeft: '8px' }} title="Used by Collection - cannot be renamed or made inactive">System</span>}
                    </td>
                    <td>
                      {(rec.companies || []).length === 0
                        ? <span className="badge badge-warning" title="Edit this ledger and link its companies before it can be used">Not linked</span>
                        : rec.companies.map((c) => c.name).join(', ')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(rec.company_balances || []).length === 0 ? fmt(0) : rec.company_balances.map((b) => (
                        <div key={b.company_id} style={{ whiteSpace: 'nowrap' }}>
                          <span className="text-muted font-sm">{b.company_name}:</span> {fmt(b.balance)}
                        </div>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!canWrite ? '—' : (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {!rec.is_system && (
                            <button type="button" className="btn-icon edit" onClick={() => openEdit(rec)} title="Edit"><FiEdit size={14} /></button>
                          )}
                          {(rec.companies || []).length > 0 && (
                            <button type="button" className="btn-icon edit" onClick={() => openOpeningBalance(rec)} title="Set Opening Balance">
                              <FiDollarSign size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${rec.status === 1 ? 'badge-success' : 'badge-neutral'}`}>
                          {rec.status === 1 ? 'Active' : 'Inactive'}
                        </span>
                        {canWrite && !rec.is_system && (
                          <button
                            type="button"
                            className={`btn-icon ${rec.status === 1 ? 'delete' : 'edit'}`}
                            onClick={() => handleToggleStatus(rec)}
                            title={rec.status === 1 ? 'Make inactive' : 'Activate'}
                          >
                            {rec.status === 1 ? <FiToggleLeft size={14} /> : <FiToggleRight size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && records.length > 0 && (
        <p className="text-muted text-right font-sm" style={{ paddingRight: '8px' }}>
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default OtherLedgerManagement;
