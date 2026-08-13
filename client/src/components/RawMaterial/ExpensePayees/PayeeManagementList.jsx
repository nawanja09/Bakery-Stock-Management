import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddPayeeForm from './AddPayeeForm';
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
    const confirmed = window.confirm(`Are you sure you want to delete "${record.payee_name}"?`);
    if (!confirmed) return;

    try {
      const response = await api.delete(`${apiPath}/${record.id}`);
      showPopup('success', response.data?.message || 'Payee deleted successfully');
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to delete payee');
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
    <div className="rm-mgmt-container">
      <div className="rm-mgmt-header">
        <div className="rm-mgmt-header-top">
          <div>
            <h2>{pageTitle}</h2>
            <p className="rm-mgmt-subtitle">Manage the payees used on the New Expenses form</p>
          </div>
          <button className="btn-add-rm" onClick={() => setShowAddForm(true)}>
            <FiPlus size={16} /> Add Payee
          </button>
        </div>

        <div className="rm-mgmt-search">
          <FiSearch />
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

      <div className="rm-mgmt-table-container">
        {loading ? (
          <div className="rm-mgmt-loading">Loading {pageTitle}...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="rm-mgmt-no-data">
            <p>
              {records.length === 0
                ? 'No payees found. Add your first payee to get started.'
                : `No results found for "${searchTerm}".`}
            </p>
          </div>
        ) : (
          <table className="rm-mgmt-table">
            <thead>
              <tr>
                <th>PAYEE NAME</th>
                <th>VAT REG NO</th>
                <th>STATUS</th>
                <th className="rm-action-col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => (
                <tr key={rec.id}>
                  <td className="rm-name-cell">{rec.payee_name}</td>
                  <td>{rec.vat_reg_number || '-'}</td>
                  <td className="rm-status-cell">
                    <span className={`rm-status-badge ${rec.status === 'Inactive' ? 'inactive' : 'active'}`}>
                      {rec.status || 'Active'}
                    </span>
                  </td>
                  <td className="rm-status-cell">
                    <span
                      className={`rm-status-badge ${
                        Number(rec.status) === 1 ? 'active' : 'inactive'
                      }`}
                    >
                      {Number(rec.status) === 1 ? 'Active' : 'Inactive'}
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

export default PayeeManagementList;
