import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddSimpleNameForm from './AddSimpleNameForm';
import { PageHeader, EmptyState, StatusBadge, ConfirmDialog, ActionMenu } from '../../common/ui';
import './ManagementList.css';

const RMManagementList = ({
  pageTitle,
  subtitle,
  apiPath,
  nameField,
  nameColumnLabel,
  createPayloadKey,
  addButtonLabel,
  formTitle,
  formFieldLabel,
  formPlaceholder,
  formSubmitLabel,
  formNote,
  searchPlaceholder,
  emptyMessage
}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await api.get(apiPath);
      setRecords(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error(`Error fetching ${pageTitle}:`, err);
      showPopup('error', `Failed to load ${pageTitle}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (value) => {
    try {
      const response = await api.post(apiPath, { [createPayloadKey]: value });
      showPopup('success', response.data?.message || `${pageTitle} added successfully`);
      setShowAddForm(false);
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to add ${pageTitle}`);
      throw err;
    }
  };

  const handleEdit = async (value) => {
    if (!editingRecord) return;

    try {
      const response = await api.put(`${apiPath}/${editingRecord.id}`, { [createPayloadKey]: value });
      showPopup('success', response.data?.message || `${pageTitle} updated successfully`);
      setEditingRecord(null);
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to update ${pageTitle}`);
      throw err;
    }
  };

  const handleDelete = async (record) => {
    setDeleting(true);
    try {
      const response = await api.delete(`${apiPath}/${record.id}`);
      showPopup('success', response.data?.message || `${pageTitle} deleted successfully`);
      setPendingDelete(null);
      await fetchRecords();
    } catch (err) {
      setPendingDelete(null);
      showPopup('error', err.response?.data?.error || `Failed to delete ${pageTitle}`);
    } finally {
      setDeleting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.trim().toLowerCase();
    return records.filter((rec) =>
      String(rec[nameField] || '').toLowerCase().includes(term)
    );
  }, [records, searchTerm, nameField]);

  const closeEditor = () => setEditingRecord(null);

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Master data"
        title={pageTitle}
        subtitle={subtitle}
        badge={!loading && <span className="ui-count-badge">{records.length}</span>}
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            <FiPlus size={16} /> {addButtonLabel}
          </button>
        )}
      />

      <div className="ui-toolbar">
        <div className="items-search">
          <FiSearch className="text-muted" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {showAddForm && (
        <AddSimpleNameForm
          title={formTitle}
          fieldLabel={formFieldLabel}
          placeholder={formPlaceholder}
          submitLabel={formSubmitLabel}
          note={formNote}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingRecord && (
        <AddSimpleNameForm
          title={`Edit ${pageTitle}`}
          fieldLabel={formFieldLabel}
          placeholder={formPlaceholder}
          submitLabel="Save Changes"
          note={formNote}
          onSubmit={(value) => handleEdit(value)}
          onCancel={closeEditor}
          initialValue={editingRecord[nameField]}
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
            title={records.length === 0 ? `No ${pageTitle.toLowerCase()} records yet` : 'No matches'}
            description={records.length === 0 ? emptyMessage : `No results found for "${searchTerm}".`}
            action={records.length === 0 && (
              <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                <FiPlus size={16} /> {addButtonLabel}
              </button>
            )}
          />
        ) : (
          <div className="ui-table-scroll">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>{nameColumnLabel}</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td><strong>{rec[nameField]}</strong></td>
                    <td>
                      <StatusBadge status={rec.status || 'Active'} tone={rec.status === 'Inactive' ? 'neutral' : 'success'} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionMenu
                        ariaLabel={`Actions for ${rec[nameField]}`}
                        items={[
                          { label: 'Edit', icon: <FiEdit size={14} />, onClick: () => setEditingRecord(rec) },
                          { label: 'Delete', icon: <FiTrash2 size={14} />, danger: true, onClick: () => setPendingDelete(rec) }
                        ]}
                      />
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
          title={`Delete ${pageTitle.toLowerCase()}?`}
          message={<>"<strong>{pendingDelete[nameField]}</strong>" will be removed. This cannot be undone.</>}
          confirmText="Delete"
          busy={deleting}
          onConfirm={() => handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};

export default RMManagementList;