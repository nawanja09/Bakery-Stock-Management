// src/components/adjustments/tabs/PurchasingPaymentAdjustmentsTab.jsx
//
// Read-only audit trail for the "Purchasing Payment" adjustment type -
// shows every payment that was adjusted through the Purchasing Payment
// Adjustment tab, with its original and adjusted values.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faFileInvoiceDollar } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

const PurchasingPaymentAdjustmentsTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/purchases/payment-adjustments');
      setRows(res.data || []);
    } catch (err) {
      console.error('Error fetching purchasing payment adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div>
      <div className="data-card">
        <div className="data-card-header">
          <h3>Purchasing Payment Adjustments</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="pagination-entries">{formatNumber(rows.length)} entries found</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={fetchRows}>
              <FontAwesomeIcon icon={faSync} /> Refresh
            </button>
          </div>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-responsive">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Voucher No.</th>
                  <th>Original Payment Date</th>
                  <th>Updated Payment Date</th>
                  <th>Original Amount</th>
                  <th>Adjusted Amount</th>
                  <th>Difference</th>
                  <th>Status</th>
                  <th>Updated By</th>
                  <th>Updated Date/Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.invoice_no || '-'}</td>
                    <td>{r.supplier_name || '-'}</td>
                    <td>{r.voucher_number || '-'}</td>
                    <td>{r.original_payment_date ? new Date(r.original_payment_date).toLocaleDateString() : '-'}</td>
                    <td>{r.updated_payment_date ? new Date(r.updated_payment_date).toLocaleDateString() : '-'}</td>
                    <td>{formatCurrency(r.original_amount)}</td>
                    <td>{formatCurrency(r.adjusted_amount)}</td>
                    <td style={{ color: parseFloat(r.adjustment_difference) < 0 ? 'var(--color-danger, #c0392b)' : 'var(--color-success, #1e8449)' }}>
                      {parseFloat(r.adjustment_difference) > 0 ? '+' : ''}{formatCurrency(r.adjustment_difference)}
                    </td>
                    <td><span className="status-badge">Purchasing Payment - {r.status}</span></td>
                    <td>{r.updated_by_name || '-'}</td>
                    <td>{r.updated_at || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="11" className="empty-state">
                    <FontAwesomeIcon icon={faFileInvoiceDollar} style={{ fontSize: '28px', opacity: 0.3 }} /><br />No purchasing payment adjustments found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchasingPaymentAdjustmentsTab;
