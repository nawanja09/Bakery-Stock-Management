import React, { useState } from 'react';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiDownload, FiPrinter } from 'react-icons/fi';
import { Modal, ConfirmDialog, PageHeader, StatusBadge, EmptyState } from '.';

// Development-only living style guide (route /ui-preview, never in a
// production build). Shows every shared component with sample data so the
// design system can be checked without logging in.
const rows = [
  { id: 1, invoice: 'INV-0042', supplier: 'Lanka Flour Mills', date: '2026-10-12', amount: 125400, status: 'Approved' },
  { id: 2, invoice: 'INV-0043', supplier: 'Ceylon Dairy Co.', date: '2026-10-13', amount: 48250.5, status: 'Pending' },
  { id: 3, invoice: 'INV-0044', supplier: 'Sugar Corporation', date: '2026-10-13', amount: 9875, status: 'Rejected' },
  { id: 4, invoice: 'INV-0045', supplier: 'Packaging House', date: '2026-10-14', amount: 22100, status: 'Draft' },
];

const money = (n) => n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UiPreview = () => {
  const [modal, setModal] = useState(null);

  return (
    <div style={{ minHeight: '100vh', padding: 28, background: 'var(--color-background)' }}>
      <div className="ui-page">
        <PageHeader
          eyebrow="Purchasing"
          title="Purchase Invoices"
          subtitle="All supplier invoices for the selected period"
          badge={<span className="ui-count-badge">{rows.length}</span>}
          actions={(
            <>
              <button type="button" className="btn btn-secondary"><FiPrinter /> Print</button>
              <button type="button" className="btn btn-secondary"><FiDownload /> Excel</button>
              <button type="button" className="btn btn-primary" onClick={() => setModal('form')}><FiPlus /> New Purchase</button>
            </>
          )}
        />

        <div className="filters-section">
          <div className="report-filter-group">
            <label className="report-filter-label">From</label>
            <input type="date" className="report-filter-input" defaultValue="2026-10-01" />
          </div>
          <div className="report-filter-group">
            <label className="report-filter-label">To</label>
            <input type="date" className="report-filter-input" defaultValue="2026-10-14" />
          </div>
          <div className="report-filter-group">
            <label className="report-filter-label">Supplier</label>
            <select className="report-filter-select" defaultValue="">
              <option value="">Select supplier</option>
              <option>Lanka Flour Mills</option>
            </select>
          </div>
          <div className="items-search">
            <FiSearch className="text-muted" />
            <input type="text" placeholder="Search invoice or supplier..." />
          </div>
          <div className="report-filter-actions">
            <button type="button" className="btn btn-secondary">Reset</button>
            <button type="button" className="btn btn-primary">Apply</button>
          </div>
        </div>

        <div className="ui-table-card">
          <div className="ui-table-scroll">
            <table className="erp-data-table">
              <thead>
                <tr>
                  <th>Invoice</th><th>Supplier</th><th>Date</th>
                  <th className="text-right">Amount (Rs.)</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.invoice}</strong></td>
                    <td>{r.supplier}</td>
                    <td>{r.date}</td>
                    <td className="text-right num">{money(r.amount)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
                        <button type="button" className="btn-icon edit" aria-label="Edit" onClick={() => setModal('drawer')}><FiEdit size={14} /></button>
                        <button type="button" className="btn-icon delete" aria-label="Delete" onClick={() => setModal('confirm')}><FiTrash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}>Total</td>
                  <td className="text-right num">{money(rows.reduce((s, r) => s + r.amount, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="ui-table-footer"><span>Showing 4 of 4 records</span></div>
        </div>

        {/* Same markup the 42 existing pages use (e.g. Cash Ledger) */}
        <div className="page-container">
          <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h2 style={{ textAlign: 'left', margin: 0 }}>
                <FiDownload style={{ marginRight: '8px' }} /> Cash Ledger
              </h2>
            </div>
            <div className="cash-ledger-header-actions">
              <button type="button" className="btn btn-primary">Cash Received</button>
              <button type="button" className="btn btn-secondary">Cash Issued</button>
            </div>
          </header>
          <div className="filters-section report-filter-bar">
            <div className="report-filter-group">
              <label className="report-filter-label">Company</label>
              <select className="report-filter-select" defaultValue=""><option value="">All companies</option></select>
            </div>
          </div>
          {/* Legacy empty states used by many pages */}
          <table className="erp-data-table">
            <thead><tr><th>Date</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody><tr><td colSpan="4" className="empty-state">No transactions for this period.</td></tr></tbody>
          </table>
          <div className="empty-state">
            <FiDownload style={{ fontSize: '28px', opacity: 0.3 }} />
            <p>No adjustment records found.</p>
            <span className="empty-state-subtitle">Try adjusting your filters.</span>
          </div>
        </div>

        <div className="ui-table-card"><EmptyState title="No wastage recorded" description="Nothing was wasted in this period." action={<button type="button" className="btn btn-primary"><FiPlus /> Add wastage</button>} /></div>

        <div className="card" style={{ padding: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary">Primary</button>
          <button type="button" className="btn btn-secondary">Secondary</button>
          <button type="button" className="btn btn-ghost">Ghost</button>
          <button type="button" className="btn btn-success">Success</button>
          <button type="button" className="btn btn-danger">Danger</button>
          <button type="button" className="btn btn-primary" disabled>Disabled</button>
          {['Approved', 'Pending', 'Rejected', 'Draft', 'Issued'].map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </div>

      <Modal
        open={modal === 'form'}
        title="New Purchase"
        subtitle="Supplier invoice details"
        size="lg"
        onClose={() => setModal(null)}
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button type="button" className="btn btn-primary">Save</button></>}
      >
        <div className="ui-form-grid">
          <div className="ui-field"><label>Supplier *</label><select defaultValue=""><option value="">Select supplier</option></select></div>
          <div className="ui-field"><label>Invoice No *</label><input type="text" placeholder="INV-0000" /></div>
          <div className="ui-field"><label>Date</label><input type="date" /></div>
          <div className="ui-field has-error"><label>Amount *</label><input type="number" /><span className="ui-field-error">Amount is required</span></div>
        </div>
      </Modal>

      <Modal open={modal === 'drawer'} title="Edit Purchase" subtitle="INV-0042" size="drawer" onClose={() => setModal(null)}
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button type="button" className="btn btn-primary">Save changes</button></>}>
        <div className="ui-form">
          <div className="ui-field"><label>Supplier</label><input type="text" defaultValue="Lanka Flour Mills" /></div>
          <div className="ui-field"><label>Notes</label><textarea defaultValue="Delivered in two batches." /></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={modal === 'confirm'}
        title="Delete invoice?"
        message="INV-0042 will be removed. This cannot be undone."
        confirmText="Delete"
        onConfirm={() => setModal(null)}
        onCancel={() => setModal(null)}
      />
    </div>
  );
};

export default UiPreview;
