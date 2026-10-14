import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddLocationForm from './AddLocationForm';
import { FiTrash2 } from 'react-icons/fi';
import './Locations.css';

import { useConfirm } from '../../common/ui';
const Locations = () => {
  const confirm = useConfirm();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-locations');
      setLocations(response.data);
    } catch (err) {
      console.error('Error fetching locations:', err);
      showPopup('error', 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async (locationData) => {
    try {
      const response = await api.post('/cutlery-locations', locationData);
      showPopup('success', response.data.message);
      setShowAddForm(false);
      fetchLocations();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to add location');
    }
  };

  const handleDeleteLocation = async (id, locationName) => {
    if (await confirm(`Are you sure you want to delete "${locationName}"?`)) {
      try {
        await api.delete(`/cutlery-locations/${id}`);
        showPopup('success', 'Location deleted successfully');
        fetchLocations();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete location');
      }
    }
  };

  if (loading) return <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading locations...</div>;

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Cutlery Locations</h2>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddForm(true)}
        >
          + Add Location
        </button>
      </header>

      {showAddForm && (
        <AddLocationForm
          onSubmit={handleAddLocation}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        {locations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
            <p>No locations found. Add your first location to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td>{loc.location_id}</td>
                    <td><strong>{loc.location_name}</strong></td>
                    <td>{new Date(loc.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-icon delete"
                        onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                        title="Delete Location"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Locations;
