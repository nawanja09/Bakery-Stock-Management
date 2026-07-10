// src/components/purchase/PendingInvoicesSection.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileInvoiceDollar,
  faCheckCircle,
  faPaperPlane,
  faBalanceScale,
  faSpinner,
  faSearch,
  faReceipt,
  faWallet
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import './PendingInvoicesSection.css';

import InvoicePaymentModal from './InvoicePaymentModal';
import PayNowModal from './PayNowModal';
import SettleNowModal from './SettleNowModal';

const PendingInvoicesSection = ({ supplierId, supplierName, suppliers = [] }) => {
  const [invoices, setInvoices] = useState([]);
  const [outstanding, setOutstanding] = useState(null);
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [activeSupplierId, setActiveSupplierId] = useState(supplierId || '');

  const [showPayModal, setShowPayModal] = useState(false);
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [settleInvoice, setSettleInvoice] = useState(null);

  useEffect(() => {
    setActiveSupplierId(supplierId || '');
  }, [supplierId]);

  const fetchData = useCallback(async (selectedSupplierId = activeSupplierId) => {
    if (!selectedSupplierId) return;

    setLoading(true);
    try {
      const [invRes, outRes, creditRes] = await Promise.all([
        api.get(`/purchases/pending/${selectedSupplierId}`),
        api.get(`/suppliers/${selectedSupplierId}/outstanding`),
        api.get(`/suppliers/${selectedSupplierId}/credits`)
      ]);

      setInvoices(invRes.data || []);
      setOutstanding(outRes.data || null);
      setCredits([...(creditRes.data?.overpayments || []), ...(creditRes.data?.return_credits || [])]);
      setSelectedInvoiceIds(new Set());
    } catch (err) {
      console.error('Error fetching pending invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [activeSupplierId]);

  useEffect(() => {
    if (activeSupplierId) {
      fetchData(activeSupplierId);
    } else {
      setInvoices([]);
      setOutstanding(null);
      setCredits([]);
      setSelectedInvoiceIds(new Set());
    }
  }, [activeSupplierId, fetchData]);

  const toggleSelection = (id) => {
    const next = new Set(selectedInvoiceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoiceIds(next);
  };

  const toggleAll = () => {
    if (selectedInvoiceIds.size === invoices.length) setSelectedInvoiceIds(new Set());
    else setSelectedInvoiceIds(new Set(invoices.map(i => i.id)));
  };

  const handleSettleClick = (invoice) => {
    setSettleInvoice(invoice);
    setShowSettleModal(true);
  };

  const formatCurrency = (amount) => {
    const numeric = parseFloat(amount) || 0;
    return `Rs. ${numeric.toFixed(2)}`;
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    const term = supplierSearch.toLowerCase();
    return !term || supplier.name?.toLowerCase().includes(term);
  });

  if (!supplierId && !suppliers.length) return null;

  const selectedInvoicesList = invoices.filter(i => selectedInvoiceIds.has(i.id));

  return (
    <div className="pis-container">
      <InvoicePaymentModal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        supplierName={supplierName || (suppliers.find((s) => s.id === activeSupplierId)?.name || '')}
        selectedInvoices={selectedInvoicesList}
        onSuccess={() => fetchData(activeSupplierId)}
      />

      <PayNowModal
        isOpen={showPayNowModal}
        onClose={() => setShowPayNowModal(false)}
        supplierId={activeSupplierId}
        supplierName={supplierName || (suppliers.find((s) => s.id === activeSupplierId)?.name || '')}
        onSuccess={() => fetchData(activeSupplierId)}
      />

      <SettleNowModal
        isOpen={showSettleModal}
        onClose={() => { setShowSettleModal(false); setSettleInvoice(null); }}
        supplierId={activeSupplierId}
        invoice={settleInvoice}
        onSuccess={() => fetchData(activeSupplierId)}
      />

      <div className="pis-filter-bar">
        <div className="pis-filter-group">
          <label htmlFor="supplier-search">Supplier Search</label>
          <div className="pis-filter-input-wrap">
            <FontAwesomeIcon icon={faSearch} />
            <input
              id="supplier-search"
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search supplier"
            />
          </div>
        </div>
        <div className="pis-filter-group">
          <label htmlFor="supplier-select">Display Records For</label>
          <select
            id="supplier-select"
            value={activeSupplierId}
            onChange={(e) => setActiveSupplierId(e.target.value)}
          >
            <option value="">Select supplier</option>
            {filteredSuppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pis-header">
        <h3><FontAwesomeIcon icon={faFileInvoiceDollar} /> Outstanding Invoices & Payments</h3>
        <div className="pis-header-actions">
          <button
            className="pis-btn-pay-now"
            onClick={() => setShowPayNowModal(true)}
            type="button"
            disabled={!activeSupplierId}
          >
            <FontAwesomeIcon icon={faPaperPlane} /> Pay Now (Advance)
          </button>
          <button
            className="pis-btn-pay"
            onClick={() => setShowPayModal(true)}
            disabled={selectedInvoiceIds.size === 0 || !activeSupplierId}
            type="button"
          >
            <FontAwesomeIcon icon={faCheckCircle} />
            Pay Selected ({selectedInvoiceIds.size})
          </button>
        </div>
      </div>

      {outstanding && (
        <div className="pis-summary-grid">
          <div className="pis-summary-item debt">
            <span>Total Outstanding</span>
            <strong>{formatCurrency(outstanding.total_outstanding)}</strong>
          </div>
          <div className="pis-summary-item credit">
            <span>Available Credit</span>
            <strong>{formatCurrency(outstanding.total_credit)}</strong>
          </div>
          <div className="pis-summary-item">
            <span>Total Invoices</span>
            <strong>{outstanding.total_invoices}</strong>
          </div>
          <div className="pis-summary-item">
            <span>Total Billed</span>
            <strong>{formatCurrency(outstanding.total_billed)}</strong>
          </div>
        </div>
      )}

      <div className="pis-table-container">
        <table className="pis-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className="pis-checkbox"
                  checked={invoices.length > 0 && selectedInvoiceIds.size === invoices.length}
                  onChange={toggleAll}
                />
              </th>
              <th>Invoice No.</th>
              <th>Date</th>
              <th className="pis-amount">Total Amount</th>
              <th className="pis-amount">Paid</th>
              <th className="pis-amount">Balance Due</th>
              <th style={{ width: '140px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="pis-empty">
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <p>Loading pending invoices...</p>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan="7" className="pis-empty">
                  <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#10b981' }} />
                  <p>No pending invoices for this supplier.</p>
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const isSelected = selectedInvoiceIds.has(invoice.id);
                return (
                  <tr key={invoice.id} className={isSelected ? 'selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className="pis-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(invoice.id)}
                      />
                    </td>
                    <td>
                      <div className="pis-invoice-num">{invoice.invoice_no}</div>
                      <div className="pis-subtle">{invoice.company_name || 'No Company'}</div>
                    </td>
                    <td>
                      <div className="pis-date">{dayjs(invoice.purchase_date).format('DD MMM YYYY')}</div>
                      {invoice.days_overdue > 30 && <span className="pis-overdue">Overdue</span>}
                    </td>
                    <td className="pis-amount">{formatCurrency(invoice.total_with_vat)}</td>
                    <td className="pis-amount">{formatCurrency(invoice.paid_amount)}</td>
                    <td className="pis-balance">{formatCurrency(invoice.balance_amount)}</td>
                    <td className="pis-actions">
                      <button
                        className="pis-btn-settle"
                        onClick={() => handleSettleClick(invoice)}
                        disabled={!outstanding || outstanding.total_credit <= 0}
                        title={(!outstanding || outstanding.total_credit <= 0) ? 'No available credits' : 'Settle with credit'}
                        type="button"
                      >
                        <FontAwesomeIcon icon={faBalanceScale} /> Settle
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pis-credit-section">
        <div className="pis-credit-header">
          <h4><FontAwesomeIcon icon={faWallet} /> Available Supplier Credits</h4>
          <span>Advance payments and unsettled return credits</span>
        </div>

        {loading ? (
          <div className="pis-empty">
            <FontAwesomeIcon icon={faSpinner} spin />
            <p>Loading supplier credits...</p>
          </div>
        ) : credits.length === 0 ? (
          <div className="pis-empty">
            <FontAwesomeIcon icon={faReceipt} />
            <p>No available advance payments or return credits for this supplier.</p>
          </div>
        ) : (
          <div className="pis-credit-table-wrap">
            <table className="pis-table pis-credit-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th className="pis-amount">Original</th>
                  <th className="pis-amount">Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((credit) => (
                  <tr key={`${credit.credit_type}-${credit.id}`}>
                    <td>
                      <span className={`pis-credit-badge ${credit.credit_type === 'return_credit' ? 'return' : 'advance'}`}>
                        {credit.credit_type === 'return_credit' ? 'Purchase Return Credit' : 'Advance Payment'}
                      </span>
                    </td>
                    <td>
                      <div className="pis-invoice-num">{credit.credit_number}</div>
                      <div className="pis-subtle">{credit.reference_number || credit.notes || 'Supplier credit'}</div>
                    </td>
                    <td>{dayjs(credit.credit_date).format('DD MMM YYYY')}</td>
                    <td className="pis-amount">{formatCurrency(credit.original_amount)}</td>
                    <td className="pis-amount">{formatCurrency(credit.remaining_credit)}</td>
                    <td>{credit.status || 'Active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingInvoicesSection;
