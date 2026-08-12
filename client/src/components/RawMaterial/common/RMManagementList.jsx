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
    <div className="rm-mgmt-container">
      <div className="rm-mgmt-header">
        <div className="rm-mgmt-header-top">
          <div>
            <h2>{pageTitle}</h2>
            {subtitle && <p className="rm-mgmt-subtitle">{subtitle}</p>}
          </div>
          <button className="btn-add-rm" onClick={() => setShowAddForm(true)}>
            <FiPlus size={16} /> {addButtonLabel}
          </button>
        </div>

        <div className="rm-mgmt-search">
          <FiSearch />
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

      <div className="rm-mgmt-table-container">
        {loading ? (
          <div className="rm-mgmt-loading">Loading {pageTitle}...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="rm-mgmt-no-data">
            <p>
              {records.length === 0
                ? emptyMessage
                : `No results found for "${searchTerm}".`}
            </p>
          </div>
        ) : (
          <table className="rm-mgmt-table">
            <thead>
              <tr>
                <th>{nameColumnLabel}</th>
                <th>STATUS</th>
                <th className="rm-action-col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => (
                <tr key={rec.id}>
                  <td className="rm-name-cell">{rec[nameField]}</td>
                  <td className="rm-status-cell">
                    <span className={`rm-status-badge ${rec.status === 'Inactive' ? 'inactive' : 'active'}`}>
                      <span className="rm-status-dot"></span>
                      {rec.status || 'Active'}
                    </span>
                  </td>
                  <td className="rm-action-cell">
                    <button
                      type="button"
                      className="rm-btn-edit"
                      onClick={() => setEditingRecord(rec)}
                    >
                      <FiEdit size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="rm-btn-delete"
                      onClick={() => handleDelete(rec)}
                    >
                      <FiTrash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && records.length > 0 && (
        <p className="rm-count-badge">
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default RMManagementList;