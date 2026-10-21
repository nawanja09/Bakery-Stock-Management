import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddPayeeForm from './AddPayeeForm';
import { PageHeader, EmptyState, StatusBadge, ConfirmDialog } from '../../common/ui';
import '../common/ManagementList.css';

// Same structure and design as RMManagementList (used by Companies, RM Item
// Types, Departments) but with the extra VAT Reg Number column that a
// Payee record needs. Backed by the existing /api/payees endpoints.
const PayeeManagementList = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { showPopup } = usePopup();

  const pageTitle = 'Payee';
  const apiPath = '/payees';

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await api.get(apiPath);
      setRecords(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching payees:', err);
      showPopup('error', 'Failed to load payees');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (value) => {
    try {
      const response = await api.post(apiPath, value);
      showPopup('success', response.data?.message || 'Payee added successfully');
      setShowAddForm(false);
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add payee');
      throw err;
    }
  };

  const handleEdit = async (value) => {
    if (!editingRecord) return;

    try {
      const response = await api.put(`${apiPath}/${editingRecord.id}`, value);
      showPopup('success', response.data?.message || 'Payee updated successfully');
      setEditingRecord(null);
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update payee');
      throw err;
    }
  };

  const handleDelete = async (record) => {
    setDeleting(true);
    try {
      const response = await api.delete(`${apiPath}/${record.id}`);
      showPopup('success', response.data?.message || 'Payee deleted successfully');
      setPendingDelete(null);
      await fetchRecords();
    } catch (err) {
      setPendingDelete(null);
      showPopup('error', err.response?.data?.error || 'Failed to delete payee');
    } finally {
      setDeleting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.trim().toLowerCase();
    return records.filter((rec) =>
      String(rec.payee_name || '').toLowerCase().includes(term) ||
      String(rec.vat_reg_number || '').toLowerCase().includes(term)
    );
  }, [records, searchTerm]);

  const closeEditor = () => setEditingRecord(null);

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Master data"
        title={pageTitle}
        subtitle="Payees used on expense vouchers"
        badge={!loading && <span className="ui-count-badge">{records.length}</span>}
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            <FiPlus size={16} /> Add Payee
          </button>
        )}
      />

      <div className="ui-toolbar">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input
            type="text"
            placeholder="Search payees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {showAddForm && (
        <AddPayeeForm
          title="Add New Payee"
          submitLabel="Add Payee"
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingRecord && (
        <AddPayeeForm
          title="Edit Payee"
          submitLabel="Save Changes"
          onSubmit={handleEdit}
          onCancel={closeEditor}
          initialValue={{
            payee_name: editingRecord.payee_name,
            vat_reg_number: editingRecord.vat_reg_number
          }}
        />
      )}

      <div className="ui-table-card">
        {loading ? (
          <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-spinner"></div>
            Loading {pageTitle}...
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            title={records.length === 0 ? 'No payees yet' : 'No matches'}
            description={records.length === 0 ? 'No payees found. Add your first payee to get started.' : `No results found for "${searchTerm}".`}
            action={records.length === 0 && (
              <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                <FiPlus size={16} /> Add Payee
              </button>
            )}
          />
        ) : (
          <div className="ui-table-scroll">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>PAYEE NAME</th>
                  <th>VAT REG NO</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td><strong>{rec.payee_name}</strong></td>
                    <td>{rec.vat_reg_number || '-'}</td>
                    <td>
                      {Number(rec.status) === 1 || rec.status === 'Active'
                        ? <StatusBadge status="Active" tone="success" />
                        : <StatusBadge status="Inactive" tone="neutral" />}
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-icon edit"
                          onClick={() => setEditingRecord(rec)}
                          title="Edit"
                          aria-label={`Edit ${rec.payee_name}`}
                        >
                          <FiEdit size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon delete"
                          onClick={() => setPendingDelete(rec)}
                          title="Delete"
                          aria-label={`Delete ${rec.payee_name}`}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && records.length > 0 && (
          <div className="ui-table-footer">
            <span>Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete payee?"
          message={<>"<strong>{pendingDelete.payee_name}</strong>" will be removed. This cannot be undone.</>}
          confirmText="Delete"
          busy={deleting}
          onConfirm={() => handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};

export default PayeeManagementList;
