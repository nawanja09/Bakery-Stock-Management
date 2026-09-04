// src/components/purchase/PendingInvoicesSection.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileInvoiceDollar,
  faCheckCircle,
  faPaperPlane,
  faBalanceScale,
  faSearch,
  faReceipt,
  faWallet,
  faFileInvoice,
  faMoneyBillWave,
  faFilter,
  faTimes,
  faBuilding,
  faCalendarAlt,
  faExclamationCircle,
  faClock,
  faChevronLeft,
  faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './PendingInvoicesSection.css';

import InvoicePaymentModal from './InvoicePaymentModal';
import PayNowModal from './PayNowModal';
import SettleNowModal from './SettleNowModal';

const PendingInvoicesSection = ({ supplierId, supplierName, suppliers = [], companies = [], refreshKey = 0 }) => {
  const { showPopup } = usePopup();

  const [allInvoices, setAllInvoices] = useState([]);
  const [allAdvances, setAllAdvances] = useState([]);
  const [allReturnCredits, setAllReturnCredits] = useState([]);
  const [loading, setLoading] = useState(false);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [activeFilterId, setActiveFilterId] = useState(supplierId || '');
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [showPayModal, setShowPayModal] = useState(false);
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [settleInvoice, setSettleInvoice] = useState(null);

  // Sync active filter when parent supplier changes
  useEffect(() => {
    setActiveFilterId(supplierId || '');
    setSelectedInvoiceIds(new Set());
  }, [supplierId]);

  // Fetch ALL outstanding records
  const fetchAllOutstanding = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 Fetching outstanding records...');
      const { data } = await api.get('/suppliers/outstanding/all');
      console.log('📊 Outstanding data received:', data);
      
      const outstandingInvoices = data.OutstandingInvoices || data.invoices || [];
      const advancePayments = data.AdvancePayments || data.advances || [];
      const purchaseReturnCredits = data.PurchaseReturnCredits || data.return_credits || [];
      
      // Parse amounts to numbers
      const parsedInvoices = outstandingInvoices.map(inv => ({
        ...inv,
        balance_amount: parseFloat(inv.balance_amount) || 0,
        outstanding_amount: parseFloat(inv.outstanding_amount) || 0,
        total_with_vat: parseFloat(inv.total_with_vat) || 0,
        paid_amount: parseFloat(inv.paid_amount) || 0
      }));
      
      setAllInvoices(parsedInvoices);
      setAllAdvances(advancePayments);
      setAllReturnCredits(purchaseReturnCredits);
      setSelectedInvoiceIds(new Set());
      
      console.log('✅ Outstanding records updated:', {
        invoices: parsedInvoices.length,
        advances: advancePayments.length,
        credits: purchaseReturnCredits.length
      });
    } catch (err) {
      console.error('❌ Error fetching all outstanding records:', err);
      showPopup('error', 'Failed to load outstanding records');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchAllOutstanding();
  }, [fetchAllOutstanding, refreshKey]);

  useEffect(() => {
    const handlePurchasePaymentUpdated = () => {
      console.log('🔄 Payment update event received, refreshing...');
      fetchAllOutstanding();
    };

    window.addEventListener('purchase-payment-updated', handlePurchasePaymentUpdated);
    return () => {
      window.removeEventListener('purchase-payment-updated', handlePurchasePaymentUpdated);
    };
  }, [fetchAllOutstanding]);

  // Build unified flat list
  const allRecords = useMemo(() => {
    const invoices = allInvoices.map((r) => ({ ...r, _rowType: 'invoice' }));
    const advances = allAdvances.map((r) => ({ ...r, _rowType: 'advance' }));
    const credits = allReturnCredits.map((r) => ({ ...r, _rowType: 'return_credit' }));
    return [...invoices, ...advances, ...credits];
  }, [allInvoices, allAdvances, allReturnCredits]);

  // Available credit (advance payments + return credits) per supplier - this is what
  // a "Settle" action actually consumes, so a supplier with none has nothing to settle with.
  const availableCreditBySupplier = useMemo(() => {
    const map = {};
    [...allAdvances, ...allReturnCredits].forEach((r) => {
      const key = String(r.supplier_id);
      map[key] = (map[key] || 0) + (parseFloat(r.outstanding_amount) || 0);
    });
    return map;
  }, [allAdvances, allReturnCredits]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    const term = supplierSearch.toLowerCase().trim();
    return allRecords.filter((r) => {
      const matchesText = !term || r.supplier_name?.toLowerCase().includes(term);
      const matchesId = !activeFilterId || String(r.supplier_id) === String(activeFilterId);
      const matchesCompany = !companyFilter || String(r.company_id || '') === String(companyFilter);
      const matchesStatus = !statusFilter || (r.status || 'Active') === statusFilter;
      const matchesDate = !dateFilter || (r.transaction_date && dayjs(r.transaction_date).format('YYYY-MM') === dateFilter);
      return matchesText && matchesId && matchesCompany && matchesStatus && matchesDate;
    });
  }, [allRecords, supplierSearch, activeFilterId, companyFilter, statusFilter, dateFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [supplierSearch, activeFilterId, companyFilter, statusFilter, dateFilter]);

  // Summary cards
  const summaryStats = useMemo(() => {
    const records = activeFilterId
      ? allRecords.filter((r) => String(r.supplier_id) === String(activeFilterId))
      : allRecords;

    const totalOutstandingInvoices = records
      .filter((r) => r._rowType === 'invoice')
      .reduce((s, r) => s + (parseFloat(r.outstanding_amount) || 0), 0);

    const totalAvailableCredit = [
      ...records.filter((r) => r._rowType === 'advance'),
      ...records.filter((r) => r._rowType === 'return_credit')
    ].reduce((s, r) => s + (parseFloat(r.outstanding_amount) || 0), 0);

    const invoiceCount = records.filter((r) => r._rowType === 'invoice').length;
    const creditCount = records.filter((r) => r._rowType !== 'invoice').length;

    return { totalOutstandingInvoices, totalAvailableCredit, invoiceCount, creditCount };
  }, [allRecords, activeFilterId]);

  // Selection helpers
  const selectedInvoicesList = allInvoices.filter((i) => selectedInvoiceIds.has(i.id));

  // Once one invoice is selected, its supplier AND company lock the rest
  // of the selection - invoices from any other supplier, or from the
  // same supplier but a different company, become unselectable until the
  // selection is cleared. (Supplier + Company = one payment group.)
  const lockedSupplierId = selectedInvoicesList.length > 0
    ? String(selectedInvoicesList[0].supplier_id)
    : null;
  const lockedCompanyId = selectedInvoicesList.length > 0
    ? String(selectedInvoicesList[0].company_id || '')
    : null;

  const selectableInvoices = filteredRecords.filter(
    (r) =>
      r._rowType === 'invoice' &&
      (!lockedSupplierId || String(r.supplier_id) === lockedSupplierId) &&
      (!lockedCompanyId || String(r.company_id || '') === lockedCompanyId)
  );

  const toggleSelection = (id, record) => {
    // Block selecting a different company's invoice outright, with a
    // clear explanation, instead of silently allowing then rejecting later.
    if (
      record &&
      !selectedInvoiceIds.has(id) &&
      lockedCompanyId &&
      String(record.company_id || '') !== lockedCompanyId
    ) {
      showPopup(
        'error',
        'You can only make a payment for one company at a time. Please deselect the current company invoices before selecting invoices from another company.'
      );
      return;
    }
    const next = new Set(selectedInvoiceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoiceIds(next);
  };

  const toggleAll = () => {
    if (selectedInvoiceIds.size === selectableInvoices.length) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(selectableInvoices.map((i) => i.id)));
    }
  };

  // Cross-supplier / cross-company validation
  const validateSameSupplier = (records, actionName) => {
    const supplierIds = [...new Set(records.map((r) => r.supplier_id))];
    if (supplierIds.length > 1) {
      showPopup(
        'error',
        `Cannot ${actionName}: selected records belong to different suppliers. ` +
          'Please select records from the same supplier only.'
      );
      return false;
    }
    const companyIds = [...new Set(records.map((r) => String(r.company_id || '')))];
    if (companyIds.length > 1) {
      showPopup(
        'error',
        'You can only make a payment for one company at a time. Please deselect the current company invoices before selecting invoices from another company.'
      );
      return false;
    }
    return true;
  };

  // Action handlers
  const handlePaySelected = () => {
    const selected = allInvoices.filter((i) => selectedInvoiceIds.has(i.id));
    if (selected.length === 0) {
      showPopup('warning', 'Please select at least one invoice to pay.');
      return;
    }
    if (!validateSameSupplier(selected, 'pay')) return;
    setShowPayModal(true);
  };

  const handlePayNow = () => {
    setShowPayNowModal(true);
  };

  const handleSettleClick = (invoice) => {
    const supplierCredit = availableCreditBySupplier[String(invoice.supplier_id)] || 0;
    const invoiceBalance = parseFloat(invoice.outstanding_amount) || 0;

    if (invoiceBalance <= 0) {
      showPopup('warning', 'This invoice has no outstanding balance to settle.');
      return;
    }
    if (supplierCredit <= 0) {
      showPopup('warning', `${invoice.supplier_name || 'This supplier'} has no available credit to settle with.`);
      return;
    }

    setSettleInvoice(invoice);
    setShowSettleModal(true);
  };

  const handleClearFilter = () => {
    setActiveFilterId('');
    setSupplierSearch('');
    setSelectedInvoiceIds(new Set());
  };

  // Helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  const getDocIcon = (type) => {
    switch (type) {
      case 'Invoice':
        return faFileInvoice;
      case 'Advance Payment':
        return faMoneyBillWave;
      default:
        return faReceipt;
    }
  };

  const activeSupplierName = activeFilterId
    ? supplierName || suppliers.find((s) => String(s.id) === String(activeFilterId))?.name || ''
    : '';

  const selectedTotal = useMemo(() =>
    selectedInvoicesList.reduce((sum, invoice) => sum + parseFloat(invoice.balance_amount || 0), 0),
    [selectedInvoicesList]
  );
  const activeSupplierForModal = selectedInvoicesList[0]
    ? suppliers.find((s) => String(s.id) === String(selectedInvoicesList[0].supplier_id))?.name ||
      activeSupplierName
    : activeSupplierName;

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pagedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredRecords.length);

  const getStatusIcon = (status) => {
    if (status === 'Paid') return faCheckCircle;
    if (status === 'Partially Paid') return faClock;
    if (status === 'Credit') return faWallet;
    return faExclamationCircle;
  };

  const handleResetFilters = () => {
    handleClearFilter();
    setCompanyFilter('');
    setStatusFilter('');
    setDateFilter('');
  };

  return (
    <div className="pis-container">
      {/* Modals */}
      <InvoicePaymentModal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        supplierName={activeSupplierForModal}
        selectedInvoices={selectedInvoicesList}
        onSuccess={async (result) => {
          console.log('💰 Payment completed:', result);
          
          // Close modal first
          setShowPayModal(false);
          
          // Wait a moment for database to update
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Refresh data from server
          await fetchAllOutstanding();
          
          // Dispatch event for other components
          window.dispatchEvent(new Event('purchase-payment-updated'));
          
          // Clear selection
          setSelectedInvoiceIds(new Set());
        }}
      />

      <PayNowModal
        isOpen={showPayNowModal}
        onClose={() => setShowPayNowModal(false)}
        suppliers={suppliers}
        companies={companies}
        onSuccess={async (responseData) => {
          console.log('💰 Advance payment completed:', responseData);
          await fetchAllOutstanding();
          window.dispatchEvent(new Event('purchase-payment-updated'));
        }}
      />

      <SettleNowModal
        isOpen={showSettleModal}
        onClose={() => {
          setShowSettleModal(false);
          setSettleInvoice(null);
        }}
        supplierId={settleInvoice?.supplier_id}
        invoice={settleInvoice}
        onSuccess={async () => {
          console.log('💰 Settlement completed');
          setShowSettleModal(false);
          setSettleInvoice(null);
          await fetchAllOutstanding();
          window.dispatchEvent(new Event('purchase-payment-updated'));
        }}
      />

      {/* Page Header */}
      <div className="pis-page-header">
        <div>
          <span className="pis-eyebrow"><FontAwesomeIcon icon={faReceipt} /> SUPPLIER LEDGER</span>
          <h2>Purchase &amp; Supplier Payments</h2>
        </div>
      </div>

      <div className="pis-panel-heading">
        <div>
          <h3>Pending Invoices &amp; Payments</h3>
        </div>
        <div className="pis-header-actions">
          <button
            className="pis-btn-pay-now"
            onClick={handlePayNow}
            type="button"
            title="Record an advance payment"
          >
            <FontAwesomeIcon icon={faPaperPlane} /> Pay Now (Advance Payment)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="pis-summary-grid">
        <div className="pis-summary-item debt"><div className="pis-summary-icon"><FontAwesomeIcon icon={faFileInvoiceDollar} /></div><div>
          <span>Outstanding Invoices</span>
          {loading ? <i className="pis-skeleton pis-skeleton-value" /> : <strong>{formatCurrency(summaryStats.totalOutstandingInvoices)}</strong>}
          <small>Total amount due</small></div></div>
        <div className="pis-summary-item warning"><div className="pis-summary-icon"><FontAwesomeIcon icon={faClock} /></div><div>
          <span>Pending Invoices</span>
          {loading ? <i className="pis-skeleton pis-skeleton-value" /> : <strong>{summaryStats.invoiceCount}</strong>}
          <small>Need attention</small></div></div>
        <div className="pis-summary-item credit"><div className="pis-summary-icon"><FontAwesomeIcon icon={faWallet} /></div><div>
          <span>Available Credits</span>
          {loading ? <i className="pis-skeleton pis-skeleton-value" /> : <strong>{formatCurrency(summaryStats.totalAvailableCredit)}</strong>}
          <small>Supplier credits</small></div></div>
        <div className="pis-summary-item success"><div className="pis-summary-icon"><FontAwesomeIcon icon={faCheckCircle} /></div><div>
          <span>Credit Documents</span>
          {loading ? <i className="pis-skeleton pis-skeleton-value" /> : <strong>{summaryStats.creditCount}</strong>}
          <small>Active documents</small></div></div>
      </div>

      {/* Filter Bar */}
      <div className="pis-filter-bar">
        <div className="pis-filter-group">
          <label htmlFor="pis-supplier-search">
            <FontAwesomeIcon icon={faSearch} /> Search Supplier
          </label>
          <div className="pis-filter-input-wrap">
            <FontAwesomeIcon icon={faSearch} />
            <input
              id="pis-supplier-search"
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search suppliers..."
            />
            {supplierSearch && (
              <button
                type="button"
                className="pis-clear-btn"
                onClick={() => setSupplierSearch('')}
                title="Clear search"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>
        <div className="pis-filter-group"><label htmlFor="pis-company-filter"><FontAwesomeIcon icon={faBuilding} /> Company</label><select id="pis-company-filter" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}><option value="">All companies</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
        <div className="pis-filter-group"><label htmlFor="pis-status-filter"><FontAwesomeIcon icon={faFilter} /> Payment Status</label><select id="pis-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="Non-Paid">Non-Paid</option><option value="Partially Paid">Partially Paid</option><option value="Paid">Paid</option><option value="Credit">Credit</option><option value="Active">Active</option></select></div>
        <div className="pis-filter-group"><label htmlFor="pis-date-filter"><FontAwesomeIcon icon={faCalendarAlt} /> Date</label><input id="pis-date-filter" type="month" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /></div>
        <button type="button" className="pis-reset-btn" onClick={handleResetFilters}><FontAwesomeIcon icon={faTimes} /> Reset Filters</button>
      </div>

      {/* Active filter notice */}
      {activeFilterId && (
        <div className="pis-active-filter-notice">
          <FontAwesomeIcon icon={faFilter} />
          Showing records for: <strong>{activeSupplierName}</strong>
          <button type="button" onClick={handleClearFilter} className="pis-notice-clear">
            Show All
          </button>
        </div>
      )}

      {/* Supplier + Company lock notice - shown once a selection has
          locked the payment to a single supplier/company pair */}
      {lockedSupplierId && (
        <div className="pis-active-filter-notice">
          <FontAwesomeIcon icon={faFilter} />
          Payment locked to <strong>{selectedInvoicesList[0]?.supplier_name}</strong>
          {selectedInvoicesList[0]?.company_name ? <> / <strong>{selectedInvoicesList[0].company_name}</strong></> : ''}
          . Invoices from other suppliers or other companies are disabled until you clear this selection.
        </div>
      )}

      {/* Unified Table */}
      <div className="pis-table-container">
        <table className="pis-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className="pis-checkbox"
                  checked={
                    selectableInvoices.length > 0 &&
                    selectedInvoiceIds.size === selectableInvoices.length
                  }
                  onChange={toggleAll}
                  title="Select all invoices"
                />
              </th>
              <th>Supplier Name</th>
              <th>Company</th>
              <th>Document Type</th>
              <th>Document Number</th>
              <th>Transaction Date</th>
              <th className="pis-amount">Outstanding Amount</th>
              <th>Status</th>
              <th style={{ width: '120px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr key={`loading-${index}`} className="pis-loading-row">
                  {Array.from({ length: 9 }, (_, cellIndex) => <td key={cellIndex}><i className="pis-skeleton" /></td>)}
                </tr>
              ))
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="9" className="pis-empty">
                  <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#10b981' }} />
                  <p>
                    {activeFilterId || supplierSearch
                      ? 'No outstanding records match the current filter.'
                      : 'No outstanding invoices, payments, or credits found.'}
                  </p>
                </td>
              </tr>
            ) : (
              pagedRecords.map((record) => {
                const isInvoice = record._rowType === 'invoice';
                const isSelected = isInvoice && selectedInvoiceIds.has(record.id);
                const rowKey = `${record._rowType}-${record.id}`;

                const isSupplierLockedOut = isInvoice && !isSelected && lockedSupplierId && String(record.supplier_id) !== lockedSupplierId;
                const isCompanyLockedOut = isInvoice && !isSelected && !isSupplierLockedOut && lockedCompanyId && String(record.company_id || '') !== lockedCompanyId;
                const isDisabledByLock = isSupplierLockedOut || isCompanyLockedOut;

                return (
                  <tr
                    key={rowKey}
                    className={`${isSelected ? 'selected' : ''} ${isDisabledByLock ? 'pis-row-locked-out' : ''} pis-row-${record._rowType}`}
                  >
                    <td style={{ textAlign: 'center' }}>
                      {isInvoice ? (
                        <input
                          type="checkbox"
                          className="pis-checkbox"
                          checked={isSelected}
                          disabled={isSupplierLockedOut}
                          title={
                            isSupplierLockedOut
                              ? 'Belongs to a different supplier than your current selection - clear the selection first to pay this invoice.'
                              : isCompanyLockedOut
                                ? 'Belongs to a different company for this supplier - deselect the current company\'s invoices first to pay this one instead.'
                                : undefined
                          }
                          onChange={() => toggleSelection(record.id, record)}
                        />
                      ) : (
                        <span className="pis-no-check" title="Credits cannot be directly paid" />
                      )}
                    </td>

                    <td>
                      <div className="pis-supplier-name">{record.supplier_name}</div>
                    </td>

                    <td>
                      <div className="pis-company-name">{record.company_name || '—'}</div>
                    </td>

                    <td>
                      <span className={`pis-doc-badge pis-doc-${record._rowType}`}>
                        <FontAwesomeIcon icon={getDocIcon(record.document_type)} />
                        {record.document_type}
                      </span>
                    </td>

                    <td>
                      <div className="pis-invoice-num">{record.document_number}</div>
                    </td>

                    <td>
                      <div className="pis-date">
                        {record.transaction_date
                          ? dayjs(record.transaction_date).format('DD MMM YYYY')
                          : '—'}
                      </div>
                    </td>

                    <td className="pis-amount">
                      <span className={isInvoice ? 'pis-amount-debt' : 'pis-amount-credit'}>
                        {formatCurrency(record.outstanding_amount)}
                      </span>
                    </td>

                    <td>
                      <span className={`pis-status-badge pis-status-${(record.status || 'Active').toLowerCase().replace(/\s+/g, '-')}`}>
                        <FontAwesomeIcon icon={getStatusIcon(record.status)} /> {record.status || 'Active'}
                      </span>
                    </td>

                    <td className="pis-actions">
                      {isInvoice && (() => {
                        const supplierCredit = availableCreditBySupplier[String(record.supplier_id)] || 0;
                        const invoiceBalance = parseFloat(record.outstanding_amount) || 0;
                        const canSettle = invoiceBalance > 0 && supplierCredit > 0;
                        const disabledReason = invoiceBalance <= 0
                          ? 'This invoice has no outstanding balance'
                          : 'No available credit for this supplier';

                        return (
                          <button
                            className="pis-btn-settle"
                            onClick={() => handleSettleClick(record)}
                            disabled={!canSettle}
                            title={canSettle ? 'Settle with available credit' : disabledReason}
                            type="button"
                          >
                            <FontAwesomeIcon icon={faBalanceScale} /> Settle
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedInvoiceIds.size > 0 && <div className="pis-selection-summary">
        <span><strong>{selectedInvoiceIds.size} invoices selected</strong><small>Selected Total: {formatCurrency(selectedTotal)}</small></span>
        <button
          className="pis-btn-pay"
          onClick={handlePaySelected}
          disabled={selectedInvoiceIds.size === 0}
          type="button"
        >
          <FontAwesomeIcon icon={faCheckCircle} /> Pay Selected
        </button>
      </div>}

      <div className="pis-pagination">
        <span>Showing {pageStart}–{pageEnd} of {filteredRecords.length} invoices</span>
        <div className="pis-page-controls"><button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><FontAwesomeIcon icon={faChevronLeft} /> Previous</button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map(page => <button type="button" key={page} className={page === currentPage ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>)}<button type="button" onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}>Next <FontAwesomeIcon icon={faChevronRight} /></button></div>
      </div>

      {/* Available Credits Sub-section */}
      <div className="pis-credit-section">
        <div className="pis-credit-header">
          <h4>
            <FontAwesomeIcon icon={faWallet} /> Available Supplier Credits
          </h4>
          <span>{formatCurrency(summaryStats.totalAvailableCredit)} outstanding / unused credit</span>
        </div>
        <div className="pis-credit-legend">
          <span className="pis-credit-badge advance">
            <FontAwesomeIcon icon={faMoneyBillWave} /> Advance Payment
          </span>
          <span className="pis-credit-badge return">
            <FontAwesomeIcon icon={faReceipt} /> Purchase Return Credit
          </span>
          <span className="pis-credit-badge invoice-legend">
            <FontAwesomeIcon icon={faFileInvoice} /> Outstanding Invoice
          </span>
          <button type="button" className="pis-credit-view" onClick={() => setStatusFilter('Credit')}>View Credits</button>
        </div>
      </div>
    </div>
  );
};

export default PendingInvoicesSection;