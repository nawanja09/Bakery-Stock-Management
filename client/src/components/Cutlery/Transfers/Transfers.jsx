import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchTransfers();
  }, []);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/cutlery-transfers');
      
      // Ensure each transfer has items array
      const transfersWithItems = res.data.map(transfer => ({
        ...transfer,
        items: transfer.items || []
      }));
      
      setTransfers(transfersWithItems);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      showPopup('error', 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

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

  const getStatusBadge = (status) => {
    const map = {
      Pending: 'pending',
      Completed: 'completed',
      Cancelled: 'cancelled',
    };
    return <span className={`status-badge ${map[status]}`}>{status}</span>;
  };

  // Helper to calculate total quantity for a transfer
  const getTotalQuantity = (transfer) => {
    if (transfer.items && transfer.items.length > 0) {
      return transfer.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    }
    return transfer.quantity || 0;
  };

  // Helper to get asset list for display
  const getAssetDisplay = (transfer) => {
    if (transfer.items && transfer.items.length > 0) {
      if (transfer.items.length === 1) {
        const item = transfer.items[0];
        return (
          <div>
            <strong>{item.asset_name}</strong>
            <div className="muted">{item.asset_code}</div>
          </div>
        );
      }
      return (
        <div className="asset-list">
          {transfer.items.map((item, idx) => (
            <div key={idx} className="asset-badge">
              <strong>{item.asset_name}</strong> × {item.quantity}
            </div>
          ))}
        </div>
      );
    }
    // Fallback for old data structure
    return (
      <div>
        <strong>{transfer.asset_name}</strong>
        <div className="muted">{transfer.asset_code}</div>
      </div>
    );
  };

  if (loading) return <div className="loading">Loading transfers...</div>;

  return (
    <div className="transfers-page">
      <header className="page-header">
        <div>
          <h1>Transfers</h1>
          <p>Manage cutlery transfer records</p>
        </div>
        <button className="primary-btn" onClick={() => setShowAddForm(true)}>
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

      <section className="content-card">
        {transfers.length === 0 ? (
          <div className="no-data">
            <span>🔄</span>
            <p>No transfers found</p>
            <button 
              className="btn-add-first" 
              onClick={() => setShowAddForm(true)}
            >
              <FontAwesomeIcon icon={faPlus} /> Create Your First Transfer
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
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td data-label="ID">{t.transfer_id}</td>
                  <td data-label="Date">
                    {new Date(t.transfer_date).toLocaleDateString()}
                  </td>
                  <td data-label="From">{t.from_location_name}</td>
                  <td data-label="To">{t.to_location_name}</td>
                  <td data-label="By">{t.transferred_by}</td>
                  <td data-label="Status">{getStatusBadge(t.status)}</td>
                  <td className="actions-cell" data-label="Actions">
                    <div className="actions">
                      <button 
                        className="icon-btn" 
                        onClick={() => setViewingTransfer(t)}
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button 
                        className="icon-btn" 
                        onClick={() => setEditingTransfer(t)}
                        title="Edit Transfer"
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => handleDeleteTransfer(t.id, t.transfer_id)}
                        title="Delete Transfer"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
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