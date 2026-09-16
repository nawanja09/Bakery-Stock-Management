// client/src/components/Finance/ExpensesChequeRegistry.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMoneyCheck,
  faSpinner,
  faPlay,
  faRotateRight,
  faFileCsv,
  faEdit,
  faCheck,
  faTimes,
  faExclamationCircle,
  faCheckCircle,
  faBan,
  faClock,
  faCalendarCheck
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './ExpensesChequeRegistry.css';

const fmt = (v) =>
  parseFloat(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const SOURCE_LABELS = {
  BANK_TO_CASH: { label: 'Bank → Cash', badgeClass: 'ecr-badge-b2c' },
  PURCHASING_PAYMENT: { label: 'RM Purchasing', badgeClass: 'ecr-badge-purchase' },
  EXPENSE_PAYMENT: { label: 'New Expenses', badgeClass: 'ecr-badge-expense' }
};

const ExpensesChequeRegistry = () => {
  // ── Filters state ──────────────────────────────────────────────────────────
  const [filterInputs, setFilterInputs] = useState({
    dateFrom: '',
    dateTo: '',
    name: '',
    status: ''
  });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: '',
    dateTo: '',
    name: '',
    status: ''
  });

  // ── Data & Loading ─────────────────────────────────────────────────────────
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // ── Inline Edit State ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [savingId, setSavingId] = useState(null);

  // ── Release Modal State ────────────────────────────────────────────────────
  const [releasingRow, setReleasingRow] = useState(null);
  const [releaseModalDate, setReleaseModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [isReleasing, setIsReleasing] = useState(false);

  // ── Fetch Registry Data ────────────────────────────────────────────────────
  const fetchRegistry = useCallback(async (filtersToUse = appliedFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filtersToUse.dateFrom) params.dateFrom = filtersToUse.dateFrom;
      if (filtersToUse.dateTo) params.dateTo = filtersToUse.dateTo;
      if (filtersToUse.name && filtersToUse.name.trim()) params.name = filtersToUse.name.trim();
      if (filtersToUse.status && filtersToUse.status.trim()) params.status = filtersToUse.status.trim();

      const res = await api.get('/finance/cheque-registry', { params });
      setRecords(res.data || []);
    } catch (err) {
      console.error('Error loading cheque registry:', err);
      setError(err.response?.data?.error || 'Failed to load Expenses Cheque Registry.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchRegistry(appliedFilters);
  }, [appliedFilters, fetchRegistry]);

  // ── Filter Handlers ────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilterInputs((prev) => ({ ...prev, [name]: value }));
  };

  const handleRun = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({ ...filterInputs });
  };

  const handleReset = () => {
    const emptyFilters = { dateFrom: '', dateTo: '', name: '', status: '' };
    setFilterInputs(emptyFilters);
    setAppliedFilters(emptyFilters);
  };

  // ── Toast notification helper ──────────────────────────────────────────────
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // ── Quick Release Modal Handlers ───────────────────────────────────────────
  const openReleaseModal = (row) => {
    setReleasingRow(row);
    setReleaseModalDate(row.release_date || new Date().toISOString().slice(0, 10));
  };

  const closeReleaseModal = () => {
    setReleasingRow(null);
    setIsReleasing(false);
  };

  const handleConfirmRelease = async () => {
    if (!releasingRow) return;
    if (!releaseModalDate) {
      showToast('Please select a valid release date.', 'error');
      return;
    }

    setIsReleasing(true);
    try {
      await api.patch(`/finance/cheque-registry/${releasingRow.id}`, {
        status: 'Released',
        release_date: releaseModalDate
      });

      showToast(
        `Cheque #${releasingRow.cheque_number} released on ${releaseModalDate}. Ledger deduction posted!`,
        'success'
      );
      closeReleaseModal();
      await fetchRegistry(appliedFilters);
    } catch (err) {
      console.error('Error releasing cheque:', err);
      showToast(err.response?.data?.error || 'Failed to release cheque', 'error');
    } finally {
      setIsReleasing(false);
    }
  };

  // ── Inline Edit Handlers ───────────────────────────────────────────────────
  const startEditing = (row) => {
    setEditingId(row.id);
    setEditFormData({
      cheque_date: row.cheque_date || '',
      deposit_date: row.deposit_date || '',
      slip_number: row.slip_number || '',
      release_date: row.release_date || '',
      status: row.status || (row.returned ? 'Returned' : 'Pending'),
      returned: !!row.returned
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      if (name === 'status' && value === 'Released' && !prev.release_date) {
        next.release_date = new Date().toISOString().slice(0, 10);
      }
      if (name === 'returned' && checked) {
        next.status = 'Returned';
      } else if (name === 'returned' && !checked && prev.status === 'Returned') {
        next.status = prev.release_date ? 'Released' : 'Pending';
      }
      return next;
    });
  };

  const handleSaveRow = async (id) => {
    setSavingId(id);
    try {
      await api.patch(`/finance/cheque-registry/${id}`, {
        cheque_date: editFormData.cheque_date || null,
        deposit_date: editFormData.deposit_date || null,
        slip_number: editFormData.slip_number ? editFormData.slip_number.trim() : null,
        release_date: editFormData.release_date || null,
        status: editFormData.status || 'Pending',
        returned: !!editFormData.returned
      });

      showToast('Cheque details updated successfully! Ledger balance synchronized.', 'success');
      setEditingId(null);
      setEditFormData({});
      await fetchRegistry(appliedFilters);
    } catch (err) {
      console.error('Error updating cheque record:', err);
      showToast(err.response?.data?.error || 'Failed to update record', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // ── Export CSV Handler ─────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (records.length === 0) {
      showToast('No records available to export', 'error');
      return;
    }

    const headers = [
      'Date',
      'Name',
      'Source',
      'Cheque Number',
      'Amount',
      'Cheque Date',
      'Deposit Date',
      'Slip Number',
      'Bank',
      'Release Date',
      'Status',
      'Returned'
    ];

    const csvRows = [
      headers.join(','),
      ...records.map((r) => {
        const sourceName = SOURCE_LABELS[r.source_type]?.label || r.source_type || '';
        const escapeCSV = (val) => {
          if (val === null || val === undefined) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        };
        const statusLabel = r.returned ? 'Returned' : (r.status === 'Released' ? 'Released' : 'Pending');
        return [
          escapeCSV(r.date),
          escapeCSV(r.name),
          escapeCSV(sourceName),
          escapeCSV(r.cheque_number),
          parseFloat(r.amount || 0).toFixed(2),
          escapeCSV(r.cheque_date || ''),
          escapeCSV(r.deposit_date || ''),
          escapeCSV(r.slip_number || ''),
          escapeCSV(r.bank || ''),
          escapeCSV(r.release_date || ''),
          escapeCSV(statusLabel),
          escapeCSV(r.returned ? 'Yes' : 'No')
        ].join(',');
      })
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Expenses_Cheque_Registry_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported CSV successfully!', 'success');
  };

  // ── Summary Metrics ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalAmount = 0;
    let pendingAmount = 0;
    let releasedAmount = 0;
    let returnedAmount = 0;
    let pendingCount = 0;
    let releasedCount = 0;
    let returnedCount = 0;

    records.forEach((r) => {
      const amt = parseFloat(r.amount || 0);
      totalAmount += amt;
      if (r.returned || r.status === 'Returned') {
        returnedCount++;
        returnedAmount += amt;
      } else if (r.status === 'Released') {
        releasedCount++;
        releasedAmount += amt;
      } else {
        pendingCount++;
        pendingAmount += amt;
      }
    });

    return {
      totalCount: records.length,
      totalAmount,
      pendingCount,
      pendingAmount,
      releasedCount,
      releasedAmount,
      returnedCount,
      returnedAmount
    };
  }, [records]);

  return (
    <div className="page-container ecr-page">
      {/* ════════════ Page Header ════════════ */}
      <header className="page-header ecr-header">
        <div className="ecr-header-left">
          <div className="ecr-header-icon">
            <FontAwesomeIcon icon={faMoneyCheck} />
          </div>
          <div>
            <h2 className="ecr-title">Expenses Cheque Registry</h2>
            <p className="ecr-subtitle">
              Centralized registry for Cash/Bank Transfers, RM Purchasing, and New Expenses cheques
            </p>
          </div>
        </div>

        <div className="ecr-header-actions">
          <button
            type="button"
            className="ecr-btn-export"
            onClick={handleExportCSV}
            title="Export to CSV"
          >
            <FontAwesomeIcon icon={faFileCsv} /> Export CSV
          </button>
        </div>
      </header>

      {/* ════════════ Toast Notification ════════════ */}
      {toast && (
        <div className={`ecr-toast ecr-toast-${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === 'success' ? faCheckCircle : faExclamationCircle} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* ════════════ Metrics Summary Cards ════════════ */}
      <div className="ecr-metrics-grid">
        <div className="card ecr-metric-card">
          <span className="ecr-metric-label">Total Cheques</span>
          <strong className="ecr-metric-value">{metrics.totalCount}</strong>
          <span className="ecr-metric-sub">Rs. {fmt(metrics.totalAmount)}</span>
        </div>

        <div className="card ecr-metric-card ecr-metric-pending">
          <span className="ecr-metric-label">Pending / Unreleased</span>
          <strong className="ecr-metric-value text-warning">{metrics.pendingCount}</strong>
          <span className="ecr-metric-sub">Rs. {fmt(metrics.pendingAmount)} (Not in Ledger)</span>
        </div>

        <div className="card ecr-metric-card ecr-metric-released">
          <span className="ecr-metric-label">Released Cheques</span>
          <strong className="ecr-metric-value text-success">{metrics.releasedCount}</strong>
          <span className="ecr-metric-sub">Rs. {fmt(metrics.releasedAmount)} (Deducted)</span>
        </div>

        <div className="card ecr-metric-card">
          <span className="ecr-metric-label">Returned Cheques</span>
          <strong className="ecr-metric-value text-danger">{metrics.returnedCount}</strong>
          <span className="ecr-metric-sub">Rs. {fmt(metrics.returnedAmount)}</span>
        </div>
      </div>

      {/* ════════════ Filter Bar ════════════ */}
      <div className="card ecr-filter-card">
        <form onSubmit={handleRun} className="ecr-filter-form">
          <div className="ecr-filter-group">
            <label className="ecr-filter-lbl">From Date</label>
            <input
              type="date"
              name="dateFrom"
              value={filterInputs.dateFrom}
              onChange={handleInputChange}
              className="ecr-filter-input"
            />
          </div>

          <div className="ecr-filter-group">
            <label className="ecr-filter-lbl">To Date</label>
            <input
              type="date"
              name="dateTo"
              value={filterInputs.dateTo}
              onChange={handleInputChange}
              className="ecr-filter-input"
            />
          </div>

          <div className="ecr-filter-group">
            <label className="ecr-filter-lbl">Status</label>
            <select
              name="status"
              value={filterInputs.status}
              onChange={handleInputChange}
              className="ecr-filter-input"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending / Unreleased</option>
              <option value="Released">Released</option>
              <option value="Returned">Returned</option>
            </select>
          </div>

          <div className="ecr-filter-group ecr-filter-name-group">
            <label className="ecr-filter-lbl">Name / Payee / Supplier</label>
            <input
              type="text"
              name="name"
              value={filterInputs.name}
              onChange={handleInputChange}
              placeholder="Search by supplier or payee name…"
              className="ecr-filter-input"
            />
          </div>

          <div className="ecr-filter-actions">
            <button
              type="submit"
              className="btn btn-primary ecr-btn-run"
              title="Apply filters"
              disabled={loading}
            >
              <FontAwesomeIcon icon={loading ? faSpinner : faPlay} spin={loading} />
              <span>Run</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary ecr-btn-reset"
              onClick={handleReset}
              title="Reset filters"
              disabled={loading}
            >
              <FontAwesomeIcon icon={faRotateRight} />
              <span>Reset</span>
            </button>
          </div>
        </form>
      </div>

      {/* ════════════ Main Unified Table ════════════ */}
      <div className="card ecr-table-card">
        {error && (
          <div className="ecr-error-banner">
            <FontAwesomeIcon icon={faExclamationCircle} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="ecr-loading-state">
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p>Loading Expenses Cheque Registry…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="ecr-empty-state">
            <FontAwesomeIcon icon={faMoneyCheck} size="3x" />
            <h3>No Cheque Records Found</h3>
            <p>
              Expense cheques recorded through Cash/Bank Transfers (Bank to Cash), RM Purchasing payments, or New Expenses
              will automatically appear here with status Pending / Unreleased.
            </p>
          </div>
        ) : (
          <div className="ecr-table-wrapper">
            <table className="report-table ecr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name (Supplier / Payee)</th>
                  <th>Cheque Number</th>
                  <th className="ecr-num-col">Amount</th>
                  <th>Cheque Date</th>
                  <th>Deposit Date</th>
                  <th>Slip Number</th>
                  <th>Bank</th>
                  <th>Release Date</th>
                  <th className="ecr-center-col">Status</th>
                  <th className="ecr-center-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => {
                  const isEditing = editingId === row.id;
                  const isSaving = savingId === row.id;
                  const sourceConfig = SOURCE_LABELS[row.source_type] || {
                    label: row.source_type,
                    badgeClass: 'ecr-badge-default'
                  };

                  const isPending = !row.returned && row.status !== 'Released' && row.status !== 'Returned';
                  const isReleased = !row.returned && row.status === 'Released';
                  const isReturned = !!row.returned || row.status === 'Returned';

                  return (
                    <tr
                      key={row.id}
                      className={`${isReturned ? 'ecr-row-returned' : ''} ${isEditing ? 'ecr-row-editing' : ''}`}
                    >
                      {/* Date */}
                      <td className="ecr-nowrap font-mono">{row.date}</td>

                      {/* Name (Supplier / Payee / Source) */}
                      <td>
                        <div className="ecr-name-cell">
                          <span className="ecr-name-text">{row.name || '—'}</span>
                          <span className={`ecr-source-badge ${sourceConfig.badgeClass}`}>
                            {sourceConfig.label}
                          </span>
                        </div>
                      </td>

                      {/* Cheque Number */}
                      <td className="font-mono ecr-cheque-num">
                        <strong>{row.cheque_number}</strong>
                      </td>

                      {/* Amount */}
                      <td className="ecr-num-col ecr-amount-cell">
                        <strong>Rs. {fmt(row.amount)}</strong>
                      </td>

                      {/* Cheque Date */}
                      <td className="ecr-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            name="cheque_date"
                            value={editFormData.cheque_date || ''}
                            onChange={handleEditChange}
                            className="ecr-inline-input"
                          />
                        ) : (
                          row.cheque_date || '—'
                        )}
                      </td>

                      {/* Deposit Date */}
                      <td className="ecr-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            name="deposit_date"
                            value={editFormData.deposit_date || ''}
                            onChange={handleEditChange}
                            className="ecr-inline-input"
                          />
                        ) : (
                          row.deposit_date || '—'
                        )}
                      </td>

                      {/* Slip Number */}
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            name="slip_number"
                            value={editFormData.slip_number || ''}
                            onChange={handleEditChange}
                            placeholder="Slip #"
                            className="ecr-inline-input"
                          />
                        ) : (
                          row.slip_number || '—'
                        )}
                      </td>

                      {/* Bank */}
                      <td>{row.bank || '—'}</td>

                      {/* Release Date */}
                      <td className="ecr-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            name="release_date"
                            value={editFormData.release_date || ''}
                            onChange={handleEditChange}
                            className="ecr-inline-input"
                          />
                        ) : (
                          row.release_date || '—'
                        )}
                      </td>

                      {/* Status */}
                      <td className="ecr-center-col">
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select
                              name="status"
                              value={editFormData.status || 'Pending'}
                              onChange={handleEditChange}
                              className="ecr-inline-input"
                            >
                              <option value="Pending">Pending / Unreleased</option>
                              <option value="Released">Released</option>
                              <option value="Returned">Returned</option>
                            </select>
                            <label className="ecr-checkbox-wrapper" style={{ marginTop: '2px' }}>
                              <input
                                type="checkbox"
                                name="returned"
                                checked={!!editFormData.returned}
                                onChange={handleEditChange}
                              />
                              <span style={{ fontSize: '11px' }}>Returned</span>
                            </label>
                          </div>
                        ) : isReturned ? (
                          <span className="ecr-status-badge ecr-status-returned">
                            <FontAwesomeIcon icon={faBan} /> Returned
                          </span>
                        ) : isReleased ? (
                          <span className="ecr-status-badge ecr-status-released">
                            <FontAwesomeIcon icon={faCheckCircle} /> Released
                          </span>
                        ) : (
                          <span className="ecr-status-badge ecr-status-pending">
                            <FontAwesomeIcon icon={faClock} /> Pending / Unreleased
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="ecr-center-col ecr-actions-cell">
                        {isEditing ? (
                          <div className="ecr-inline-actions">
                            <button
                              type="button"
                              className="ecr-btn-save"
                              onClick={() => handleSaveRow(row.id)}
                              disabled={isSaving}
                              title="Save changes"
                            >
                              <FontAwesomeIcon icon={isSaving ? faSpinner : faCheck} spin={isSaving} />
                            </button>
                            <button
                              type="button"
                              className="ecr-btn-cancel"
                              onClick={cancelEditing}
                              disabled={isSaving}
                              title="Cancel"
                            >
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          </div>
                        ) : (
                          <div className="ecr-inline-actions">
                            {isPending && (
                              <button
                                type="button"
                                className="ecr-btn-release"
                                onClick={() => openReleaseModal(row)}
                                title="Release Cheque (deducts from ledger on release date)"
                              >
                                <FontAwesomeIcon icon={faCalendarCheck} /> Release
                              </button>
                            )}
                            <button
                              type="button"
                              className="ecr-btn-edit"
                              onClick={() => startEditing(row)}
                              title="Edit row details"
                            >
                              <FontAwesomeIcon icon={faEdit} /> Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════ Quick Release Modal ════════════ */}
      {releasingRow && (
        <div className="ecr-release-modal-overlay" onClick={closeReleaseModal}>
          <div className="ecr-release-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ecr-release-modal-header">
              <h3>
                <FontAwesomeIcon icon={faCalendarCheck} style={{ color: '#059669', marginRight: '8px' }} />
                Release Cheque
              </h3>
              <button type="button" className="ecr-release-modal-close" onClick={closeReleaseModal}>×</button>
            </div>
            <div className="ecr-release-modal-body">
              <div className="ecr-release-summary-card">
                <div className="ecr-release-row">
                  <span className="ecr-release-lbl">Cheque Number:</span>
                  <strong>{releasingRow.cheque_number}</strong>
                </div>
                <div className="ecr-release-row">
                  <span className="ecr-release-lbl">Payee / Name:</span>
                  <span>{releasingRow.name || '—'}</span>
                </div>
                <div className="ecr-release-row">
                  <span className="ecr-release-lbl">Amount:</span>
                  <strong className="text-danger">Rs. {fmt(releasingRow.amount)}</strong>
                </div>
                <div className="ecr-release-row">
                  <span className="ecr-release-lbl">Bank:</span>
                  <span>{releasingRow.bank || 'Company Cash/Bank'}</span>
                </div>
              </div>

              <div className="ecr-release-form-group">
                <label className="ecr-release-form-lbl">
                  Cheque Released Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={releaseModalDate}
                  onChange={(e) => setReleaseModalDate(e.target.value)}
                  className="ecr-release-input"
                  required
                />
                <span className="ecr-release-hint">
                  The cheque amount will be deducted from the relevant Cash/Bank Ledger on this Released Date.
                </span>
              </div>
            </div>
            <div className="ecr-release-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeReleaseModal}
                disabled={isReleasing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary ecr-btn-confirm-release"
                onClick={handleConfirmRelease}
                disabled={isReleasing}
              >
                {isReleasing ? (
                  <><FontAwesomeIcon icon={faSpinner} spin /> Releasing…</>
                ) : (
                  <><FontAwesomeIcon icon={faCheck} /> Confirm Release</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesChequeRegistry;
