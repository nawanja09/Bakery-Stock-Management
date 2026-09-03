import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash, faPlus, faSearch } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsSales.css';

const FinishedGoodsSalesHistory = () => {
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchSales();
    fetchDesignations();
  }, []);

  useEffect(() => {
    const filtered = sales.filter(sale =>
      sale.designation_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.cashier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.sale_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredSales(filtered);
  }, [searchTerm, sales]);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const response = await api.get('/finished-goods-sales');
      const data = response.data;

      if (response.status === 200) {
        const sortedData = data.sort((a, b) => 
          new Date(b.sale_date) - new Date(a.sale_date)
        );
        setSales(sortedData);
        setFilteredSales(sortedData);
      } else {
        showPopup('error', data.error || 'Failed to fetch sales');
      }
    } catch (err) {
      console.error('Error fetching sales:', err);
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDesignations = async () => {
    try {
      const response = await api.get('/finished-goods-transfers/destinations');
      setDesignations(response.data);
    } catch (err) {
      console.error('Error fetching designations:', err);
    }
  };

  const getDesignationName = (designationId) => {
    const designation = designations.find(d => d.id === parseInt(designationId));
    return designation ? designation.name : 'Unknown';
  };

  const handleViewSale = async (id) => {
    try {
      const response = await api.get(`/finished-goods-sales/${id}`);
      setSelectedSale(response.data);
      setShowModal(true);
    } catch (error) {
      showPopup('error', 'Failed to fetch sale details');
    }
  };

  const handleDeleteSale = async (id) => {
    if (window.confirm('Are you sure you want to delete this sale record? This action cannot be undone.')) {
      try {
        const response = await api.delete(`/finished-goods-sales/${id}`);

        if (response.status === 200) {
          setSales(sales.filter(sale => sale.id !== id));
          showPopup('success', 'Sale record deleted successfully!');
        } else {
          const data = response.data;
          showPopup('error', data.error || 'Failed to delete sale record');
        }
      } catch (error) {
        console.error('Error deleting sale:', error);
        showPopup('error', 'Network error. Please try again.');
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedSale(null);
  };

  return (
    <div className="finished-goods-sales-container">
      {/* Header */}
      <div className="header-buttons">
        <div>
          <h1 className="page-title">Sales History</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            View and manage finished goods sales records
          </p>
        </div>
        <button 
          onClick={() => navigate('/finished-goods/sales/new', { state: { backgroundLocation: location } })}
          className="btn btn-primary"
        >
          <FontAwesomeIcon icon={faPlus} />
          Add New Sale
        </button>
      </div>

      {/* Search */}
      <div className="search-container">
        <FontAwesomeIcon icon={faSearch} className="search-icon" />
        <input
          type="text"
          placeholder="Search sales by designation, cashier, or sale number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          Loading sales records...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            {searchTerm ? 'No sales found' : 'No sales records'}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            {searchTerm 
              ? 'Try adjusting your search terms' 
              : 'Get started by recording your first sale'
            }
          </p>
          {!searchTerm && (
            <button 
              onClick={() => navigate('/finished-goods/sales/new', { state: { backgroundLocation: location } })}
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add New Sale
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>Date</th>
                <th>Designation</th>
                <th>Cashier Name</th>
                <th>Items</th>
                <th style={{ width: '120px' }}>Total Value</th>
                <th style={{ width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(sale => (
                <tr key={sale.id}>
                  <td>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {sale.sale_number}
                    </div>
                  </td>
                  <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                  <td>{getDesignationName(sale.designation)}</td>
                  <td>{sale.cashier_name}</td>
                  <td>
                    <span className="items-badge">
                      {sale.item_count} items
                    </span>
                  </td>
                  <td style={{ fontWeight: '600', color: 'var(--success)' }}>
                    Rs. {parseFloat(sale.total_value || 0).toFixed(2)}
                  </td>
                  <td>
                    <div className="actions">
                      <button 
                        onClick={() => handleViewSale(sale.id)} 
                        className="btn-icon"
                        title="View details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button 
                        onClick={() => handleDeleteSale(sale.id)} 
                        className="btn-icon error"
                        title="Delete sale"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Results Count */}
      {!loading && filteredSales.length > 0 && (
        <div style={{ 
          marginTop: '1rem', 
          textAlign: 'center', 
          color: 'var(--text-muted)',
          fontSize: '0.875rem'
        }}>
          Showing {filteredSales.length} of {sales.length} sales records
          {searchTerm && ` for "${searchTerm}"`}
        </div>
      )}

      {/* View Sale Modal */}
      {showModal && selectedSale && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sale Details - {selectedSale.sale_number}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Sale Date</label>
                  <span>{new Date(selectedSale.sale_date).toLocaleDateString()}</span>
                </div>
                <div className="detail-item">
                  <label>Designation</label>
                  <span>{getDesignationName(selectedSale.designation)}</span>
                </div>
                <div className="detail-item">
                  <label>Cashier</label>
                  <span>{selectedSale.cashier_name}</span>
                </div>
                <div className="detail-item full-width">
                  <label>Remarks</label>
                  <span>{selectedSale.remarks || 'No remarks'}</span>
                </div>
              </div>

              <h3 className="modal-subtitle">Sale Items</h3>
              <div className="items-list">
                {selectedSale.items && selectedSale.items.map((item, index) => (
                  <div key={index} className="item-detail">
                    <div className="item-info">
                      <strong>{item.item_name}</strong>
                      <span>{item.item_code} • {item.category}</span>
                    </div>
                    <div className="item-numbers">
                      <span>Qty: {item.quantity}</span>
                      <span>Price: Rs. {parseFloat(item.unit_price).toFixed(2)}</span>
                      <span className="item-total">Total: Rs. {parseFloat(item.total_value).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-total">
                <strong>Total Sale Value:</strong>
                <strong className="total-value">
                  Rs. {selectedSale.items ? 
                    selectedSale.items.reduce((total, item) => total + parseFloat(item.total_value), 0).toFixed(2) 
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

export default FinishedGoodsSalesHistory;