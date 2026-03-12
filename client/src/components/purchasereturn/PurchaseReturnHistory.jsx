import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faEye, 
  faSearch, 
  faFilter,
  faCalendar,
  faBuilding,
  faFileInvoice,
  faUndo
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import '../purchase/Purchase.css';

const PurchaseReturnsHistory = () => {
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  
  const [returns, setReturns] = useState([]);
  const [filteredReturns, setFilteredReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    fetchReturns();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = returns;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ret => 
        ret.return_number?.toLowerCase().includes(query) ||
        ret.purchase_invoice?.toLowerCase().includes(query) ||
        ret.supplier_name?.toLowerCase().includes(query)
      );
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter(ret => 
        dayjs(ret.return_date).isAfter(dayjs(startDate).subtract(1, 'day'))
      );
    }

    if (endDate) {
      filtered = filtered.filter(ret => 
        dayjs(ret.return_date).isBefore(dayjs(endDate).add(1, 'day'))
      );
    }

    setFilteredReturns(filtered);
  }, [returns, searchQuery, startDate, endDate]);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/purchase-returns');
      setReturns(response.data);
      setFilteredReturns(response.data);
    } catch (error) {
      console.error('Error fetching returns:', error);
      showPopup('error', 'Failed to load purchase returns');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    return dayjs(date).format('DD MMM YYYY');
  };

  const formatDateTime = (date) => {
    return dayjs(date).format('DD MMM YYYY, h:mm A');
  };

  const viewReturnDetails = async (id) => {
    try {
      const response = await api.get(`/purchase-returns/${id}`);
      setSelectedReturn(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Error fetching return details:', error);
      showPopup('error', 'Failed to load return details');
    }
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedReturn(null);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading purchase returns...</p>
      </div>
    );
  }

  return (
    <div className="purchase-returns-history-container">
      <div className="page-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faUndo} className="header-icon" />
            Purchase Returns History
          </h1>
          <p className="subtitle">View and manage all purchase returns</p>
        </div>
        <Link to="/purchase-returns/add" className="btn-primary">
          <FontAwesomeIcon icon={faPlus} />
          <span>New Return</span>
        </Link>
      </div>

      {/* Filters Section */}
      <div className="filters-card">
        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="filters-title">
            <FontAwesomeIcon icon={faFilter} />
            <h3>Filters</h3>
          </div>
          <button className="toggle-filters">
            {showFilters ? '−' : '+'}
          </button>
        </div>

        {showFilters && (
          <div className="filters-content">
            <div className="filters-grid">
              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faSearch} />
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Return #, Invoice #, Supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>
                  <FontAwesomeIcon icon={faCalendar} />
                  Date Range
                </label>
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                  />
                </div>
              </div>
            </div>

            <div className="filter-actions">
              <button onClick={clearFilters} className="btn-clear">
                Clear Filters
              </button>
              <span className="result-count">
                {filteredReturns.length} {filteredReturns.length === 1 ? 'return' : 'returns'} found
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Returns Table */}
      <div className="table-container">
        {filteredReturns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No returns found</h3>
            <p>Try adjusting your filters or create a new return</p>
            <Link to="/purchase-returns/add" className="btn-primary">
              <FontAwesomeIcon icon={faPlus} />
              Create Return
            </Link>
          </div>
        ) : (
          <table className="returns-table">
            <thead>
              <tr>
                <th>Return #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Purchase Invoice</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right">VAT</th>
                <th className="text-right">Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map(ret => (
                <tr key={ret.id}>
                  <td>
                    <span className="return-badge">{ret.return_number}</span>
                  </td>
                  <td>{formatDate(ret.return_date)}</td>
                  <td>
                    <div className="supplier-info">
                      <span className="supplier-name">{ret.supplier_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="invoice-ref">{ret.purchase_invoice}</span>
                  </td>
                  <td className="text-right">{formatCurrency(ret.subtotal)}</td>
                  <td className="text-right vat-col">{formatCurrency(ret.vat_amount)}</td>
                  <td className="text-right total-col">
                    <strong>{formatCurrency(ret.total_amount)}</strong>
                  </td>
                  <td>
                    <button
                      onClick={() => viewReturnDetails(ret.id)}
                      className="action-btn view"
                      title="View Details"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedReturn && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FontAwesomeIcon icon={faFileInvoice} />
                Return Details - {selectedReturn.return_number}
              </h3>
              <button className="close-button" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                {/* Return Info Card */}
                <div className="detail-card">
                  <div className="card-header">
                    <h4>Return Information</h4>
                  </div>
                  <div className="card-content">
                    <div className="info-row">
                      <span className="label">Return Number:</span>
                      <span className="value highlight">{selectedReturn.return_number}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Return Date:</span>
                      <span className="value">{formatDateTime(selectedReturn.return_date)}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Created At:</span>
                      <span className="value">{formatDateTime(selectedReturn.created_at)}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Returned By:</span>
                      <span className="value">{selectedReturn.returned_by_name}</span>
                    </div>
                  </div>
                </div>

                {/* Supplier Info Card */}
                <div className="detail-card">
                  <div className="card-header">
                    <h4>Supplier Information</h4>
                  </div>
                  <div className="card-content">
                    <div className="info-row">
                      <span className="label">Supplier:</span>
                      <span className="value highlight">{selectedReturn.supplier_name}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">VAT Status:</span>
                      <span className={`value vat-badge ${selectedReturn.supplier_vat_registered ? 'yes' : 'no'}`}>
                        {selectedReturn.supplier_vat_registered ? 'Registered' : 'Not Registered'}
                      </span>
                    </div>
                    {selectedReturn.supplier_vat_registered && (
                      <div className="info-row">
                        <span className="label">VAT Number:</span>
                        <span className="value vat-number">{selectedReturn.supplier_vat_number}</span>
                      </div>
                    )}
                    <div className="info-row">
                      <span className="label">Original Invoice:</span>
                      <span className="value">{selectedReturn.purchase_invoice}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Purchase Date:</span>
                      <span className="value">{formatDate(selectedReturn.original_purchase_date)}</span>
                    </div>
                  </div>
                </div>

                {/* Financial Summary Card */}
                <div className="detail-card financial">
                  <div className="card-header">
                    <h4>Financial Summary</h4>
                  </div>
                  <div className="financial-summary">
                    <div className="summary-row">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(selectedReturn.subtotal)}</span>
                    </div>
                    <div className="summary-row vat">
                      <span>VAT Amount:</span>
                      <span>{formatCurrency(selectedReturn.vat_amount)}</span>
                    </div>
                    <div className="summary-row total">
                      <span>Total Return Amount:</span>
                      <span className="bold">{formatCurrency(selectedReturn.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Returned Items Table */}
              <div className="items-card">
                <h4>Returned Items</h4>
                <div className="table-responsive">
                  <table className="items-details-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Unit Price</th>
                        <th>Amount</th>
                        {selectedReturn.supplier_vat_registered && <th>VAT</th>}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReturn.items.map((item, index) => {
                        const amount = item.quantity * item.unit_price;
                        return (
                          <tr key={index}>
                            <td>{index + 1}</td>
                            <td>
                              <div className="item-name">{item.item_name}</div>
                              <small className="item-code">{item.item_code}</small>
                            </td>
                            <td className="text-center">{item.quantity}</td>
                            <td>{item.unit || '-'}</td>
                            <td className="text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="text-right">{formatCurrency(amount)}</td>
                            {selectedReturn.supplier_vat_registered && (
                              <td className="text-right vat-column">
                                {item.vat_applicable ? formatCurrency(item.vat_amount) : '-'}
                              </td>
                            )}
                            <td className="text-right total-column">
                              <strong>{formatCurrency(item.total_amount)}</strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks */}
              {selectedReturn.remarks && (
                <div className="remarks-card">
                  <h4>Remarks</h4>
                  <div className="remarks-content">
                    {selectedReturn.remarks}
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

export default PurchaseReturnsHistory;