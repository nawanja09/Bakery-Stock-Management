import React, { useState, useEffect } from 'react';
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
  faDownload,
  faBuilding
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
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
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredReturns.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchVATReturns();
  }, [startDate, endDate, selectedCompany]);

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

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/purchases/companies');
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const getInvoiceNo = (ret) => {
    const val = ret.invoice_no;
    if (!val || val.trim() === '' || val === '—') {
      return '-';
    }
    return val;
  };
  
  const fetchVATReturns = async () => {
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
        setDebugInfo({
          hasInvoiceNo: response.data[0].hasOwnProperty('invoice_no'),
          invoiceNoValue: response.data[0].invoice_no,
          totalRecords: response.data.length
        });
      }

      setPurchaseReturns(response.data);
      setFilteredReturns(response.data);
      setSummary(summaryResponse.data);
      
    } catch (error) {
      console.error('Error fetching VAT returns:', error);
      setDebugInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

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
    <div className="vat-report-container">
      {/* Header Section */}
      <div className="vat-header">
        <div className="vat-header-content">
          <div className="vat-title-section">
            <div className="vat-icon-wrapper">
              <FontAwesomeIcon icon={faUndo} className="vat-header-icon" />
            </div>
            <div>
              <h1>Purchase Returns VAT Report</h1>
              <p>Tax Credit Notes from VAT Registered Suppliers</p>
            </div>
          </div>
          <div className="vat-header-actions">
            <button onClick={resetFilters} className="vat-btn-outline">
              <FontAwesomeIcon icon={faUndo} /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="vat-filters-card">
        <div className="vat-filters-grid">
          <div className="vat-filter-group">
            <label>
              <FontAwesomeIcon icon={faCalendar} />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="vat-filter-input"
            />
          </div>

          <div className="vat-filter-group">
            <label>
              <FontAwesomeIcon icon={faCalendar} />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="vat-filter-input"
            />
          </div>

          <div className="vat-filter-group vat-search-group">
            <label>
              <FontAwesomeIcon icon={faSearch} />
              Search
            </label>
            <div className="vat-search-wrapper">
              <FontAwesomeIcon icon={faSearch} className="vat-search-icon" />
              <input
                type="text"
                placeholder="Supplier, TIN, Invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="vat-filter-input vat-search-input"
              />
            </div>
          </div>

          <div className="vat-filter-group vat-filter-action">
            <label>&nbsp;</label>
            <button onClick={fetchVATReturns} className="vat-btn-primary">
              <FontAwesomeIcon icon={faFilter} /> Generate
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="vat-summary-grid">
        <div className="vat-summary-card vat-card-returns">
          <div className="vat-summary-icon">
            <span>📋</span>
          </div>
          <div className="vat-summary-info">
            <span className="vat-summary-label">Total Returns</span>
            <span className="vat-summary-value">{summary.total_returns}</span>
          </div>
        </div>

        <div className="vat-summary-card vat-card-value">
          <div className="vat-summary-icon">
            <span>💰</span>
          </div>
          <div className="vat-summary-info">
            <span className="vat-summary-label">Return Value</span>
            <span className="vat-summary-value">{formatCurrency(summary.total_return_value)}</span>
          </div>
        </div>

        <div className="vat-summary-card vat-card-vat">
          <div className="vat-summary-icon">
            <span>🧾</span>
          </div>
          <div className="vat-summary-info">
            <span className="vat-summary-label">VAT Credit</span>
            <span className="vat-summary-value vat-highlight">{formatCurrency(summary.total_vat_credit)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="vat-action-bar">
        <button onClick={handleExcel} className="vat-btn-excel">
          <FontAwesomeIcon icon={faFileExcel} />
          <span>Excel</span>
        </button>
        <button onClick={handlePDF} className="vat-btn-pdf">
          <FontAwesomeIcon icon={faFilePdf} />
          <span>PDF</span>
        </button>
        <button onClick={handlePrint} className="vat-btn-print">
          <FontAwesomeIcon icon={faPrint} />
          <span>Print</span>
        </button>
      </div>

      {/* Warning Banner */}
      {filteredReturns.length > 0 && !filteredReturns[0]?.invoice_no && (
        <div className="vat-warning-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>Invoice numbers not available in data. Please verify backend API response.</span>
        </div>
      )}

      {/* Table Section */}
      <div className="vat-table-wrapper">
        <div className="vat-table-container">
          <table className="vat-data-table">
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
                    <td data-label="#">{indexOfFirstItem + idx + 1}</td>
                    <td data-label="TIN No">
                      <span className="vat-tin-badge">{ret.tin_no || '-'}</span>
                    </td>
                    <td data-label="Invoice Date" className="vat-date-cell">
                      {ret.invoice_date ? formatDate(ret.invoice_date) : '-'}
                    </td>
                    <td data-label="Invoice No" className="vat-invoice-cell">{getInvoiceNo(ret)}</td>
                    <td data-label="Tax Credit">
                      <span className="vat-credit-badge">{ret.tax_credit || 'Credit'}</span>
                    </td>
                    <td data-label="Credit Date" className="vat-date-cell">
                      {ret.date_of_tax_credit ? formatDate(ret.date_of_tax_credit) : '-'}
                    </td>
                    <td data-label="Credit No">
                      <span className="vat-credit-no">{ret.tax_credit_no || '-'}</span>
                    </td>
                    <td data-label="Credit Note Value" className="vat-amount-cell">{formatCurrency(ret.value_of_return)}</td>
                    <td data-label="VAT Amount" className="vat-amount-cell vat-primary-amount">{formatCurrency(ret.vat_amount)}</td>
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