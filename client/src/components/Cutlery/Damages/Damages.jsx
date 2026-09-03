import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddDamageForm from './AddDamageForm';
import ViewDamage from './ViewDamage';
import EditDamage from './EditDamage';
import './Damages.css';

const Damages = () => {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingDamage, setViewingDamage] = useState(null);
  const [editingDamage, setEditingDamage] = useState(null);
  const { showPopup } = usePopup();

  const fetchDamages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-damages');
      setDamages(response.data);
    } catch (err) {
      showPopup('error', 'Failed to load damage records');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => { fetchDamages(); }, [fetchDamages]);

  const handleAddDamage = async (damageData) => {
    try {
      const response = await api.post('/cutlery-damages', damageData);
      showPopup('success', response.data.message);
      setShowAddForm(false);
      fetchDamages();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create damage record');
    }
  };

  const handleViewDamage = (damage) => {
    (async () => {
      try {
        const response = await api.get(`/cutlery-damages/${damage.id}`);
        setViewingDamage(response.data);
      } catch {
        showPopup('error', 'Failed to load damage details');
      }
    })();
  };

  const handleEditDamage = (damage) => {
    (async () => {
      try {
        const response = await api.get(`/cutlery-damages/${damage.id}`);
        setEditingDamage(response.data);
      } catch {
        showPopup('error', 'Failed to load damage details for edit');
      }
    })();
  };

  const handleUpdateDamage = async (damageData) => {
    try {
      const response = await api.put(`/cutlery-damages/${editingDamage.id}`, damageData);
      showPopup('success', response.data.message);
      setEditingDamage(null);
      fetchDamages();
    } catch {
      showPopup('error', 'Failed to update damage record');
    }
  };

  const handleDeleteDamage = async (id, damageId) => {
    if (window.confirm(`Are you sure you want to delete damage record ${damageId}?`)) {
      try {
        await api.delete(`/cutlery-damages/${id}`);
        showPopup('success', 'Damage record deleted successfully');
        fetchDamages();
      } catch {
        showPopup('error', 'Failed to delete damage record');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'Reported': { class: 'status-reported', label: 'Reported' },
      'Confirmed': { class: 'status-confirmed', label: 'Confirmed' },
      'Repaired': { class: 'status-repaired', label: 'Repaired' },
      'Written Off': { class: 'status-written-off', label: 'Written Off' }
    };
    const config = statusConfig[status] || { class: 'status-reported', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getReasonBadge = (reason) => {
    const reasonConfig = {
      'Broken': { class: 'reason-broken', label: 'Broken' },
      'Lost': { class: 'reason-lost', label: 'Lost' },
      'Worn Out': { class: 'reason-worn-out', label: 'Worn Out' },
      'Theft': { class: 'reason-theft', label: 'Theft' },
      'Other': { class: 'reason-other', label: 'Other' }
    };
    const config = reasonConfig[reason] || { class: 'reason-other', label: reason };
    return <span className={`reason-badge ${config.class}`}>{config.label}</span>;
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(amount);

  if (loading) return <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading damage records...</div>;

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Cutlery Damages</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Track and manage cutlery damage records</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ Add Damage</button>
      </header>

      {showAddForm && <AddDamageForm onSubmit={handleAddDamage} onCancel={() => setShowAddForm(false)} />}
      {viewingDamage && <ViewDamage damage={viewingDamage} onClose={() => setViewingDamage(null)} onEdit={() => { setEditingDamage(viewingDamage); setViewingDamage(null); }} />}
      {editingDamage && <EditDamage damage={editingDamage} onSubmit={handleUpdateDamage} onCancel={() => setEditingDamage(null)} />}

      {damages.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)', opacity: 0.5 }}>💔</div>
          <p>No damage records found. Create your first damage record to get started.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Damage ID</th>
                <th>Date</th>
                <th>Location</th>
                <th>Reason</th>
                <th>Reported By</th>
                <th>Total Loss</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {damages.map(damage => (
                <tr key={damage.id}>
                  <td>{damage.damage_id}</td>
                  <td>{new Date(damage.damage_date).toLocaleDateString()}</td>
                  <td>{damage.location_name}</td>
                  <td>{getReasonBadge(damage.reason)}</td>
                  <td>{damage.reported_by}</td>
                  <td><strong>{formatCurrency(damage.total_loss || damage.estimated_loss)}</strong></td>
                  <td>{getStatusBadge(damage.status)}</td>
                  <td>
                    <button className="icon-btn" onClick={() => handleViewDamage(damage)} title="View">👁️</button>
                    <button className="icon-btn" onClick={() => handleEditDamage(damage)} title="Edit">✏️</button>
                    <button className="icon-btn danger" onClick={() => handleDeleteDamage(damage.id, damage.damage_id)} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Damages;
