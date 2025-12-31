import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddTransferForm from './AddTransferForm';
import ViewTransfer from './ViewTransfer';
import EditTransfer from './EditTransfer';
import './Transfers.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faPen, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState(null);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const { showPopup } = usePopup();

  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/cutlery-transfers');
      setTransfers(
        res.data.map(t => ({ ...t, items: t.items || [] }))
      );
    } catch (err) {
      showPopup('error', 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const handleAddTransfer = async (data) => {
    try {
      const res = await api.post('/cutlery-transfers', data);
      showPopup('success', res.data.message);
      setShowAddForm(false);
      fetchTransfers();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create transfer');
    }
  };

  const handleUpdateTransfer = async (data) => {
    try {
      const res = await api.put(`/cutlery-transfers/${editingTransfer.id}`, data);
      showPopup('success', res.data.message);
      setEditingTransfer(null);
      fetchTransfers();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update transfer');
    }
  };

  const handleDeleteTransfer = async (id, transferId) => {
    if (!window.confirm(`Delete transfer ${transferId}?`)) return;
    try {
      await api.delete(`/cutlery-transfers/${id}`);
      showPopup('success', 'Transfer deleted');
      fetchTransfers();
    } catch {
      showPopup('error', 'Failed to delete transfer');
    }
  };

  const statusClass = (status) =>
    `status-pill ${status?.toLowerCase()}`;

  if (loading) {
    return <div className="loading">Loading transfers…</div>;
  }

  return (
    <div className="transfers-page">
      <header className="page-header">
        <div>
          <h1>Transfers</h1>
          <p>Cutlery movement between locations</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm(true)}>
          <FontAwesomeIcon icon={faPlus} /> New Transfer
        </button>
      </header>

      {showAddForm && (
        <AddTransferForm
          onSubmit={handleAddTransfer}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {viewingTransfer && (
        <ViewTransfer
          transfer={viewingTransfer}
          onClose={() => setViewingTransfer(null)}
          onEdit={() => {
            setEditingTransfer(viewingTransfer);
            setViewingTransfer(null);
          }}
        />
      )}

      {editingTransfer && (
        <EditTransfer
          transfer={editingTransfer}
          onSubmit={handleUpdateTransfer}
          onCancel={() => setEditingTransfer(null)}
        />
      )}

      <section className="table-card">
        {transfers.length === 0 ? (
          <div className="empty-state">
            <span>📦</span>
            <h3>No transfers yet</h3>
            <p>Create your first cutlery transfer</p>
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <FontAwesomeIcon icon={faPlus} /> Add Transfer
            </button>
          </div>
        ) : (
          <table className="transfers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>By</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id}>
                  <td data-label="ID">{t.transfer_id}</td>
                  <td data-label="Date">
                    {new Date(t.transfer_date).toLocaleDateString()}
                  </td>
                  <td data-label="From">{t.from_location_name}</td>
                  <td data-label="To">{t.to_location_name}</td>
                  <td data-label="By">{t.transferred_by}</td>
                  <td data-label="Status">
                    <span className={statusClass(t.status)}>{t.status}</span>
                  </td>
                  <td className="right actions" data-label="Actions">
                    <button onClick={() => setViewingTransfer(t)} title="View">
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button onClick={() => setEditingTransfer(t)} title="Edit">
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      className="danger"
                      onClick={() => handleDeleteTransfer(t.id, t.transfer_id)}
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default Transfers;
