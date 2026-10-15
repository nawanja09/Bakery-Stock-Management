// client/src/components/adjustments/InhandAdjustments.jsx
//
// Main list page for Inhand Adjustments (Cash In / Cheque In).
// Accessed via /adjustments/inhand

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faSearch, faFilter, faSync, faEye, faEdit, faCheckCircle,
  faPaperPlane, faBan, faMoneyBillWave, faUniversity, faClock,
  faExclamationCircle, faInfoCircle, faSpinner, faHistory
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import InhandEntryForm from './InhandEntryForm';
import InhandAuditLog  from './InhandAuditLog';
import { Modal } from '../common/ui';
import './Adjustments.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  Draft     : { label: 'Draft',    className: 'draft',    icon: faClock },
  Pending   : { label: 'Pending',  className: 'pending',  icon: faClock },
  Approved  : { label: 'Approved', className: 'approved', icon: faCheckCircle },
  Cancelled : { label: 'Cancelled',className: 'cancelled',icon: faBan },
};

const PAGE_SIZE = 20;

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.Draft;
  return (
    <span className={`status-badge ${m.className}`}>
      <FontAwesomeIcon icon={m.icon} /> {m.label}
    </span>
  );
};

// ── Confirm Modal ─────────────────────────────────────────────────────────────
const ConfirmModal = ({ isOpen, title, message, onConfirm, onClose, type = 'danger' }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className={`modal-icon ${type}`}>
          <FontAwesomeIcon icon={type === 'danger' ? faExclamationCircle : faInfoCircle} />
        </div>
        <h3 className="modal-title">{title}</h3>
        <p  className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className={`btn btn-${type}`} onClick={onConfirm}>Confirm</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ── Detail Drawer ─────────────────────────────────────────────────────────────
const DetailDrawer = ({ entry, onClose, onAction }) => {
  const [auditOpen, setAuditOpen] = useState(false);

  if (!entry) return null;
  const isCash   = entry.payment_type === 'Cash In';
  const canEdit  = ['Draft','Pending'].includes(entry.status);
  const canSubmit= entry.status === 'Draft';
  const canApprove = entry.status === 'Pending';
  const canCancel  = ['Draft','Pending','Approved'].includes(entry.status);

  return (
    // Read-only details: the side panel may close on a backdrop click.
    <Modal
      size="drawer"
      title={entry.reference_no}
      subtitle={<StatusBadge status={entry.status} />}
      icon={<FontAwesomeIcon icon={isCash ? faMoneyBillWave : faUniversity} />}
      onClose={onClose}
      closeOnOverlay
      className="ih-details-modal"
    >
        <div className="ih-drawer-body">
          {/* Core Details */}
          <div className="ih-detail-grid">
            <div className="ih-detail-item"><span>Date</span><strong>{entry.transaction_date}</strong></div>
            <div className="ih-detail-item"><span>Payment Type</span>
              <strong className={`ih-type-tag ${isCash ? 'cash' : 'cheque'}`}>
                <FontAwesomeIcon icon={isCash ? faMoneyBillWave : faUniversity} />
                {entry.payment_type}
              </strong>
            </div>
            <div className="ih-detail-item"><span>Amount</span>
              <strong className="ih-amount">Rs. {parseFloat(entry.amount).toFixed(2)}</strong>
            </div>
            <div className="ih-detail-item"><span>Party Name</span><strong>{entry.party_name || '—'}</strong></div>

            {isCash ? (
              <div className="ih-detail-item"><span>Company</span><strong>{entry.company_name || '—'}</strong></div>
            ) : (
              <>
                <div className="ih-detail-item"><span>Bank Account</span>
                  <strong>{entry.bank_account_name} {entry.bank_account_number ? `— ${entry.bank_account_number}` : ''}</strong>
                </div>
                <div className="ih-detail-item"><span>Cheque No.</span><strong>{entry.cheque_number || '—'}</strong></div>
                <div className="ih-detail-item"><span>Cheque Bank</span><strong>{entry.cheque_bank_name || '—'}</strong></div>
                <div className="ih-detail-item"><span>Cheque Date</span><strong>{entry.cheque_date || '—'}</strong></div>
              </>
            )}

            <div className="ih-detail-item full-width"><span>Remark</span><strong>{entry.remark || '—'}</strong></div>

            {entry.finance_txn_id && (
              <div className="ih-detail-item"><span>Finance Txn ID</span><strong>#{entry.finance_txn_id}</strong></div>
            )}
            {entry.posted_at && (
              <div className="ih-detail-item"><span>Posted At</span><strong>{entry.posted_at}</strong></div>
            )}
            <div className="ih-detail-item"><span>Created By</span><strong>{entry.created_by_name}</strong></div>
            <div className="ih-detail-item"><span>Created At</span><strong>{entry.created_at}</strong></div>
            {entry.approved_by_name && (
              <div className="ih-detail-item"><span>Approved By</span><strong>{entry.approved_by_name} — {entry.approved_at}</strong></div>
            )}
            {entry.cancelled_by_name && (
              <div className="ih-detail-item"><span>Cancelled By</span><strong>{entry.cancelled_by_name} — {entry.cancelled_at}</strong></div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="ih-drawer-actions">
            {canEdit   && <button className="btn btn-outline" onClick={() => onAction('edit', entry)}><FontAwesomeIcon icon={faEdit} /> Edit</button>}
            {canSubmit && <button className="btn btn-info"    onClick={() => onAction('submit', entry)}><FontAwesomeIcon icon={faPaperPlane} /> Submit</button>}
            {canApprove&& <button className="btn btn-success" onClick={() => onAction('approve', entry)}><FontAwesomeIcon icon={faCheckCircle} /> Approve</button>}
            {canCancel && <button className="btn btn-danger"  onClick={() => onAction('cancel', entry)}><FontAwesomeIcon icon={faBan} /> Cancel</button>}
          </div>

          {/* Audit Log Toggle */}
          <button className="ih-audit-toggle" onClick={() => setAuditOpen(o => !o)}>
            <FontAwesomeIcon icon={faHistory} />
            {auditOpen ? 'Hide' : 'Show'} Audit Log
          </button>
          {auditOpen && <InhandAuditLog inhandId={entry.id} />}
        </div>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const InhandAdjustments = () => {
  const [entries,     setEntries]     = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [filters,     setFilters]     = useState({
    startDate: '', endDate: '', payment_type: 'all', status: 'all', search: ''
  });
  const [showForm,    setShowForm]    = useState(false);
  const [editEntry,   setEditEntry]   = useState(null);
  const [viewEntry,   setViewEntry]   = useState(null);
  const [toastMsg,    setToastMsg]    = useState(null);
  const [confirm,     setConfirm]     = useState({ open: false });
  const [actionBusy,  setActionBusy]  = useState(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = {
        page: pg, limit: PAGE_SIZE,
        ...(filters.startDate   && { startDate   : filters.startDate }),
        ...(filters.endDate     && { endDate     : filters.endDate }),
        ...(filters.payment_type !== 'all' && { payment_type : filters.payment_type }),
        ...(filters.status      !== 'all' && { status       : filters.status }),
        ...(filters.search.trim() && { search : filters.search.trim() }),
      };
      const res = await api.get('/inhand', { params });
      setEntries(res.data.data  || []);
      setTotal(res.data.total   || 0);
    } catch {
      showToast('Failed to load Inhand entries.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchEntries(page); }, [page, filters]); // eslint-disable-line

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (text, type = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // ── Workflow action handler ────────────────────────────────────────────────
  const handleAction = (action, entry) => {
    if (action === 'edit') {
      setEditEntry(entry);
      setViewEntry(null);
      setShowForm(true);
      return;
    }

    const messages = {
      submit  : { title: 'Submit for Approval', msg: `Submit ${entry.reference_no} for approval?`, type: 'info' },
      approve : { title: 'Approve & Post',       msg: `Approve ${entry.reference_no} and post to Finance ledger?`, type: 'success' },
      cancel  : { title: 'Cancel Entry',         msg: `Cancel ${entry.reference_no}? ${entry.status === 'Approved' ? 'This will create a reversal in the Finance ledger.' : ''}`, type: 'danger' },
    };
    const m = messages[action];
    setConfirm({
      open   : true,
      title  : m.title,
      message: m.msg,
      type   : m.type,
      onConfirm : () => executeAction(action, entry)
    });
  };

  const executeAction = async (action, entry) => {
    setConfirm({ open: false });
    setActionBusy(entry.id);
    try {
      await api.patch(`/inhand/${entry.id}/${action}`);
      showToast(`Entry ${action}d successfully.`);
      setViewEntry(null);
      await fetchEntries(page);
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to ${action} entry.`, 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="page-container">
      {/* Toast */}
      {toastMsg && (
        <div className={`ih-toast ih-toast-${toastMsg.type}`}>
          <FontAwesomeIcon icon={toastMsg.type === 'success' ? faCheckCircle : faExclamationCircle} />
          {toastMsg.text}
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirm.open}
        title={confirm.title}
        message={confirm.message}
        type={confirm.type}
        onConfirm={confirm.onConfirm}
        onClose={() => setConfirm({ open: false })}
      />

      {/* Entry Form Modal */}
      {showForm && (
        <InhandEntryForm
          existingEntry={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
          onSaved={() => { setShowForm(false); setEditEntry(null); fetchEntries(1); setPage(1); }}
        />
      )}

      {/* Detail Drawer */}
      {viewEntry && (
        <DetailDrawer
          entry={viewEntry}
          onClose={() => setViewEntry(null)}
          onAction={handleAction}
        />
      )}

      {/* Page Header */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faMoneyBillWave} style={{ marginRight: '8px' }} /> Inhand Adjustments
          </h2>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditEntry(null); setShowForm(true); }}
        >
          <FontAwesomeIcon icon={faPlus} /> New Inhand Entry
        </button>
      </header>

      {/* Filters */}
      <div className="card" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-lg)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="filter-group" style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--spacing-xs)' }}><FontAwesomeIcon icon={faFilter} /> Date From</label>
            <input type="date" value={filters.startDate} className="form-input" style={{ width: '100%' }}
              onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--spacing-xs)' }}>Date To</label>
            <input type="date" value={filters.endDate} className="form-input" style={{ width: '100%' }}
              onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--spacing-xs)' }}>Payment Type</label>
            <select value={filters.payment_type} className="form-select" style={{ width: '100%' }}
              onChange={e => setFilters(f => ({ ...f, payment_type: e.target.value }))}>
              <option value="all">All Types</option>
              <option value="Cash In">Cash In</option>
              <option value="Cheque In">Cheque In</option>
            </select>
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--spacing-xs)' }}>Status</label>
            <select value={filters.status} className="form-select" style={{ width: '100%' }}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="filter-group search-group" style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: 'var(--spacing-xs)' }}><FontAwesomeIcon icon={faSearch} /> Search</label>
            <input type="text" placeholder="Ref no, party, cheque..." value={filters.search} className="form-input" style={{ width: '100%' }}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <button className="btn btn-secondary" title="Reset filters" style={{ height: '38px' }}
            onClick={() => setFilters({ startDate: '', endDate: '', payment_type: 'all', status: 'all', search: '' })}>
            <FontAwesomeIcon icon={faSync} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        {[
          { label: 'Total',     val: total, icon: faFilter,        cls: 'primary' },
          { label: 'Approved',  val: entries.filter(e => e.status === 'Approved').length,  icon: faCheckCircle,    cls: 'success' },
          { label: 'Pending',   val: entries.filter(e => e.status === 'Pending').length,   icon: faClock,          cls: 'warning' },
          { label: 'Cancelled', val: entries.filter(e => e.status === 'Cancelled').length, icon: faBan,            cls: 'danger'  },
        ].map(c => (
          <div key={c.label} className={`card alert-${c.cls}`} style={{ padding: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <FontAwesomeIcon icon={c.icon} style={{ fontSize: '24px', opacity: 0.8 }} />
            <div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{c.val}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p>Loading...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
            <FontAwesomeIcon icon={faMoneyBillWave} size="3x" style={{ marginBottom: 'var(--spacing-md)', opacity: 0.5 }} />
            <h3>No Inhand Entries Found</h3>
            <p>Create your first Cash In or Cheque In entry using the button above.</p>
          </div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Ref No</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party</th>
                <th>Commpany</th>
                <th className="text-right">Amount (Rs.)</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const isCash = entry.payment_type === 'Cash In';
                const busy   = actionBusy === entry.id;
                return (
                  <tr key={entry.id} className={busy ? 'row-busy' : ''}>
                    <td><span className="ref-no-badge">{entry.reference_no}</span></td>
                    <td>{entry.transaction_date}</td>
                    <td>
                      <span className={`ih-type-tag ${isCash ? 'cash' : 'cheque'}`}>
                        <FontAwesomeIcon icon={isCash ? faMoneyBillWave : faUniversity} />
                        {entry.payment_type}
                      </span>
                    </td>
                    <td>{entry.party_name || <span className="text-muted">—</span>}</td>
                    <td>
                      {isCash
                        ? <span>{entry.company_name || '—'}</span>
                        : <span>{entry.bank_account_name} {entry.cheque_number && <span className="cheque-chip">#{entry.cheque_number}</span>}</span>
                      }
                    </td>
                    <td className="text-right amount-cell">
                      {parseFloat(entry.amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                    </td>
                    <td><StatusBadge status={entry.status} /></td>
                    <td>{entry.created_by_name}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-action view"
                          title="View Details"
                          onClick={() => setViewEntry(entry)}>
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        {['Draft','Pending'].includes(entry.status) && (
                          <button className="btn-action edit"
                            title="Edit"
                            onClick={() => handleAction('edit', entry)}>
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                        )}
                        {entry.status === 'Draft' && (
                          <button className="btn-action submit"
                            title="Submit for Approval"
                            disabled={busy}
                            onClick={() => handleAction('submit', entry)}>
                            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPaperPlane} />}
                          </button>
                        )}
                        {entry.status === 'Pending' && (
                          <button className="btn-action approve"
                            title="Approve & Post"
                            disabled={busy}
                            onClick={() => handleAction('approve', entry)}>
                            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCheckCircle} />}
                          </button>
                        )}
                        {['Draft','Pending','Approved'].includes(entry.status) && (
                          <button className="btn-action cancel"
                            title="Cancel"
                            disabled={busy}
                            onClick={() => handleAction('cancel', entry)}>
                            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faBan} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination-section">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span className="page-info">Page {page} of {totalPages} &nbsp;({total} records)</span>
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
};

export default InhandAdjustments;
