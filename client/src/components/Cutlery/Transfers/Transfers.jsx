import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddTransferForm from './AddTransferForm';
import EditTransfer from './EditTransfer';
import './Transfers.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faPen, faTrash, faPlus, faSync } from '@fortawesome/free-solid-svg-icons';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const { showPopup } = usePopup();
  const navigate = useNavigate();
  const location = useLocation();
  const isMounted = useRef(true);
  const fetchCount = useRef(0);

  const fetchTransfers = useCallback(async () => {
    // Prevent excessive fetching
    fetchCount.current++;
    if (fetchCount.current > 5) {
      console.warn('Excessive fetching detected, stopping');
      return;
    }

    if (!isMounted.current) return;

    try {
      setLoading(true);
      console.log('Fetching transfers...');
      
      const res = await api.get('/cutlery-transfers');
      
      if (!isMounted.current) return;

      console.log('Transfers response:', res.data);
      
      if (res.data.success) {
        const transfersWithItems = res.data.data.map(t => ({ 
          ...t, 
          items: t.items || [] 
        }));
        setTransfers(transfersWithItems);
      } else {
        showPopup('error', res.data.error || 'Failed to load transfers');
        setTransfers([]);
      }
    } catch (err) {
      console.error('Error fetching transfers:', err);
      if (!isMounted.current) return;
      
      showPopup('error', err.response?.data?.error || 'Failed to load transfers');
      setTransfers([]);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [showPopup]);

  // Initial fetch only
  useEffect(() => {
    isMounted.current = true;
    fetchTransfers();
    
    return () => {
      isMounted.current = false;
    };
  }, [fetchTransfers]);

  // Check state to trigger editing on redirect
  useEffect(() => {
    if (location.state?.editTransferId && transfers.length > 0) {
      const trans = transfers.find(t => t.id === location.state.editTransferId);
      if (trans) {
        setEditingTransfer(trans);
        // Clear location state to avoid reopening on page refresh
        window.history.replaceState(null, '');
      }
    }
  }, [location, transfers]);

  const handleAddTransfer = async (data) => {
    try {
      const res = await api.post('/cutlery-transfers', data);
      
      if (res.data.success) {
        showPopup('success', res.data.message);
        setShowAddForm(false);
        fetchTransfers();
      } else {
        showPopup('error', res.data.error || 'Failed to create transfer');
      }
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create transfer');
    }
  };

  const handleUpdateTransfer = async (data) => {
    try {
      const res = await api.put(`/cutlery-transfers/${editingTransfer.id}`, data);
      
      if (res.data.success) {
        showPopup('success', res.data.message);
        setEditingTransfer(null);
        fetchTransfers();
      } else {
        showPopup('error', res.data.error || 'Failed to update transfer');
      }
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update transfer');
    }
  };

  const handleDeleteTransfer = async (id, transferId) => {
    if (!window.confirm(`Delete transfer ${transferId}?`)) return;
    
    try {
      const res = await api.delete(`/cutlery-transfers/${id}`);
      
      if (res.data.success) {
        showPopup('success', res.data.message);
        fetchTransfers();
      } else {
        showPopup('error', res.data.error || 'Failed to delete transfer');
      }
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to delete transfer');
    }
  };

  const statusClass = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'completed') return 'status-pill completed';
    if (statusLower === 'pending') return 'status-pill pending';
    if (statusLower === 'cancelled') return 'status-pill cancelled';
    return 'status-pill pending';
  };

  if (loading && transfers.length === 0) {
    return <div className="loading">Loading transfers…</div>;
  }

  return (
    <div className="transfers-page">
      <header className="page-header">
        <div className="header-title-container">
          <h1>Transfers</h1>
          <p>Cutlery movement between locations</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add Transfer
          </button>
          <button 
            className="btn-refresh"
            onClick={fetchTransfers}
            disabled={loading}
            title="Refresh"
          >
            <FontAwesomeIcon icon={faSync} spin={loading} /> Refresh
          </button>
        </div>
      </header>

      {showAddForm && (
        <AddTransferForm
          onSubmit={handleAddTransfer}
          onCancel={() => setShowAddForm(false)}
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
            <h3>No transfers found</h3>
            <p>Create your first cutlery transfer to get started</p>
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <FontAwesomeIcon icon={faPlus} /> Add Transfer
            </button>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="transfers-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>By</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(t => (
                    <tr key={t.id}>
                      <td data-label="ID" className="transfer-id">
                        <strong>{t.transfer_id}</strong>
                      </td>
                      <td data-label="Date">
                        {new Date(t.transfer_date).toLocaleDateString()}
                      </td>
                      <td data-label="From">
                        {t.from_location_name || `Location ${t.location_from_id}`}
                      </td>
                      <td data-label="To">
                        {t.to_location_name || `Location ${t.location_to_id}`}
                      </td>
                      <td data-label="By">{t.transferred_by}</td>
                      <td data-label="Items">
                        <span className="items-count">
                          {t.items?.length || 0} item(s)
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className={statusClass(t.status)}>
                          {t.status || 'Pending'}
                        </span>
                      </td>
                      <td className="right actions" data-label="Actions">
                        <button 
                          className="icon-btn view"
                          onClick={() => navigate(`/cutlery/transfer/view/${t.id}`)} 
                          title="View"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        <button 
                          className="icon-btn edit"
                          onClick={() => setEditingTransfer(t)} 
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                        <button
                          className="icon-btn delete"
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
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default Transfers;