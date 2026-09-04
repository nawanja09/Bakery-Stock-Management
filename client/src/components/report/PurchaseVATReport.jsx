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
  faExclamationTriangle,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import { formatNumber } from '../../utils/formatters';
import './PurchaseVATReport.css';

const PurchaseVATReport = () => {
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [filteredReturns, setFilteredReturns] = useState([]);
  const [summary, setSummary] = useState({
    total_return_value: 0,
    total_vat_credit: 0,
    total_returns: 0
  });
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredReturns.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const filtered = purchaseReturns.filter(ret => 
        ret.supplier_name?.toLowerCase().includes(query) ||
        ret.tin_no?.toLowerCase().includes(query) ||
        ret.invoice_no?.toLowerCase().includes(query) ||
        ret.tax_credit_no?.toLowerCase().includes(query)
      );
      setFilteredReturns(filtered);
      setCurrentPage(1);
    } else {
      setFilteredReturns(purchaseReturns);
    }
  }, [searchQuery, purchaseReturns]);

  const getInvoiceNo = (ret) => {
    const val = ret.invoice_no;
    if (!val || val.trim() === '' || val === '—') {
      return '-';
    }
    return val;
  };
  
  const fetchVATReturns = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await api.get('/purchase-returns/reports/vat-returns', {
        params: { startDate, endDate }
      });
      
      const summaryResponse = await api.get('/purchase-returns/reports/vat-summary', {
        params: { startDate, endDate }
      });

      console.log('API Response - VAT Returns:', response.data);
      
      if (response.data && response.data.length > 0) {
        console.log('First record invoice_no:', response.data[0].invoice_no);
        console.log('First record full data:', response.data[0]);
      }

      setPurchaseReturns(response.data);
      setFilteredReturns(response.data);
      setSummary(summaryResponse.data);
      
    } catch (error) {
      console.error('Error fetching VAT returns:', error);
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    fetchVATReturns();
  }, [fetchVATReturns, selectedCompany]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount).replace('LKR', 'Rs.');
  };

  // Format date as MM/DD/YYYY with numbers only
  const formatDate = (date) => {
    if (!date) return '-';
    const formatted = dayjs(date).format('MM/DD/YYYY');
    return formatted;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    let csvContent = "Serial No,TIN No,Invoice Date,Invoice No,Tax Credit,Date of Tax Credit,Tax Credit No,Value of Tax Credit Note (Rs.),VAT Amount (Rs.)\n";
    
    filteredReturns.forEach(ret => {
      const invoiceNo = ret.invoice_no || ret.invoice_number || '-';
      const invoiceDate = ret.invoice_date || ret.date_of_tax_credit || startDate;
      
      csvContent += `${ret.serial_no},${ret.tin_no || ''},${formatDate(invoiceDate)},"${invoiceNo}",${ret.tax_credit || 'Credit'},${formatDate(ret.date_of_tax_credit)},${ret.tax_credit_no},${ret.value_of_return.toFixed(2)},${ret.vat_amount.toFixed(2)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VAT_Returns_${startDate}_to_${endDate}.csv`;
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
    setSelectedCompany('');
  };

  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="vat-loading-container">
        <div className="vat-loading-spinner"></div>
        <p>Loading VAT returns...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header Section */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Purchase Returns VAT Report</h2>
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

          <div className="report-filter-group" style={{ flex: '1 1 200px' }}>
            <label className="report-filter-label">
              <FontAwesomeIcon icon={faSearch} /> Search
            </label>
            <div className="items-search report-search-field">
              <input
                type="text"
                placeholder="Supplier, TIN, Invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="report-filter-input"
              />
            </div>
          </div>

          <div className="report-filter-actions">
            <button onClick={fetchVATReturns} className="btn btn-primary">
              <FontAwesomeIcon icon={faFilter} /> Generate
            </button>
          </div>
        </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)' }}>
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">Total Returns</div>
          <div className="report-summary-value">{formatNumber(summary.total_returns)}</div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">Return Value</div>
          <div className="report-summary-value">{formatCurrency(summary.total_return_value)}</div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="report-summary-label">VAT Credit</div>
          <div className="report-summary-value text-primary">{formatCurrency(summary.total_vat_credit)}</div>
        </div>
      </div>



      {/* Warning Banner */}
      {filteredReturns.length > 0 && !filteredReturns[0]?.invoice_no && (
        <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: '#fff3cd', color: '#856404' }}>
          <FontAwesomeIcon icon={faExclamationTriangle} style={{ marginRight: '8px' }} />
          <span>Invoice numbers not available in data. Please verify backend API response.</span>
        </div>
      )}

      {/* Table Section */}
      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TIN No</th>
                <th>Invoice Date</th>
                <th>Invoice No</th>
                <th>Tax Credit</th>
                <th>Credit Date</th>
                <th>Credit No</th>
                <th>Credit Note Value</th>
                <th>VAT Amount</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="vat-no-data">
                    <div className="vat-empty-state">
                      <span>📭</span>
                      <p>No VAT returns found for selected period</p>
                    </div>
                   </td>
                </tr>
              ) : (
                currentItems.map((ret, idx) => (
                  <tr key={idx}>
                    <td>{indexOfFirstItem + idx + 1}</td>
                    <td>
                      <span className="badge badge-neutral">{ret.tin_no || '-'}</span>
                    </td>
                    <td>
                      {ret.invoice_date ? formatDate(ret.invoice_date) : '-'}
                    </td>
                    <td>{getInvoiceNo(ret)}</td>
                    <td>
                      <span className="badge badge-primary">{ret.tax_credit || 'Credit'}</span>
                    </td>
                    <td>
                      {ret.date_of_tax_credit ? formatDate(ret.date_of_tax_credit) : '-'}
                    </td>
                    <td>
                      <span className="badge badge-neutral">{ret.tax_credit_no || '-'}</span>
                    </td>
                    <td className="report-table-value-numeric">{formatCurrency(ret.value_of_return)}</td>
                    <td className="report-table-value-numeric text-primary">{formatCurrency(ret.vat_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7" className="vat-footer-label"><strong>Total</strong></td>
                <td className="vat-footer-amount"><strong>{formatCurrency(summary.total_return_value)}</strong></td>
                <td className="vat-footer-amount vat-primary-amount"><strong>{formatCurrency(summary.total_vat_credit)}</strong></td>
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
          <strong>Note:</strong> This report includes only returns from VAT registered suppliers.
        </p>
      </div>
    </div>
  );
};

export default PurchaseVATReport;