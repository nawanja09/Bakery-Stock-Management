import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter, faCalendarAlt, faFileAlt, faBox, faChevronLeft, faChevronRight, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';

const StoresAdjustments = () => {
  const [adjustments, setAdjustments] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    item_id: 'all',
    reference_note: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected row details
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);

  useEffect(() => {
    fetchItems();
    fetchAdjustments();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchAdjustments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.item_id !== 'all') params.append('item_id', filters.item_id);
      if (filters.reference_note) params.append('reference_note', filters.reference_note);

      const response = await api.get(`/adjustments?${params.toString()}`);
      setAdjustments(response.data);
      setCurrentPage(1); // Reset to first page when filtering
    } catch (error) {
      console.error('Error fetching adjustments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAdjustments();
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      item_id: 'all',
      reference_note: ''
    });
    // The effect or manual trigger might be needed, but since state is updated, let's call fetch manually after timeout or state update.
    setTimeout(fetchAdjustments, 0);
  };

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAdjustments = adjustments.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(adjustments.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="adjustments-container">
      <div className="adjustments-header">
        <h1>Stores Adjustments History</h1>
        <p>View all stock balance adjustment records</p>
      </div>

      <div className="filter-card">
        <form onSubmit={handleSearch} className="filter-form">
          <div className="filter-group">
            <label><FontAwesomeIcon icon={faCalendarAlt} /> Start Date</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="filter-group">
            <label><FontAwesomeIcon icon={faCalendarAlt} /> End Date</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="filter-group">
            <label><FontAwesomeIcon icon={faBox} /> Item</label>
            <select name="item_id" value={filters.item_id} onChange={handleFilterChange}>
              <option value="all">All Items</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.item_code} - {item.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-actions">
            <button type="submit" className="btn-search"><FontAwesomeIcon icon={faSearch} /> Search</button>
          </div>
        </form>
      </div>

      <div className="data-card">
        {loading ? (
          <div className="loading-state">Loading adjustments...</div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="adjustments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Current Qty (Sys)</th>
                    <th>New Qty (Act)</th>
                    <th>Variance</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAdjustments.length > 0 ? (
                    currentAdjustments.map((adj) => {
                      const varianceNum = parseFloat(adj.variance);
                      const isLoss = varianceNum < 0;
                      return (
                        <tr key={adj.id} className={selectedAdjustment?.id === adj.id ? 'selected-row' : ''}>
                          <td>{new Date(adj.date).toLocaleString()}</td>
                          <td>{adj.item_name}</td>
                          <td>{parseFloat(adj.system_qty).toFixed(3)} {adj.unit}</td>
                          <td>{parseFloat(adj.actual_qty).toFixed(3)} {adj.unit}</td>
                          <td className={isLoss ? 'text-danger fw-bold' : 'text-success fw-bold'}>
                            {varianceNum > 0 ? '+' : ''}{varianceNum.toFixed(3)} {adj.unit}
                          </td>
                          <td className={isLoss ? 'text-danger fw-bold' : ''}>
                            Rs. {parseFloat(adj.amount).toFixed(2)}
                          </td>
                          <td className="truncate-text" title={adj.reason}>{adj.reason}</td>
                          <td>
                            <button 
                              className="btn-view"
                              onClick={() => setSelectedAdjustment(selectedAdjustment?.id === adj.id ? null : adj)}
                            >
                              <FontAwesomeIcon icon={faInfoCircle} /> Details
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-state">No adjustment records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  onClick={() => paginate(currentPage - 1)} 
                  disabled={currentPage === 1}
                  className="page-btn"
                >
                  <FontAwesomeIcon icon={faChevronLeft} /> Prev
                </button>
                <span className="page-info">Page {currentPage} of {totalPages}</span>
                <button 
                  onClick={() => paginate(currentPage + 1)} 
                  disabled={currentPage === totalPages}
                  className="page-btn"
                >
                  Next <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selected Adjustment Details Panel */}
      {selectedAdjustment && (
        <div className="details-panel slide-up">
          <h3>Adjustment Details <span className="close-btn" onClick={() => setSelectedAdjustment(null)}>×</span></h3>
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Adjusted By:</span>
              <span className="detail-value">{selectedAdjustment.user_name}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Date & Time:</span>
              <span className="detail-value">{new Date(selectedAdjustment.date).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Reference Note:</span>
              <span className="detail-value">{selectedAdjustment.reference_note || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Unit Price:</span>
              <span className="detail-value">Rs. {parseFloat(selectedAdjustment.unit_price).toFixed(2)}</span>
            </div>
            <div className="detail-item full-width">
              <span className="detail-label">Reason:</span>
              <span className="detail-value reason-text">{selectedAdjustment.reason}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoresAdjustments;
