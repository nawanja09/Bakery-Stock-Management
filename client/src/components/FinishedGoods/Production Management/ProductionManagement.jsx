// client/src/components/FinishedGoods/Production Management/ProductionManagement.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faEye } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddProductionPopup from './AddProductionPopup';
import ViewProductionPopup from './ViewProduction';
import EditProductionPopup from './EditProduction';
import './ProductionManagement.css';

const ProductionManagement = () => {
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showViewPopup, setShowViewPopup] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [selectedProduction, setSelectedProduction] = useState(null);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchDepartments();
    fetchProductions();
  }, [selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchProductions = async () => {
    try {
      const url = selectedDepartment 
        ? `/productions?department_id=${selectedDepartment}`
        : '/productions';
      
      const response = await api.get(url);
      setProductions(response.data);
    } catch (err) {
      showPopup('error', 'Failed to fetch productions');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentChange = (e) => {
    setSelectedDepartment(e.target.value);
  };

  const handleViewProduction = async (id) => {
    try {
      const response = await api.get(`/productions/${id}`);
      setSelectedProduction(response.data);
      setShowViewPopup(true);
    } catch (err) {
      showPopup('error', 'Failed to fetch production details');
    }
  };

  const handleEditProduction = async (id) => {
    try {
      const response = await api.get(`/productions/${id}`);
      setSelectedProduction(response.data);
      setShowEditPopup(true);
    } catch (err) {
      showPopup('error', 'Failed to fetch production details');
    }
  };

  const handleAddProduction = () => {
    setShowAddPopup(true);
  };

  const handleClosePopup = () => {
    setShowAddPopup(false);
    setShowViewPopup(false);
    setShowEditPopup(false);
    setSelectedProduction(null);
  };

  const handleProductionSaved = () => {
    fetchProductions();
    handleClosePopup();
    showPopup('success', 'Production saved successfully!');
  };

  const handleDeleteProduction = async (id) => {
    if (window.confirm('Are you sure you want to delete this production?')) {
      try {
        await api.delete(`/productions/${id}`);
        showPopup('success', 'Production deleted successfully!');
        fetchProductions();
      } catch (err) {
        showPopup('error', 'Failed to delete production');
      }
    }
  };

  return (
    <div className="production-management-container">
      <div className="production-header">
        <h2>Production Management</h2>
        <button className="btn-add-production" onClick={handleAddProduction}>
          <FontAwesomeIcon icon={faPlus} /> Add New Production
        </button>
      </div>

      {loading ? (
        <p>Loading productions...</p>
      ) : productions.length === 0 ? (
        <p>No productions found</p>
      ) : (
        <table className="production-table">
          <thead>
            <tr>
              <th>Production Date</th>
              <th>Prepared By</th>
              <th>Department</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {productions.map(production => (
              <tr key={production.id}>
                <td>{new Date(production.production_date).toLocaleDateString()}</td>
                <td>{production.prepared_by}</td>
                <td>{production.department_name || production.department || 'No department'}</td>
                <td className="remarks-cell">
                  {production.remarks || '-'}
                </td>
                <td className="actions">
                  <button 
                    className="btn-view" 
                    title="View Details"
                    onClick={() => handleViewProduction(production.id)}
                  >
                  <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="btn-edit" 
                    title="Edit"
                    onClick={() => handleEditProduction(production.id)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    className="btn-delete" 
                    title="Delete"
                    onClick={() => handleDeleteProduction(production.id)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddPopup && (
        <AddProductionPopup 
          onClose={handleClosePopup}
          onSave={handleProductionSaved}
        />
      )}

      {showViewPopup && selectedProduction && (
        <ViewProductionPopup 
          production={selectedProduction}
          onClose={handleClosePopup}
        />
      )}

      {showEditPopup && selectedProduction && (
        <EditProductionPopup 
          production={selectedProduction}
          onClose={handleClosePopup}
          onSave={handleProductionSaved}
        />
      )}
    </div>
  );
};

// Helper function for status badges
const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Completed':
      return 'status-completed';
    case 'Draft':
      return 'status-draft';
    case 'Cancelled':
      return 'status-cancelled';
    default:
      return 'status-draft';
  }
};

export default ProductionManagement;