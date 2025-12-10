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
      console.error('Error fetching damages:', err);
      showPopup('error', 'Failed to load damage records');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchDamages();
  }, [fetchDamages]);

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
    // Fetch full damage details (including items) before showing view
    (async () => {
      try {
        const response = await api.get(`/cutlery-damages/${damage.id}`);
        setViewingDamage(response.data);
      } catch (err) {
        console.error('Error fetching damage details:', err);
        showPopup('error', 'Failed to load damage details');
      }
    })();
  };

  const handleEditDamage = (damage) => {
    // Fetch full damage details (including items) before opening edit form
    (async () => {
      try {
        const response = await api.get(`/cutlery-damages/${damage.id}`);
        setEditingDamage(response.data);
      } catch (err) {
        console.error('Error fetching damage details for edit:', err);
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
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update damage record');
    }
  };

  const handleDeleteDamage = async (id, damageId) => {
    if (window.confirm(`Are you sure you want to delete damage record ${damageId}?`)) {
      try {
        await api.delete(`/cutlery-damages/${id}`);
        showPopup('success', 'Damage record deleted successfully');
        fetchDamages();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete damage record');
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return <div className="loading">Loading damage records...</div>;
  }

  return (
    <div className="damages-container">
      <div className="damages-header">
        <h2>Cutlery Damages</h2>
        <button 
          className="btn-add-damage"
          onClick={() => setShowAddForm(true)}
        >
          + Add New Damage
        </button>
      </div>

      {showAddForm && (
        <AddDamageForm
          onSubmit={handleAddDamage}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {viewingDamage && (
        <ViewDamage
          damage={viewingDamage}
          onClose={() => setViewingDamage(null)}
          onEdit={() => {
            setEditingDamage(viewingDamage);
            setViewingDamage(null);
          }}
        />
      )}

      {editingDamage && (
        <EditDamage
          damage={editingDamage}
          onSubmit={handleUpdateDamage}
          onCancel={() => setEditingDamage(null)}
        />
      )}

      <div className="damages-table-container">
        {damages.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">💔</div>
            <p>No damage records found. Create your first damage record to get started.</p>
          </div>
        ) : (
          <table className="damages-table">
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
                  <td className="damage-id">{damage.damage_id}</td>
                  <td className="damage-date">
                    {new Date(damage.damage_date).toLocaleDateString()}
                  </td>
                  <td className="location">{damage.location_name}</td>
                  <td className="reason">
                    {getReasonBadge(damage.reason)}
                  </td>
                  <td className="reported-by">{damage.reported_by}</td>
                  <td className="total-loss">
                    {formatCurrency(damage.total_loss || damage.estimated_loss)}
                  </td>
                  <td className="status">
                    {getStatusBadge(damage.status)}
                  </td>
                  <td className="actions">
                    <button
                      className="btn-view"
                      onClick={() => handleViewDamage(damage)}
                      title="View Damage"
                    >
                      View
                    </button>
                    <button
                      className="btn-edit"
                      onClick={() => handleEditDamage(damage)}
                      title="Edit Damage"
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteDamage(damage.id, damage.damage_id)}
                      title="Delete Damage"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Damages;