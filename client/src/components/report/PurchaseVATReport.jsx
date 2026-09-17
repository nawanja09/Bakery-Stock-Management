import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileExcel,
  faFilePdf,
  faPrint,
  faCalendar,
  faSearch,
  faUndo,
  faFilter,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import { formatNumber } from '../../utils/formatters';
import './PurchaseVATReport.css';

// Renamed from "VAT Effect" / "Purchase Returns VAT Report" to
// "Return VAT Report". Now unifies two return types behind a
// "Return Type" filter:
//   - Purchase Returns (unchanged data/behaviour from before)
//   - Credit Note (from the New Expenses module)
const RETURN_TYPE_OPTIONS = ['All', 'Credit Note', 'Purchase Returns'];

const ReturnVATReport = () => {
  const [returns, setReturns] = useState([]);
  const [filteredReturns, setFilteredReturns] = useState([]);
  const [summary, setSummary] = useState({
    total_returns: 0,
    total_before_vat: 0,
    total_vat: 0,
    total_amount: 0
  });
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [searchQuery, setSearchQuery] = useState('');
  const [returnType, setReturnType] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredReturns.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const filtered = returns.filter(ret =>
        ret.supplier?.toLowerCase().includes(query) ||
        ret.reference_no?.toLowerCase().includes(query) ||
        ret.company?.toLowerCase().includes(query)
      );
      setFilteredReturns(filtered);
      setCurrentPage(1);
    } else {
      setFilteredReturns(returns);
    }
  }, [searchQuery, returns]);

  const fetchReturnVAT = useCallback(async () => {
    try {
      setLoading(true);

      const response = await api.get('/purchase-returns/reports/return-vat', {
        params: { startDate, endDate, returnType }
      });

      const summaryResponse = await api.get('/purchase-returns/reports/return-vat-summary', {
        params: { startDate, endDate, returnType }
      });

      setReturns(response.data || []);
      setFilteredReturns(response.data || []);
      setSummary(summaryResponse.data || {});
    } catch (error) {
      console.error('Error fetching Return VAT report:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, returnType]);

  useEffect(() => {
    fetchReturnVAT();
  }, [fetchReturnVAT]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return dayjs(date).format('MM/DD/YYYY');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    let csvContent = "Serial No,Date,Return Type,Supplier,Reference No,Amount Before VAT (Rs.),VAT Amount (Rs.),Total Amount (Rs.),Company\n";

    filteredReturns.forEach(ret => {
      csvContent += `${ret.serial_no},${formatDate(ret.date)},${ret.return_type},"${ret.supplier || ''}",${ret.reference_no || ''},${ret.amount_before_vat.toFixed(2)},${ret.vat_amount.toFixed(2)},${ret.total_amount.toFixed(2)},"${ret.company || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Return_VAT_Report_${startDate}_to_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePDF = () => {
    alert('PDF generation feature coming soon!');
  };

  const resetFilters = () => {
    setStartDate(dayjs().startOf('month').format('YYYY-MM-DD'));
    setEndDate(dayjs().format('YYYY-MM-DD'));
    setSearchQuery('');
    setReturnType('All');
  };

  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="vat-loading-container">
        <div className="vat-loading-spinner"></div>
        <p>Loading Return VAT report...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header Section */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Return VAT Report</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={resetFilters} className="btn btn-secondary">
            <FontAwesomeIcon icon={faUndo} /> Reset Filters
          </button>
          <button onClick={handleExcel} className="btn btn-success">
            <FontAwesomeIcon icon={faFileExcel} /> Excel
          </button>
          <button onClick={handlePDF} className="btn btn-secondary">
            <FontAwesomeIcon icon={faFilePdf} /> PDF
          </button>
          <button onClick={handlePrint} className="btn btn-secondary">
            <FontAwesomeIcon icon={faPrint} /> Print
          </button>
        </div>
      </header>

      {/* Filter Section */}
      <div className="filters-section card report-filter-bar vat-report-filter">
        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendar} /> From Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendar} /> To Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faFilter} /> Return Type
          </label>
          <select
            value={returnType}
            onChange={(e) => setReturnType(e.target.value)}
            className="report-filter-input"
          >
            {RETURN_TYPE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-group" style={{ flex: '1 1 200px' }}>
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faSearch} /> Search
          </label>
          <div className="items-search report-search-field">
            <input
              type="text"
              placeholder="Supplier, Reference No, Company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="report-filter-input"
            />
          </div>
        </div>

        <div className="report-filter-actions">
          <button onClick={fetchReturnVAT} className="btn btn-primary">
            <FontAwesomeIcon icon={faFilter} /> Generate
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)' }}>
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">Total Records</div>
          <div className="report-summary-value">{formatNumber(summary.total_returns)}</div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">Amount Before VAT</div>
          <div className="report-summary-value">{formatCurrency(summary.total_before_vat)}</div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">VAT Amount</div>
          <div className="report-summary-value text-primary">{formatCurrency(summary.total_vat)}</div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">Total Amount</div>
          <div className="report-summary-value">{formatCurrency(summary.total_amount)}</div>
        </div>
      </div>

      {/* Table Section */}
      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Return Type</th>
                <th>Supplier</th>
                <th>Reference No</th>
                <th>Amount Before VAT</th>
                <th>VAT Amount</th>
                <th>Total Amount</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="vat-no-data">
                    <div className="vat-empty-state">
                      <span>📭</span>
                      <p>No records found for selected period</p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentItems.map((ret, idx) => (
                  <tr key={idx}>
                    <td>{indexOfFirstItem + idx + 1}</td>
                    <td>{formatDate(ret.date)}</td>
                    <td>
                      <span className={`badge ${ret.return_type === 'Credit Note' ? 'badge-primary' : 'badge-neutral'}`}>
                        {ret.return_type}
                      </span>
                    </td>
                    <td>{ret.supplier || '-'}</td>
                    <td>
                      <span className="badge badge-neutral">{ret.reference_no || '-'}</span>
                    </td>
                    <td className="report-table-value-numeric">{formatCurrency(ret.amount_before_vat)}</td>
                    <td className="report-table-value-numeric text-primary">{formatCurrency(ret.vat_amount)}</td>
                    <td className="report-table-value-numeric">{formatCurrency(ret.total_amount)}</td>
                    <td>{ret.company || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="5" className="vat-footer-label"><strong>Total</strong></td>
                <td className="vat-footer-amount"><strong>{formatCurrency(summary.total_before_vat)}</strong></td>
                <td className="vat-footer-amount vat-primary-amount"><strong>{formatCurrency(summary.total_vat)}</strong></td>
                <td className="vat-footer-amount"><strong>{formatCurrency(summary.total_amount)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="vat-pagination">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className="vat-page-btn"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <div className="vat-page-numbers">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => paginate(pageNum)}
                    className={`vat-page-number ${currentPage === pageNum ? 'active' : ''}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="vat-page-btn"
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        )}
      </div>

      {/* Report Info Footer */}
      <div className="vat-report-footer">
        <div className="vat-footer-info">
          <span>📅 {formatDate(startDate)} — {formatDate(endDate)}</span>
          <span>⏱ Generated {dayjs().format('DD MMM YYYY, h:mm A')}</span>
        </div>
        <p className="vat-footer-note">
          <strong>Note:</strong> Purchase Returns are limited to VAT registered suppliers. Credit Notes come from the New Expenses module.
        </p>
      </div>
    </div>
  );
};

export default ReturnVATReport;
