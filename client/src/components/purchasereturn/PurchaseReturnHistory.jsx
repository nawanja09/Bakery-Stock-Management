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
  faReceipt,
  faMoneyBillWave,
  faCreditCard,
  faCheck
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api.js';
import SettlementModalForReturn from './SettlementModalForReturn'; // New component we'll create
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
  
  // NEW: Settlement modal states
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlingReturn, setSettlingReturn] = useState(null);
  const [settlingSupplierId, setSettlingSupplierId] = useState(null);
  const [settlingSupplierName, setSettlingSupplierName] = useState('');
  const [settlingReturnAmount, setSettlingReturnAmount] = useState(0);
  const [existingReturnSettlements, setExistingReturnSettlements] = useState([]);
  
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    settlement: true,
    settlementBreakdown: true,
    items: true,
    remarks: true
  });

  useEffect(() => { fetchReturns(); }, []);

  useEffect(() => {
    let filtered = returns;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.return_number?.toLowerCase().includes(q) ||
        r.invoice_display?.toLowerCase().includes(q) ||
        r.supplier_name?.toLowerCase().includes(q)
      );
    }
    if (startDate) filtered = filtered.filter(r => dayjs(r.return_date).isAfter(dayjs(startDate).subtract(1, 'day')));
    if (endDate)   filtered = filtered.filter(r => dayjs(r.return_date).isBefore(dayjs(endDate).add(1, 'day')));
    setFilteredReturns(filtered);
  }, [returns, searchQuery, startDate, endDate]);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/purchase-returns');
      console.log('Fetched returns:', response.data);
      setReturns(response.data);
      setFilteredReturns(response.data);
    } catch (error) {
      console.error('Error fetching purchase returns:', error);
      showPopup('error', 'Failed to load purchase returns');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 })
      .format(amount).replace('LKR', 'Rs.');

  const formatDate = (d) => d ? dayjs(d).format('DD MMM YYYY') : '-';
  const formatDateTime = (d) => d ? dayjs(d).format('DD MMM YYYY, h:mm A') : '-';

  const viewReturnDetails = async (id) => {
    try {
      setModalLoading(true);
      setShowDetailsModal(true);
      const response = await api.get(`/purchase-returns/${id}`);
      setSelectedReturn(response.data);
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
    setExpandedSections({ summary: true, settlement: true, settlementBreakdown: true, items: true, remarks: true });
  };

  // NEW: Open settlement modal for existing return
  const openSettlementModal = async (returnData) => {
    try {
      // Get fresh data for the return
      const response = await api.get(`/purchase-returns/${returnData.id}`);
      const freshReturnData = response.data;
      
      // Parse existing settlements
      let existingSettlements = [];
      if (freshReturnData.settlement_details) {
        try {
          existingSettlements = typeof freshReturnData.settlement_details === 'string'
            ? JSON.parse(freshReturnData.settlement_details)
            : freshReturnData.settlement_details;
        } catch (e) {
          existingSettlements = [];
        }
      }
      
      setSettlingReturn(freshReturnData);
      setSettlingSupplierId(freshReturnData.supplier_id);
      setSettlingSupplierName(freshReturnData.supplier_name);
      setSettlingReturnAmount(parseFloat(freshReturnData.balance_amount)); // Only remaining balance
      setExistingReturnSettlements(existingSettlements);
      setShowSettlementModal(true);
    } catch (error) {
      console.error('Error loading return for settlement:', error);
      showPopup('error', 'Failed to load return details for settlement');
    }
  };

  // NEW: Handle settlement confirmation for existing return
  const handleSettlementConfirm = async (settlementData) => {
    if (!settlingReturn) return;
    
    try {
      // Get current user
      const user = JSON.parse(localStorage.getItem('user'));
      
      // Prepare settlement payload
      const payload = {
        settlements: settlementData.settlements,
        payment_method: settlementData.payment_method || 'CASH',
        settlement_date: settlementData.settlement_date || dayjs().format('YYYY-MM-DD'),
        notes: settlementData.note,
        settled_by: user?.id
      };
      
      // Call API to add settlement
      const response = await api.post(`/purchase-returns/${settlingReturn.id}/settle`, payload);
      
      if (response.data) {
        showPopup('success', 
          `Settlement added successfully!\n` +
          `Amount: Rs. ${settlementData.settlements.reduce((s, b) => s + b.amount, 0).toFixed(2)}\n` +
          `Remaining Balance: Rs. ${response.data.summary.balance_amount.toFixed(2)}`
        );
        
        // Refresh the returns list
        await fetchReturns();
        
        // If details modal is open, refresh that too
        if (showDetailsModal && selectedReturn) {
          const freshDetails = await api.get(`/purchase-returns/${settlingReturn.id}`);
          setSelectedReturn(freshDetails.data);
        }
      }
    } catch (error) {
      console.error('Error adding settlement:', error);
      showPopup('error', error.response?.data?.error || 'Failed to add settlement');
    }
  };

  const closeSettlementModal = () => {
    setShowSettlementModal(false);
    setSettlingReturn(null);
    setSettlingSupplierId(null);
    setSettlingSupplierName('');
    setSettlingReturnAmount(0);
    setExistingReturnSettlements([]);
  };

  const clearFilters = () => { setSearchQuery(''); setStartDate(''); setEndDate(''); };

  const getSettlementStatus = (ret) => {
    const balance = parseFloat(ret.balance_amount) || 0;
    const total = parseFloat(ret.total_amount) || 0;
    const settled = parseFloat(ret.settled_amount) || 0;
    
    if (settled === 0 && balance === total) {
      return { text: 'Not Settled', cls: 'status-pending', icon: faTimesCircle, canSettle: true };
    }
    if (balance === 0) {
      return { text: 'Fully Settled', cls: 'status-fully-settled', icon: faCheckCircle, canSettle: false };
    }
    return { text: 'Partially Settled', cls: 'status-partially-settled', icon: faBalanceScale, canSettle: true };
  };

  const toggleSection = (section) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const headers = ['Return #', 'Date', 'Supplier', 'Invoice #', 'Invoice Date', 'Total', 'Settled', 'Balance', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredReturns.map(ret => {
        const status = getSettlementStatus(ret).text;
        return [
          ret.return_number,
          formatDate(ret.return_date),
          `"${ret.supplier_name}"`,
          `"${ret.invoice_display || '-'}"`,
          formatDate(ret.invoice_date_display),
          ret.total_amount,
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading purchase returns…</p>
      </div>
    );
  }

  const activeFilterCount = [searchQuery, startDate, endDate].filter(Boolean).length;

  return (
    <div className="purchase-returns-history-container">

      {/* PAGE HEADER */}
      <div className="page-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faUndo} className="header-icon" />
            Purchase Returns
          </h1>
          <p className="subtitle">View and manage all purchase returns with settlement tracking</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportCSV} className="btn-outline" type="button">
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
          <button onClick={handlePrint} className="btn-outline" type="button">
            <FontAwesomeIcon icon={faPrint} /> Print
          </button>
          <Link to="/purchase-returns/add" className="btn-primary">
            <FontAwesomeIcon icon={faPlus} /> New Return
          </Link>
        </div>
      </div>

      {/* FILTERS */}
      <div className="filters-card">
        <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
          <div className="filters-title">
            <FontAwesomeIcon icon={faFilter} />
            <h3>Filters</h3>
            {activeFilterCount > 0 && (
              <span className="active-filters-badge">{activeFilterCount}</span>
            )}
          </div>
          <button className="toggle-filters" type="button">
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
          </button>
        </div>

        {showFilters && (
          <div className="filters-content">
            <div className="filters-grid">
              <div className="filter-group">
                <label><FontAwesomeIcon icon={faSearch} /> Search</label>
                <input
                  type="text"
                  placeholder="Return #, Invoice #, Supplier…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-input"
                />
              </div>
              <div className="filter-group">
                <label><FontAwesomeIcon icon={faCalendar} /> Date Range</label>
                <div className="date-range-inputs">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <span>to</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="filter-actions">
              <button onClick={clearFilters} className="btn-clear" type="button">Clear</button>
              <span className="result-count">
                {filteredReturns.length} {filteredReturns.length === 1 ? 'return' : 'returns'} found
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY CARDS */}
      {filteredReturns.length > 0 && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Returns</div>
            <div className="summary-value">{filteredReturns.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Amount</div>
            <div className="summary-value">{formatCurrency(filteredReturns.reduce((s, r) => s + r.total_amount, 0))}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Settled</div>
            <div className="summary-value success-text">{formatCurrency(filteredReturns.reduce((s, r) => s + (r.settled_amount || 0), 0))}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Outstanding Balance</div>
            <div className="summary-value warning-text">{formatCurrency(filteredReturns.reduce((s, r) => s + (r.balance_amount || 0), 0))}</div>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="table-container">
        {filteredReturns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No returns found</h3>
            <p>Try adjusting your filters or create a new return</p>
            <Link to="/purchase-returns/add" className="btn-primary">
              <FontAwesomeIcon icon={faPlus} /> Create Return
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
                <th colSpan="2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map(ret => {
                const status = getSettlementStatus(ret);
                const invoiceDisplay = (ret.invoice_display && ret.invoice_display !== 'null' && ret.invoice_display !== '—')
                  ? ret.invoice_display
                  : (ret.purchase_invoice && ret.purchase_invoice !== 'null')
                    ? ret.purchase_invoice
                    : '—';

                const invoiceDate = (ret.invoice_date_display && ret.invoice_date_display !== 'null')
                  ? ret.invoice_date_display
                  : (ret.original_purchase_date && ret.original_purchase_date !== 'null')
                    ? ret.original_purchase_date
                    : null;

                return (
                  <tr key={ret.id}>
                    <td>
                      <span className="return-badge">{ret.return_number}</span>
                    </td>
                    <td>{formatDate(ret.return_date)}</td>
                    <td>
                      <div className="supplier-info">
                        <div className="supplier-name">{ret.supplier_name}</div>
                        {ret.supplier_vat_registered && (
                          <div className="supplier-vat">VAT Reg</div>
                        )}
                      </div>
                    </td>
                    <td className="invoice-cell">
                      <div className="invoice-info">
                        <span className="invoice-badge-small" title={invoiceDisplay}>
                          {invoiceDisplay.length > 25 ? invoiceDisplay.substring(0, 25) + '...' : invoiceDisplay}
                        </span>
                        {invoiceDate && invoiceDate !== 'null' && (
                          <div className="invoice-date-small">
                            {formatDate(invoiceDate)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <span className="amount-value">{formatCurrency(ret.total_amount)}</span>
                    </td>
                    <td className="text-right">
                      <span className="amount-value success">{formatCurrency(ret.settled_amount || 0)}</span>
                    </td>
                    <td className="text-right">
                      <span className="amount-value warning">{formatCurrency(ret.balance_amount || 0)}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${status.cls}`}>
                        <FontAwesomeIcon icon={status.icon} />
                        {status.text}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-view"
                        onClick={() => viewReturnDetails(ret.id)}
                        title="View details"
                        type="button"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </td>
                    <td>
                      {status.canSettle && (
                        <button
                          className="btn-settle"
                          onClick={() => openSettlementModal(ret)}
                          title="Settle this return"
                          type="button"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: '#059669',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}
                        >
                          <FontAwesomeIcon icon={faCreditCard} />
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* DETAILS MODAL (same as before) */}
      {showDetailsModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>

                <FontAwesomeIcon icon={faFileInvoice} /> Details for Return #
                {selectedReturn?.return_number || 'Return Details'}
              </h3>
              <div className="modal-header-actions">
                <button className="close-button" onClick={closeModal} type="button">×</button>
              </div>
            </div>

            <div className="modal-body">
              {modalLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner" />
                  <p>Loading details…</p>
                </div>
              ) : selectedReturn && (
                <>
                  {/* Return Information */}
                  <div className="modal-section">
                    <div className="section-header" onClick={() => toggleSection('summary')}>
                      <h4><FontAwesomeIcon icon={faInfoCircle} /> Return Information</h4>
                      <FontAwesomeIcon icon={expandedSections.summary ? faChevronUp : faChevronDown} />
                    </div>

                    {expandedSections.summary && (
                      <div className="details-grid">
                        <div className="detail-card">
                          <div className="card-content">
                            <div className="info-row">
                              <span className="label">Return Number</span>
                              <span className="value">{selectedReturn.return_number}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">Return Date</span>
                              <span className="value">{formatDateTime(selectedReturn.return_date)}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">Created At</span>
                              <span className="value">{formatDateTime(selectedReturn.created_at)}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">Returned By</span>
                              <span className="value">{selectedReturn.returned_by_name}</span>
                            </div>
                          </div>
                        </div>

                        <div className="detail-card">
                          <div className="card-content">
                            <div className="info-row">
                              <span className="label">Supplier</span>
                              <span className="value">{selectedReturn.supplier_name}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">VAT Status</span>
                              <span className={`value ${selectedReturn.supplier_vat_registered ? 'yes' : 'no'}`}>
                                {selectedReturn.supplier_vat_registered ? 'Registered' : 'Not Registered'}
                              </span>
                            </div>
                            {selectedReturn.supplier_vat_registered && (
                              <div className="info-row">
                                <span className="label">VAT Number</span>
                                <span className="value vat-number">{selectedReturn.supplier_vat_number}</span>
                              </div>
                            )}
                            <div className="info-row">
                              <span className="label">Original Invoice</span>
                              <span className="value">{selectedReturn.purchase_invoice || '—'}</span>
                            </div>
                            <div className="info-row">
                              <span className="label">Purchase Date</span>
                              <span className="value">{formatDate(selectedReturn.original_purchase_date)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="detail-card financial">
                          <div className="card-content">
                            <div className="financial-summary">
                              <div className="summary-row">
                                <span>Subtotal</span>
                                <span>{formatCurrency(selectedReturn.subtotal)}</span>
                              </div>
                              <div className="summary-row vat">
                                <span>VAT Amount</span>
                                <span>{formatCurrency(selectedReturn.vat_amount)}</span>
                              </div>
                              <div className="summary-row total">
                                <span>Total Return Amount</span>
                                <span className="bold">{formatCurrency(selectedReturn.total_amount)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settlement Summary */}
                  {(selectedReturn.settled_amount > 0 || selectedReturn.balance_amount > 0) && (
                    <div className="modal-section">
                      <div className="section-header" onClick={() => toggleSection('settlement')}>
                        <h4><FontAwesomeIcon icon={faBalanceScale} /> Settlement Summary</h4>
                        <FontAwesomeIcon icon={expandedSections.settlement ? faChevronUp : faChevronDown} />
                      </div>

                      {expandedSections.settlement && (
                        <div className="settlement-summary">
                          <div className="settlement-cards">
                            <div className="settlement-card">
                              <div className="settlement-label">Total Amount</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.total_amount)}</div>
                            </div>
                            <div className="settlement-card success">
                              <div className="settlement-label">Settled Amount</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.settled_amount || 0)}</div>
                            </div>
                            <div className="settlement-card warning">
                              <div className="settlement-label">Balance Amount</div>
                              <div className="settlement-value">{formatCurrency(selectedReturn.balance_amount || 0)}</div>
                            </div>
                          </div>
                          
                          {/* Settle button in modal if not fully settled */}
                          {selectedReturn.balance_amount > 0 && (
                            <div style={{ marginTop: '16px', textAlign: 'right' }}>
                              <button
                                className="btn-primary"
                                onClick={() => {
                                  closeModal();
                                  openSettlementModal(selectedReturn);
                                }}
                                type="button"
                                style={{ background: '#059669' }}
                              >
                                <FontAwesomeIcon icon={faCreditCard} /> Settle Balance
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Settlement Breakdown */}
                  {selectedReturn.settlement_details?.length > 0 && (
                    <div className="modal-section">
                      <div className="section-header" onClick={() => toggleSection('settlementBreakdown')}>
                        <h4><FontAwesomeIcon icon={faReceipt} /> Settlement Breakdown by Bill</h4>
                        <FontAwesomeIcon icon={expandedSections.settlementBreakdown ? faChevronUp : faChevronDown} />
                      </div>

                      {expandedSections.settlementBreakdown && (
                        <div className="settlement-breakdown">
                          <div className="settlement-table-wrapper">
                            <table className="settlement-breakdown-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Invoice Number</th>
                                  <th>Invoice Date</th>
                                  <th className="text-right">Amount Settled</th>
                                  <th className="text-center">% of Return</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedReturn.settlement_details.map((s, idx) => {
                                  const pct = ((s.amount / selectedReturn.total_amount) * 100).toFixed(2);
                                  return (
                                    <tr key={idx}>
                                      <td>{idx + 1}</td>
                                      <td><span className="invoice-number">{s.invoice_no}</span></td>
                                      <td>{formatDate(s.invoice_date)}</td>
                                      <td className="text-right success-text">
                                        <strong>{formatCurrency(s.amount)}</strong>
                                      </td>
                                      <td className="text-center">
                                        <span className="percentage-badge">{pct}%</span>
                                      </td>
                                    </tr> 
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colSpan="3" className="text-right"><strong>Total Settled:</strong></td>
                                  <td className="text-right success-text">
                                    <strong>{formatCurrency(selectedReturn.settlement_details.reduce((sum, s) => sum + s.amount, 0))}</strong>
                                  </td>
                                  <td className="text-center"><strong>100%</strong></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          <div className="settlement-progress">
                            <div className="progress-label">
                              <span>Settlement Progress</span>
                              <span>{formatCurrency(selectedReturn.settled_amount)} of {formatCurrency(selectedReturn.total_amount)}</span>
                            </div>
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${(selectedReturn.settled_amount / selectedReturn.total_amount) * 100}%` }}
                              />
                            </div>
                            <div className="progress-percentage">
                              {((selectedReturn.settled_amount / selectedReturn.total_amount) * 100).toFixed(2)}% Settled
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Returned Items */}
                  <div className="modal-section">
                    <div className="section-header" onClick={() => toggleSection('items')}>
                      <h4><FontAwesomeIcon icon={faFileInvoice} /> Returned Items</h4>
                      <FontAwesomeIcon icon={expandedSections.items ? faChevronUp : faChevronDown} />
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
                              {selectedReturn.items?.map((item, idx) => (
                                <tr key={idx}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    <div className="item-name">{item.item_name}</div>
                                    {item.item_code && <div className="item-code">{item.item_code}</div>}
                                  </td>
                                  <td className="text-center">{parseFloat(item.quantity).toFixed(3)}</td>
                                  <td>{item.unit || '-'}</td>
                                  <td className="text-right">{formatCurrency(item.unit_price)}</td>
                                  <td className="text-right">{formatCurrency(item.quantity * item.unit_price)}</td>
                                  {selectedReturn.supplier_vat_registered && (
                                    <td className="text-right vat-column">
                                      {item.vat_applicable ? formatCurrency(item.vat_amount) : '-'}
                                    </td>
                                  )}
                                  <td className="text-right total-column">
                                    <strong>{formatCurrency(item.total_amount)}</strong>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={selectedReturn.supplier_vat_registered ? 6 : 5} className="text-right">
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

                  {/* Remarks */}
                  {selectedReturn.remarks && (
                    <div className="modal-section">
                      <div className="section-header" onClick={() => toggleSection('remarks')}>
                        <h4><FontAwesomeIcon icon={faInfoCircle} /> Remarks</h4>
                        <FontAwesomeIcon icon={expandedSections.remarks ? faChevronUp : faChevronDown} />
                      </div>
                      {expandedSections.remarks && (
                        <div className="remarks-card">
                          <div className="remarks-content">{selectedReturn.remarks}</div>
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

      {/* SETTLEMENT MODAL FOR EXISTING RETURN */}
      <SettlementModalForReturn
        isOpen={showSettlementModal}
        onClose={closeSettlementModal}
        supplierId={settlingSupplierId}
        supplierName={settlingSupplierName}
        returnAmount={settlingReturnAmount}
        returnTotal={settlingReturn?.total_amount || 0}
        existingSettlements={existingReturnSettlements}
        onConfirm={handleSettlementConfirm}
      />
    </div>
  );
};

export default PurchaseReturnHistory;