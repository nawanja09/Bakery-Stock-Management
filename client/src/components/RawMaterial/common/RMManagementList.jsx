import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddSimpleNameForm from './AddSimpleNameForm';
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
    const confirmed = window.confirm(`Are you sure you want to delete this ${pageTitle.toLowerCase()}?`);
    if (!confirmed) return;

    try {
      const response = await api.delete(`${apiPath}/${record.id}`);
      showPopup('success', response.data?.message || `${pageTitle} deleted successfully`);
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to delete ${pageTitle}`);
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
    <div className="erp-page">
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>{pageTitle}</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          <FiPlus size={16} /> {addButtonLabel}
        </button>
      </div>

      <div className="filters-section">
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

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            Loading {pageTitle}...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <p>
              {records.length === 0
                ? emptyMessage
                : `No results found for "${searchTerm}".`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                      <span className={`badge ${rec.status === 'Inactive' ? 'badge-neutral' : 'badge-success'}`}>
                        {rec.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-icon edit"
                          onClick={() => setEditingRecord(rec)}
                          title="Edit"
                        >
                          <FiEdit size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon delete"
                          onClick={() => handleDelete(rec)}
                          title="Delete"
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
      </div>

      {!loading && records.length > 0 && (
        <p className="text-muted text-right font-sm" style={{ paddingRight: '8px' }}>
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default RMManagementList;