import React, { useState, useEffect, useCallback } from 'react';
import './WastageReport.css';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFileAlt,
  faCalendarAlt,
  faBoxOpen,
  faTimes,
  faEye,
  faClock,
  faExclamationTriangle,
  faMoneyBillWave
} from '@fortawesome/free-solid-svg-icons';
import { formatCurrency } from '../../../utils/formatters';
import Select from 'react-select';
import { filterItemByName, reportItemSelectStyles } from '../reportItemSelectHelper';

const ALL_ITEMS_OPTION = { value: 'all', label: 'All Items', name: 'All Items', item_code: '', data: null };

const WastageReport = () => {
  const { showPopup } = usePopup();
  
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([ALL_ITEMS_OPTION]);
  const [wastageData, setWastageData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    itemId: 'all'
  });

  const fetchItems = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setItems([
        ALL_ITEMS_OPTION,
        ...response.data.map(item => ({
          value: item.id,
          label: `${item.item_code} - ${item.name}`,
          name: item.name,
          item_code: item.item_code,
          data: item
        }))
      ]);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  }, []);

  const fetchWastageData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.get('/wastages', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Fetch detailed items for each wastage
      const detailedWastages = await Promise.all(
        response.data.map(async (wastage) => {
          const detailRes = await api.get(`/wastages/${wastage.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          return detailRes.data;
        })
      );
      
      setWastageData(detailedWastages);
      setFilteredData(detailedWastages);
    } catch (error) {
      console.error('Error fetching wastage data:', error);
      showPopup('error', 'Failed to load wastage data');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  const applyFilters = useCallback(() => {
    let filtered = [...wastageData];
    
    // Date range filter
    if (filters.startDate) {
      filtered = filtered.filter(w => w.date >= filters.startDate);
    }
    if (filters.endDate) {
      filtered = filtered.filter(w => w.date <= filters.endDate);
    }
    
    // Item filter - filter by items within each wastage
    if (filters.itemId && filters.itemId !== 'all') {
      filtered = filtered.filter(w => 
        w.items && w.items.some(item => String(item.item_id) === String(filters.itemId))
      );
    }
    
    setFilteredData(filtered);
  }, [filters, wastageData]);

  useEffect(() => {
    fetchItems();
    fetchWastageData();
  }, [fetchItems, fetchWastageData]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      itemId: 'all'
    });
  };

  const handleViewDetails = async (wastageId) => {
    setModalOpen(true);
    setModalLoading(true);
    setSelectedWastage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/wastages/${wastageId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSelectedWastage(response.data);
    } catch (err) {
      console.error('Error fetching wastage details:', err);
      showPopup('error', 'Failed to load wastage details');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedWastage(null);
  };

  const getStatusInfo = (reason) => {
    const statusMap = {
      'Expired': { icon: faClock, color: '#dc3545', bg: '#f8d7da' },
      'Damaged': { icon: faExclamationTriangle, color: '#fd7e14', bg: '#fff3cd' },
      'Overproduction': { icon: faMoneyBillWave, color: '#28a745', bg: '#d4edda' },
      'Poor Storage': { icon: faExclamationTriangle, color: '#856404', bg: '#fff3cd' },
      'Forecasting errors': { icon: faClock, color: '#6c757d', bg: '#e9ecef' },
      'Human error': { icon: faExclamationTriangle, color: '#6c757d', bg: '#e9ecef' },
      'Other': { icon: faTimes, color: '#6c757d', bg: '#e9ecef' }
    };
    return statusMap[reason] || statusMap['Other'];
  };

  // Group items by wastage for display
  const getWastageItems = (wastage) => {
    if (!wastage.items || wastage.items.length === 0) return [];
    return wastage.items;
  };

  // Calculate total loss for a wastage
  const getTotalLoss = (wastage) => {
    if (!wastage.items) return 0;
    return wastage.items.reduce((sum, item) => sum + (Number(item.estimated_loss) || 0), 0);
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state" role="status" aria-live="polite">
          <div className="loading-spinner"></div>
          <p>Loading wastage report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
        <h2 style={{ textAlign: 'left', margin: 0 }}>RM Wastage Item Detail</h2>
      </header>

      <div className="filters-section">
            {/* Date Range */}
            <div className="report-filter-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <label className="report-filter-label" style={{ marginRight: '10px' }}>
                <FontAwesomeIcon icon={faCalendarAlt} className="filter-icon" /> Date Range
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="report-filter-input"
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="report-filter-input"
                />
              </div>
            </div>

            {/* Item */}
            <div className="report-filter-group">
              <label className="report-filter-label">
                <FontAwesomeIcon icon={faBoxOpen} className="filter-icon" /> Item
              </label>

              <Select
                value={items.find(it => String(it.value) === String(filters.itemId)) || ALL_ITEMS_OPTION}
                onChange={(selected) => handleFilterChange('itemId', selected ? selected.value : 'all')}
                options={items}
                filterOption={filterItemByName}
                styles={reportItemSelectStyles}
                className="react-select-container"
                classNamePrefix="react-select"
                isSearchable
                isClearable={false}
                placeholder="Select item..."
              />
            </div>

            <div className="report-filter-actions">
              <button onClick={clearFilters} className="btn btn-secondary">
                <FontAwesomeIcon icon={faTimes} /> Clear Filters
              </button>
            </div>
      </div>

      {/* Results - Item-wise Wastage Details */}
      {filteredData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No wastage records found matching the filters</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th className="center-align">Date</th>
                <th className="center-align">Wastage No.</th>
                <th className="center-align">Item Code</th>
                <th className="center-align">Item Name</th>
                <th className="center-align">Quantity</th>
                <th className="center-align">Unit</th>
                <th className="center-align">Reason</th>
                <th className="center-align">Loss Amount</th>
                <th className="center-align actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(wastage => {
                const statusInfo = getStatusInfo(wastage.reason);
                const rawItems = getWastageItems(wastage);
                const items = (filters.itemId && filters.itemId !== 'all')
                  ? rawItems.filter(item => String(item.item_id) === String(filters.itemId))
                  : rawItems;
                
                // If no items, show a single row with no items
                if (items.length === 0) {
                  return null;
                }

                // Show each item as a separate row
                return items.map((item, index) => (
                  <tr key={`${wastage.id}-${item.id || index}`} className="report-row">
                    <td className="center-align">
                      {index === 0 ? new Date(wastage.date).toLocaleDateString() : ''}
                    </td>
                    <td className="center-align">
                      {index === 0 ? wastage.wastage_note_number : ''}
                    </td>
                    <td className="center-align">{item.item_code || '-'}</td>
                    <td className="center-align">{item.item_name || '-'}</td>
                    <td className="report-table-value-numeric">{Number(item.quantity || 0).toFixed(3)}</td>
                    <td className="center-align">{item.unit || '-'}</td>
                    <td className="center-align">
                      {index === 0 ? (
                        <span className="reason-badge" style={{ 
                          backgroundColor: statusInfo.bg,
                          color: statusInfo.color,
                          borderColor: statusInfo.color
                        }}>
                          <FontAwesomeIcon icon={statusInfo.icon} className="reason-icon" />
                          {wastage.reason}
                        </span>
                      ) : ''}
                    </td>
                    <td className="report-table-value-numeric text-danger">
                      {formatCurrency(item.estimated_loss || 0)}
                    </td>
                    <td className="center-align">
                      {index === 0 && (
                        <button
                          className="action-btn view-btn"
                          onClick={() => handleViewDetails(wastage.id)}
                          title="View Details"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7" className="center-align">
                  <strong>Grand Total Loss:</strong>
                </td>
                <td className="center-align total-loss-amount">
                  <strong>
                    {formatCurrency(
                      filteredData.reduce((sum, w) => sum + getTotalLoss(w), 0)
                    )}
                  </strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* Modal for wastage details - Enhanced with larger size */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faFileAlt} /> Wastage Details
              </h2>
              <button className="modal-close" onClick={closeModal}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="modal-body">
              {modalLoading && (
                <div className="loading-container" role="status" aria-live="polite">
                  <div className="loading-spinner"></div>
                  <p>Loading details...</p>
                </div>
              )}
              {selectedWastage && (
                <div className="wastage-details-modal">
                  <div className="detail-header">
                    <h3>{selectedWastage.wastage_note_number}</h3>
                    <span className="detail-status">
                      <FontAwesomeIcon icon={getStatusInfo(selectedWastage.reason).icon} />
                      {selectedWastage.reason}
                    </span>
                  </div>
                  
                  <div className="details-grid">
                    <div className="detail-item">
                      <label>Date</label>
                      <span>{new Date(selectedWastage.date).toLocaleDateString()}</span>
                    </div>
                    <div className="detail-item">
                      <label>Approved By</label>
                      <span>{selectedWastage.approved_by}</span>
                    </div>
                    <div className="detail-item">
                      <label>Entered By</label>
                      <span>{selectedWastage.entered_by}</span>
                    </div>
                  </div>

                  {selectedWastage.remarks && (
                    <div className="remarks-section">
                      <label>Remarks</label>
                      <p>{selectedWastage.remarks}</p>
                    </div>
                  )}

                  <div className="items-table-wrapper">
                    <h4>Wasted Items</h4>
                    <div className="items-table-scroll">
                      <table className="items-details-table">
                        <thead>
                          <tr>
                            <th className="center-align">Item Code</th>
                            <th className="center-align">Item Name</th>
                            <th className="text-right">Quantity</th>
                            <th className="center-align">Unit</th>
                            <th className="text-right">Estimated Loss (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedWastage.items && selectedWastage.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="center-align">{item.item_code}</td>
                              <td className="center-align">{item.item_name}</td>
                              <td className="report-table-value-numeric">{Number(item.quantity).toFixed(3)}</td>
                              <td className="center-align">{item.unit}</td>
                              <td className="report-table-value-numeric text-danger">
                                {formatCurrency(item.estimated_loss)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="4" className="center-align">
                              <strong>Total Estimated Loss:</strong>
                            </td>
                            <td className="center-align total-loss-amount">
                              <strong>
                                {selectedWastage.items ? 
                                  formatCurrency(
                                  selectedWastage.items.reduce((total, item) => 
                                    total + (parseFloat(item.estimated_loss) || 0), 0
                                  )
                                ) : formatCurrency(0)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WastageReport;