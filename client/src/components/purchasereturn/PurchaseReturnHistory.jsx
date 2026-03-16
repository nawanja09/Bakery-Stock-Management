// src/components/purchaseReturns/PurchaseReturnHistory.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faEye, 
  faSearch, 
  faFilter,
  faCalendar,
  faFileInvoice,
  faUndo,
  faBalanceScale,
  faCheckCircle,
  faTimesCircle,
  faInfoCircle,
  faChevronDown,
  faChevronUp,
  faDownload,
  faPrint,
  faBox,
  faTruck,
  faMoneyBill
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './PurchaseReturnHistory.css';

const PurchaseReturnHistory = () => {
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
  const [modalLoading, setModalLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    settlement: true,
    items: true,
    remarks: true
  });

  useEffect(() => {
    fetchReturns();
  }, []);

  useEffect(() => {
    let filtered = returns;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ret => 
        ret.return_number?.toLowerCase().includes(query) ||
        ret.purchase_invoice?.toLowerCase().includes(query) ||
        ret.supplier_name?.toLowerCase().includes(query)
      );
    }

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
      
      // Ensure all numeric values are properly initialized
      const processedReturns = response.data.map(ret => ({
        ...ret,
        total_amount: ret.total_amount || 0,
        settled_amount: ret.settled_amount || 0,
        balance_amount: ret.balance_amount || 0,
        subtotal: ret.subtotal || 0,
        vat_amount: ret.vat_amount || 0
      }));
      
      setReturns(processedReturns);
      setFilteredReturns(processedReturns);
    } catch (error) {
      console.error('Error fetching returns:', error);
      showPopup('error', 'Failed to load purchase returns');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    // Handle undefined, null, or NaN
    if (amount === undefined || amount === null || isNaN(amount)) {
      return 'Rs. 0.00';
    }
    
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return dayjs(date).format('DD MMM YYYY');
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    return dayjs(date).format('DD MMM YYYY, h:mm A');
  };

  const viewReturnDetails = async (id) => {
    try {
      setModalLoading(true);
      setShowDetailsModal(true);
      const response = await api.get(`/purchase-returns/${id}`);
      
      // Process the returned data to ensure numeric fields have defaults
      const processedData = {
        ...response.data,
        total_amount: response.data.total_amount || 0,
        settled_amount: response.data.settled_amount || 0,
        balance_amount: response.data.balance_amount || 0,
        subtotal: response.data.subtotal || 0,
        vat_amount: response.data.vat_amount || 0,
        items: (response.data.items || []).map(item => ({
          ...item,
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          vat_amount: item.vat_amount || 0,
          total_amount: item.total_amount || 0
        })),
        settlement_details: (response.data.settlement_details || []).map(s => ({
          ...s,
          amount: s.amount || 0
        }))
      };
      
      setSelectedReturn(processedData);
    } catch (error) {
      console.error('Error fetching return details:', error);
      showPopup('error', 'Failed to load return details');
      setShowDetailsModal(false);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedReturn(null);
    setExpandedSections({
      summary: true,
      settlement: true,
      items: true,
      remarks: true
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  const getSettlementStatus = (ret) => {
    // Ensure we're working with numbers
    const settled = Number(ret.settled_amount) || 0;
    const balance = Number(ret.balance_amount) || 0;
    const total = Number(ret.total_amount) || 0;
    
    if (settled === 0) {
      return { 
        text: 'Not Settled', 
        class: 'status-pending', 
        icon: faTimesCircle
      };
    } else if (balance === 0) {
      return { 
        text: 'Fully Settled', 
        class: 'status-fully-settled', 
        icon: faCheckCircle
      };
    } else {
      return { 
        text: 'Partially Settled', 
        class: 'status-partially-settled', 
        icon: faBalanceScale
      };
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['Return #', 'Date', 'Supplier', 'Purchase Invoice', 'Total', 'Settled', 'Balance', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredReturns.map(ret => {
        const status = getSettlementStatus(ret).text;
        return [
          ret.return_number,
          formatDate(ret.return_date),
          `"${ret.supplier_name || ''}"`,
          ret.purchase_invoice,
          ret.total_amount || 0,
          ret.settled_amount || 0,
          ret.balance_amount || 0,
          status
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-returns-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Calculate totals safely
  const totals = {
    count: filteredReturns.length,
    amount: filteredReturns.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    settled: filteredReturns.reduce((sum, r) => sum + (Number(r.settled_amount) || 0), 0),
    balance: filteredReturns.reduce((sum, r) => sum + (Number(r.balance_amount) || 0), 0)
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
            <FontAwesomeIcon icon={faUndo} />
            Purchase Returns
          </h1>
          <p className="subtitle">Manage and track all purchase returns</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportCSV} className="btn-outline">
            <FontAwesomeIcon icon={faDownload} />
            Export
          </button>
          <button onClick={handlePrint} className="btn-outline">
            <FontAwesomeIcon icon={faPrint} />
            Print
          </button>
          <Link to="/purchase-returns/add" className="btn-primary">
            <FontAwesomeIcon icon={faPlus} />
            New Return
          </Link>
        </div>
      </div>

      <div className="filters-card">
        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="filters-title">
            <FontAwesomeIcon icon={faFilter} />
            <h3>Filters</h3>
            {(searchQuery || startDate || endDate) && (
              <span className="active-filters-badge">
                {[searchQuery, startDate, endDate].filter(Boolean).length}
              </span>
            )}
          </div>
          <button className="toggle-filters">
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
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
                  placeholder="Search by return #, invoice, supplier..."
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
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
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

      {filteredReturns.length > 0 && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Returns</div>
            <div className="summary-value">{totals.count}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Amount</div>
            <div className="summary-value">{formatCurrency(totals.amount)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Settled</div>
            <div className="summary-value success-text">{formatCurrency(totals.settled)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Balance</div>
            <div className="summary-value warning-text">{formatCurrency(totals.balance)}</div>
          </div>
        </div>
      )}

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
                <th>Invoice</th>
                <th className="text-right">Total</th>
                <th className="text-right">Settled</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map(ret => {
                const status = getSettlementStatus(ret);
                return (
                  <tr key={ret.id}>
                    <td>
                      <span className="return-badge">{ret.return_number}</span>
                    </td>
                    <td>{formatDate(ret.return_date)}</td>
                    <td>
                      <div className="supplier-info">
                        <span className="supplier-name">{ret.supplier_name}</span>
                        <span className="invoice-ref">{ret.purchase_invoice}</span>
                      </div>
                    </td>
                    <td>{ret.purchase_invoice}</td>
                    <td className="text-right">
                      <strong>{formatCurrency(ret.total_amount)}</strong>
                    </td>
                    <td className="text-right success-text">
                      {formatCurrency(ret.settled_amount)}
                    </td>
                    <td className={`text-right ${Number(ret.balance_amount) > 0 ? 'warning-text' : 'muted-text'}`}>
                      {formatCurrency(ret.balance_amount)}
                    </td>
                    <td>
                      <span className={`settlement-badge ${status.class}`}>
                        <FontAwesomeIcon icon={status.icon} />
                        {status.text}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => viewReturnDetails(ret.id)}
                        className="action-btn"
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showDetailsModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FontAwesomeIcon icon={faFileInvoice} />
                Return Details - {selectedReturn?.return_number}
              </h3>
              <div className="modal-header-actions">
                <button className="btn-outline" onClick={handlePrint}>
                  <FontAwesomeIcon icon={faPrint} />
                </button>
                <button className="close-button" onClick={closeModal}>×</button>
              </div>
            </div>
            
            <div className="modal-body">
              {modalLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading details...</p>
                </div>
              ) : selectedReturn && (
                <>
                  <div className="modal-section">
                    <div 
                      className="section-header" 
                      onClick={() => toggleSection('summary')}
                    >
                      <h4>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        Return Information
                      </h4>
                      <FontAwesomeIcon 
                        icon={expandedSections.summary ? faChevronUp : faChevronDown} 
                      />
                    </div>
                    
                    {expandedSections.summary && (
                      <div className="details-grid">
                        <div className="detail-card">
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
                              <span className="label">Created:</span>
                              <span className="value">{formatDateTime(selectedReturn.created_at)}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">Returned By:</span>
                              <span className="value">{selectedReturn.returned_by_name}</span>
                            </div>
                          </div>
                        </div>

                        <div className="detail-card">
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
                          </div>
                        </div>

                        <div className="detail-card financial">
                          <div className="card-content">
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
                                <span>Total Amount:</span>
                                <span>{formatCurrency(selectedReturn.total_amount)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {(selectedReturn.settled_amount > 0 || selectedReturn.balance_amount > 0) && (
                    <div className="modal-section">
                      <div 
                        className="section-header" 
                        onClick={() => toggleSection('settlement')}
                      >
                        <h4>
                          <FontAwesomeIcon icon={faBalanceScale} />
                          Settlement Details
                        </h4>
                        <FontAwesomeIcon 
                          icon={expandedSections.settlement ? faChevronUp : faChevronDown} 
                        />
                      </div>

                      {expandedSections.settlement && (
                        <div className="settlement-summary">
                          <div className="settlement-cards">
                            <div className="settlement-card">
                              <div className="settlement-label">Total</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.total_amount)}</div>
                            </div>
                            <div className="settlement-card success">
                              <div className="settlement-label">Settled</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.settled_amount)}</div>
                            </div>
                            <div className="settlement-card warning">
                              <div className="settlement-label">Balance</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.balance_amount)}</div>
                            </div>
                          </div>

                          {selectedReturn.settlement_details?.length > 0 && (
                            <div className="settlement-details-card">
                              <h5>Settlement Breakdown</h5>
                              <div className="settlement-table-wrapper">
                                <table className="settlement-table">
                                  <thead>
                                    <tr>
                                      <th>Invoice #</th>
                                      <th className="text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedReturn.settlement_details.map((s, idx) => (
                                      <tr key={idx}>
                                        <td>{s.invoice_no}</td>
                                        <td className="text-right success-text">
                                          {formatCurrency(s.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="total-row">
                                      <td><strong>Total Settled</strong></td>
                                      <td className="text-right">
                                        <strong>{formatCurrency(
                                          selectedReturn.settlement_details.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
                                        )}</strong>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="modal-section">
                    <div 
                      className="section-header" 
                      onClick={() => toggleSection('items')}
                    >
                      <h4>
                        <FontAwesomeIcon icon={faBox} />
                        Returned Items
                      </h4>
                      <FontAwesomeIcon 
                        icon={expandedSections.items ? faChevronUp : faChevronDown} 
                      />
                    </div>

                    {expandedSections.items && (
                      <div className="items-card">
                        <div className="table-responsive">
                          <table className="items-details-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Item</th>
                                <th className="text-center">Qty</th>
                                <th>Unit</th>
                                <th className="text-right">Unit Price</th>
                                <th className="text-right">Amount</th>
                                {selectedReturn.supplier_vat_registered && (
                                  <th className="text-right vat-column">VAT</th>
                                )}
                                <th className="text-right total-column">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedReturn.items.map((item, index) => {
                                const amount = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                                return (
                                  <tr key={index}>
                                    <td>{index + 1}</td>
                                    <td>
                                      <div className="item-name">{item.item_name}</div>
                                      <small className="item-code">{item.item_code}</small>
                                    </td>
                                    <td className="text-center">{item.quantity || 0}</td>
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
                            <tfoot>
                              <tr>
                                <td colSpan={selectedReturn.supplier_vat_registered ? "6" : "5"} className="text-right">
                                  <strong>Total:</strong>
                                </td>
                                <td className="text-right total-column">
                                  <strong>{formatCurrency(selectedReturn.total_amount)}</strong>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedReturn.remarks && (
                    <div className="modal-section">
                      <div 
                        className="section-header" 
                        onClick={() => toggleSection('remarks')}
                      >
                        <h4>
                          <FontAwesomeIcon icon={faInfoCircle} />
                          Remarks
                        </h4>
                        <FontAwesomeIcon 
                          icon={expandedSections.remarks ? faChevronUp : faChevronDown} 
                        />
                      </div>

                      {expandedSections.remarks && (
                        <div className="remarks-card">
                          <div className="remarks-content">
                            {selectedReturn.remarks}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseReturnHistory;