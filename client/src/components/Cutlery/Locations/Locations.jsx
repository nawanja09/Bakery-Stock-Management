import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddLocationForm from './AddLocationForm';
import { FiTrash2 } from 'react-icons/fi';
import './Locations.css';

const Locations = () => {
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
    if (window.confirm(`Are you sure you want to delete "${locationName}"?`)) {
      try {
        await api.delete(`/cutlery-locations/${id}`);
        showPopup('success', 'Location deleted successfully');
        fetchLocations();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete location');
      }
    }
  };

  if (loading) return <div className="loading">Loading locations...</div>;

  return (
    <div className="locations-container">
      <div className="locations-header">
        <h2>Cutlery Locations</h2>
        <button 
          className="btn-add-location"
          onClick={() => setShowAddForm(true)}
        >
          + Add Location
        </button>
      </div>

      {showAddForm && (
        <AddLocationForm
          onSubmit={handleAddLocation}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="locations-table-container">
        {locations.length === 0 ? (
          <div className="no-data">
            <p>No locations found. Add your first location to get started.</p>
          </div>
        ) : (
          <table className="locations-table">
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
                  <td className="location-id">{loc.location_id}</td>
                  <td className="location-name">{loc.location_name}</td>
                  <td className="created-date">
                    {new Date(loc.created_at).toLocaleDateString()}
                  </td>
                  <td className="actions">
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                      title="Delete Location"
                    >
                      <FiTrash2 />
                    </button>
                    {/* Add more action buttons here if needed */}
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

export default Locations;
