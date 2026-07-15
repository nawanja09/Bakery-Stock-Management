// src/components/purchase/PendingInvoicesSection.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileInvoiceDollar,
  faCheckCircle,
  faPaperPlane,
  faBalanceScale,
  faSpinner,
  faSearch,
  faReceipt,
  faWallet,
  faExclamationTriangle,
  faFileInvoice,
  faMoneyBillWave,
  faFilter,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './PendingInvoicesSection.css';

import InvoicePaymentModal from './InvoicePaymentModal';
import PayNowModal from './PayNowModal';
import SettleNowModal from './SettleNowModal';

const PendingInvoicesSection = ({ supplierId, supplierName, suppliers = [], refreshKey = 0 }) => {
  const { showPopup } = usePopup();

  const [allInvoices, setAllInvoices] = useState([]);
  const [allAdvances, setAllAdvances] = useState([]);
  const [allReturnCredits, setAllReturnCredits] = useState([]);
  const [loading, setLoading] = useState(false);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [activeFilterId, setActiveFilterId] = useState(supplierId || '');

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

  // Apply filters
  const filteredRecords = useMemo(() => {
    const term = supplierSearch.toLowerCase().trim();
    return allRecords.filter((r) => {
      const matchesText = !term || r.supplier_name?.toLowerCase().includes(term);
      const matchesId = !activeFilterId || String(r.supplier_id) === String(activeFilterId);
      return matchesText && matchesId;
    });
  }, [allRecords, supplierSearch, activeFilterId]);

  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.toLowerCase().trim();
    return !term
      ? suppliers
      : suppliers.filter((s) => s.name?.toLowerCase().includes(term));
  }, [suppliers, supplierSearch]);

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
  const selectableInvoices = filteredRecords.filter((r) => r._rowType === 'invoice');

  const toggleSelection = (id) => {
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

  // Cross-supplier validation
  const validateSameSupplier = (records, actionName) => {
    const ids = [...new Set(records.map((r) => r.supplier_id))];
    if (ids.length > 1) {
      showPopup(
        'error',
        `Cannot ${actionName}: selected records belong to different suppliers. ` +
          'Please select records from the same supplier only.'
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
    if (!activeFilterId) {
      showPopup(
        'warning',
        'Please filter by a specific supplier before recording an outstanding payment.'
      );
      return;
    }
    setShowPayNowModal(true);
  };

  const handleSettleClick = (invoice) => {
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
    const numeric = parseFloat(amount) || 0;
    return `Rs. ${numeric.toFixed(2)}`;
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

  const selectedInvoicesList = allInvoices.filter((i) => selectedInvoiceIds.has(i.id));
  const selectedTotal = useMemo(() =>
    selectedInvoicesList.reduce((sum, invoice) => sum + parseFloat(invoice.balance_amount || 0), 0),
    [selectedInvoicesList]
  );
  const activeSupplierForModal = selectedInvoicesList[0]
    ? suppliers.find((s) => String(s.id) === String(selectedInvoicesList[0].supplier_id))?.name ||
      activeSupplierName
    : activeSupplierName;

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
        supplierId={activeFilterId}
        supplierName={activeSupplierName}
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

      {/* Section Header */}
      <div className="pis-header">
        <h3>
          <FontAwesomeIcon icon={faFileInvoiceDollar} />
          Pending Invoices / Payments
        </h3>
        <div className="pis-header-actions">
          <button
            className="pis-btn-pay-now"
            onClick={handlePayNow}
            type="button"
            title={!activeFilterId ? 'Filter by a supplier first' : 'Record outstanding payment'}
          >
            <FontAwesomeIcon icon={faPaperPlane} /> Pay Now (Advance Payment)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="pis-summary-grid">
        <div className="pis-summary-item debt">
          <span>Outstanding Invoices</span>
          <strong>{formatCurrency(summaryStats.totalOutstandingInvoices)}</strong>
        </div>
        <div className="pis-summary-item credit">
          <span>Available Credits</span>
          <strong>{formatCurrency(summaryStats.totalAvailableCredit)}</strong>
        </div>
        <div className="pis-summary-item">
          <span>Pending Invoices</span>
          <strong>{summaryStats.invoiceCount}</strong>
        </div>
        <div className="pis-summary-item">
          <span>Credit Documents</span>
          <strong>{summaryStats.creditCount}</strong>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pis-filter-bar">
        <div className="pis-filter-group">
          <label htmlFor="pis-supplier-search">
            <FontAwesomeIcon icon={faFilter} /> Supplier Search / Filter
          </label>
          <div className="pis-filter-input-wrap">
            <FontAwesomeIcon icon={faSearch} />
            <input
              id="pis-supplier-search"
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Type to search suppliers…"
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

        <div className="pis-filter-group">
          <label htmlFor="pis-supplier-select">Display Records For</label>
          <div className="pis-filter-select-wrap">
            <select
              id="pis-supplier-select"
              value={activeFilterId}
              onChange={(e) => {
                setActiveFilterId(e.target.value);
                setSelectedInvoiceIds(new Set());
              }}
            >
              <option value="">— All Suppliers —</option>
              {filteredSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {activeFilterId && (
              <button
                type="button"
                className="pis-clear-filter-btn"
                onClick={handleClearFilter}
                title="Clear filter"
              >
                <FontAwesomeIcon icon={faTimes} /> Clear
              </button>
            )}
          </div>
        </div>
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

      {/* Cross-supplier warning */}
      {selectedInvoiceIds.size > 0 &&
        new Set(selectedInvoicesList.map((i) => i.supplier_id)).size > 1 && (
          <div className="pis-cross-supplier-warning">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>
              Selected invoices belong to <strong>different suppliers</strong>. Please select
              invoices from the same supplier only before paying.
            </span>
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
              <tr>
                <td colSpan="8" className="pis-empty">
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <p>Loading outstanding records…</p>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="8" className="pis-empty">
                  <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#10b981' }} />
                  <p>
                    {activeFilterId || supplierSearch
                      ? 'No outstanding records match the current filter.'
                      : 'No outstanding invoices, payments, or credits found.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isInvoice = record._rowType === 'invoice';
                const isSelected = isInvoice && selectedInvoiceIds.has(record.id);
                const rowKey = `${record._rowType}-${record.id}`;

                return (
                  <tr
                    key={rowKey}
                    className={`${isSelected ? 'selected' : ''} pis-row-${record._rowType}`}
                  >
                    <td style={{ textAlign: 'center' }}>
                      {isInvoice ? (
                        <input
                          type="checkbox"
                          className="pis-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(record.id)}
                        />
                      ) : (
                        <span className="pis-no-check" title="Credits cannot be directly paid" />
                      )}
                    </td>

                    <td>
                      <div className="pis-supplier-name">{record.supplier_name}</div>
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
                      <span className={`pis-status-badge pis-status-${(record.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {record.status || 'Active'}
                      </span>
                    </td>

                    <td className="pis-actions">
                      {isInvoice && (
                        <button
                          className="pis-btn-settle"
                          onClick={() => handleSettleClick(record)}
                          title="Settle with available credit"
                          type="button"
                        >
                          <FontAwesomeIcon icon={faBalanceScale} /> Settle Now
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pis-selection-summary">
        <span>Selected Total: {formatCurrency(selectedTotal)}</span>
        <button
          className="pis-btn-pay"
          onClick={handlePaySelected}
          disabled={selectedInvoiceIds.size === 0}
          type="button"
        >
          <FontAwesomeIcon icon={faCheckCircle} /> Pay Selected
        </button>
      </div>

      {/* Available Credits Sub-section */}
      <div className="pis-credit-section">
        <div className="pis-credit-header">
          <h4>
            <FontAwesomeIcon icon={faWallet} /> Available Supplier Credits
          </h4>
          <span>Outstanding payments and unsettled return credits (shown in table above)</span>
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
        </div>
      </div>
    </div>
  );
};

export default PendingInvoicesSection;