import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash, faSearch, faXmark } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsWastage.css';

const FinishedGoodsWastageHistory = () => {
  const [wastages, setWastages] = useState([]);
  const [filteredWastages, setFilteredWastages] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({
    department_id: '',
    wastage_type: '',
    date_from: '',
    date_to: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchWastages();
    fetchDepartments();
  }, []);

  useEffect(() => {
    filterWastages();
  }, [wastages, filters]);

  const fetchWastages = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.department_id) queryParams.append('department_id', filters.department_id);
      if (filters.wastage_type) queryParams.append('type', filters.wastage_type);
      if (filters.date_from) queryParams.append('date_from', filters.date_from);
      if (filters.date_to) queryParams.append('date_to', filters.date_to);
      
      const response = await api.get(`/finished-goods-wastages?${queryParams}`);
      setWastages(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch wastage records');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const filterWastages = () => {
    let filtered = wastages;

    if (filters.department_id) {
      filtered = filtered.filter(w => w.department_id == filters.department_id);
    }
    if (filters.wastage_type) {
      filtered = filtered.filter(w => w.wastage_type === filters.wastage_type);
    }
    if (filters.date_from) {
      filtered = filtered.filter(w => new Date(w.date) >= new Date(filters.date_from));
    }
    if (filters.date_to) {
      filtered = filtered.filter(w => new Date(w.date) <= new Date(filters.date_to));
    }

    setFilteredWastages(filtered);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      department_id: '',
      wastage_type: '',
      date_from: '',
      date_to: ''
    });
  };

  const handleViewWastage = async (id) => {
    try {
      const response = await api.get(`/finished-goods-wastages/${id}`);
      setSelectedWastage(response.data);
      setShowModal(true);
    } catch (error) {
      showPopup('error', 'Failed to fetch wastage details');
    }
  };

  const handleDeleteWastage = async (id) => {
    if (window.confirm('Are you sure you want to delete this wastage record?')) {
      try {
        await api.delete(`/finished-goods-wastages/${id}`);
        showPopup('success', 'Wastage record deleted successfully');
        fetchWastages();
      } catch (error) {
        showPopup('error', 'Failed to delete wastage record');
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedWastage(null);
  };

  if (loading) return (
    <div className="minimal-container">
      <div className="loading-state">Loading wastage records...</div>
    </div>
  );

  return (
    <div className="minimal-container">
      <div className="minimal-header">
        <h1 className="minimal-title">Finished Goods Wastage History</h1>
        <button 
          className={`filter-toggle ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FontAwesomeIcon icon={faSearch} />
          Filters
        </button>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="minimal-card filter-card">
          <div className="card-header">
            <h3 className="card-title">Filter Records</h3>
            <button className="close-filters" onClick={() => setShowFilters(false)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <div className="filter-grid">
            <div className="input-group">
              <label>Department</label>
              <select 
                value={filters.department_id} 
                onChange={(e) => handleFilterChange('department_id', e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>Wastage Type</label>
              <select 
                value={filters.wastage_type} 
                onChange={(e) => handleFilterChange('wastage_type', e.target.value)}
              >
                <option value="">All Types</option>
                <option value="General">General</option>
                <option value="Production">Production</option>
              </select>
            </div>

            <div className="input-group">
              <label>Date From</label>
              <input 
                type="date" 
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>Date To</label>
              <input 
                type="date" 
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
              />
            </div>
          </div>
          <div className="filter-actions">
            <button onClick={clearFilters} className="secondary-btn">
              Clear Filters
            </button>
            <button onClick={fetchWastages} className="primary-btn">
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Results Info */}
      <div className="results-info">
        <span>Showing {filteredWastages.length} of {wastages.length} records</span>
      </div>

      {/* Wastage List */}
      <div className="minimal-card">
        {filteredWastages.length === 0 ? (
          <div className="empty-state">
            <p>No wastage records found</p>
          </div>
        ) : (
          <div className="records-list">
            {filteredWastages.map(wastage => (
              <div key={wastage.id} className="record-item">
                <div className="record-main">
                  <div className="record-header">
                    <span className="record-number">#{wastage.wastage_number}</span>
                    <span className={`record-type ${wastage.wastage_type.toLowerCase()}`}>
                      {wastage.wastage_type}
                    </span>
                  </div>
                  <div className="record-details">
                    <span>{new Date(wastage.date).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{wastage.department_name || 'No Department'}</span>
                    <span>•</span>
                    <span>{wastage.approved_by}</span>
                  </div>
                  <div className="record-reason">{wastage.reason}</div>
                </div>
                
                <div className="record-stats">
                  <div className="stat">
                    <span className="stat-label">Items</span>
                    <span className="stat-value">{wastage.item_count}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Total Loss</span>
                    <span className="stat-value loss">LKR {parseFloat(wastage.total_loss || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="record-actions">
                  <button 
                    className="action-btn view-btn"
                    onClick={() => handleViewWastage(wastage.id)}
                    title="View Details"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="action-btn delete-btn"
                    onClick={() => handleDeleteWastage(wastage.id)}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedWastage && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Wastage Details: #{selectedWastage.wastage_number}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Date</label>
                  <span>{new Date(selectedWastage.date).toLocaleDateString()}</span>
                </div>
                <div className="detail-item">
                  <label>Department</label>
                  <span>{selectedWastage.department_name || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Type</label>
                  <span className={`type-tag ${selectedWastage.wastage_type.toLowerCase()}`}>
                    {selectedWastage.wastage_type}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Approved By</label>
                  <span>{selectedWastage.approved_by}</span>
                </div>
                <div className="detail-item">
                  <label>Reason</label>
                  <span>{selectedWastage.reason}</span>
                </div>
                <div className="detail-item full-width">
                  <label>Remarks</label>
                  <span>{selectedWastage.remarks || 'No remarks'}</span>
                </div>
              </div>

              <h3 className="modal-subtitle">Wasted Items</h3>
              <div className="items-list">
                {selectedWastage.items && selectedWastage.items.map((item, index) => (
                  <div key={index} className="item-detail">
                    <div className="item-info">
                      <strong>{item.item_name}</strong>
                      <span>{item.item_code} • {item.category}</span>
                    </div>
                    <div className="item-numbers">
                      <span>Qty: {item.quantity}</span>
                      <span>Price: LKR {parseFloat(item.unit_price).toFixed(2)}</span>
                      <span className="item-loss">Loss: LKR {parseFloat(item.estimated_loss).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-total">
                <strong>Total Estimated Loss:</strong>
                <strong className="total-loss">
                  LKR {selectedWastage.items ? 
                    selectedWastage.items.reduce((total, item) => total + parseFloat(item.estimated_loss), 0).toFixed(2) 
                    : '0.00'
                  }
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinishedGoodsWastageHistory;