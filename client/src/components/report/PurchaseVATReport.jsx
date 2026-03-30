import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFileExcel, 
  faFilePdf, 
  faPrint,
  faCalendar,
  faBuilding,
  faSearch,
  faUndo
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import './VATReport.css';

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

  useEffect(() => {
    fetchVATReturns();
  }, [startDate, endDate]);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const filtered = purchaseReturns.filter(ret => 
        ret.supplier_name?.toLowerCase().includes(query) ||
        ret.return_bill_no?.toLowerCase().includes(query) ||
        ret.invoice_no?.toLowerCase().includes(query) ||
        ret.tin_no?.includes(query)
      );
      setFilteredReturns(filtered);
    } else {
      setFilteredReturns(purchaseReturns);
    }
  }, [searchQuery, purchaseReturns]);

  const fetchVATReturns = async () => {
    try {
      setLoading(true);
      
      // Fetch purchase returns for VAT report
      const returnsResponse = await api.get('/purchase-returns/reports/vat-returns', {
        params: { startDate, endDate }
      });
      
      // Fetch summary
      const summaryResponse = await api.get('/purchase-returns/reports/vat-summary', {
        params: { startDate, endDate }
      });

      setPurchaseReturns(returnsResponse.data);
      setFilteredReturns(returnsResponse.data);
      setSummary(summaryResponse.data);
      
    } catch (error) {
      console.error('Error fetching VAT returns:', error);
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

  const formatDate = (date) => {
    return dayjs(date).format('MM/DD/YYYY');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    // Create CSV content
    let csvContent = "Serial No,TIN No,Invoice Date,Invoice No,Tax Credit,Date of Tax Credit,Tax Credit No,Value of Tax Credit Note,VAT Amount\n";
    
    filteredReturns.forEach(ret => {
      csvContent += `${ret.serial_no},${ret.tin_no},${formatDate(ret.invoice_date)},${ret.invoice_no},Credit,${formatDate(ret.return_date)},${ret.tax_credit_no},${ret.value_of_return},${ret.vat_amount}\n`;
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VAT_Returns_${startDate}_to_${endDate}.csv`;
    a.click();
  };

  const handlePDF = () => {
    alert('PDF generation feature coming soon!');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading VAT returns...</p>
      </div>
    );
  }

  return (
    <div className="vat-report-container">
      <div className="page-header">
        <h1>
          <FontAwesomeIcon icon={faUndo} className="header-icon" />
          Purchase Returns - VAT Report
        </h1>
        <p className="subtitle">Tax Credit Notes for Purchase Returns</p>
      </div>

      {/* Filter Section */}
      <div className="filters-card">
        <div className="filters-grid">
          <div className="filter-group">
            <label>
              <FontAwesomeIcon icon={faCalendar} />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>
              <FontAwesomeIcon icon={faCalendar} />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>
              <FontAwesomeIcon icon={faSearch} />
              Search
            </label>
            <input
              type="text"
              placeholder="Search by supplier, TIN, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>&nbsp;</label>
            <button onClick={fetchVATReturns} className="btn-primary">
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon return">📝</div>
          <div className="summary-details">
            <span className="summary-label">Total Returns</span>
            <span className="summary-value">{summary.total_returns}</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon value">💰</div>
          <div className="summary-details">
            <span className="summary-label">Total Return Value</span>
            <span className="summary-value">{formatCurrency(summary.total_return_value)}</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon vat">🧾</div>
          <div className="summary-details">
            <span className="summary-label">Total VAT Credit</span>
            <span className="summary-value vat-text">{formatCurrency(summary.total_vat_credit)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button onClick={handleExcel} className="btn-excel">
          <FontAwesomeIcon icon={faFileExcel} />
          Export to Excel
        </button>
        <button onClick={handlePDF} className="btn-pdf">
          <FontAwesomeIcon icon={faFilePdf} />
          Export to PDF
        </button>
        <button onClick={handlePrint} className="btn-print">
          <FontAwesomeIcon icon={faPrint} />
          Print
        </button>
      </div>

      {/* Report Table */}
      <div className="report-table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>Serial No</th>
              <th>TIN No</th>
              <th>Invoice Date</th>
              <th>Invoice No</th>
              <th>Tax Credit</th>
              <th>Date of Tax Credit</th>
              <th>Tax Credit No</th>
              <th>Value of Tax Credit Note</th>
              <th>VAT Amount</th>
              <th>Disallowable VAT Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredReturns.length === 0 ? (
              <tr>
                <td colSpan="10" className="no-data">
                  No VAT returns found for the selected period
                </td>
              </tr>
            ) : (
              filteredReturns.map((ret) => (
                <tr key={ret.serial_no}>
                  <td className="text-center">{ret.serial_no}</td>
                  <td className="text-center">
                    <span className="tin-badge">{ret.tin_no}</span>
                  </td>
                  <td className="text-center">{formatDate(ret.invoice_date)}</td>
                  <td className="text-center">
                    <span className="invoice-badge">{ret.invoice_no}</span>
                  </td>
                  <td className="text-center">
                    <span className="credit-badge">Credit</span>
                  </td>
                  <td className="text-center">{formatDate(ret.return_date)}</td>
                  <td className="text-center">
                    <span className="credit-no">{ret.tax_credit_no}</span>
                  </td>
                  <td className="text-right">{formatCurrency(ret.value_of_return)}</td>
                  <td className="text-right vat-amount">{formatCurrency(ret.vat_amount)}</td>

                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="7" className="text-right"><strong>Total:</strong></td>
              <td className="text-right"><strong>{formatCurrency(summary.total_return_value)}</strong></td>
              <td className="text-right vat-amount"><strong>{formatCurrency(summary.total_vat_credit)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Report Info */}
      <div className="report-info">
        <p>
          <strong>Report Period:</strong> {formatDate(startDate)} to {formatDate(endDate)}
        </p>
        <p>
          <strong>Generated On:</strong> {dayjs().format('DD MMM YYYY, h:mm A')}
        </p>
        <p>
          <strong>Note:</strong> This report includes only returns from VAT registered suppliers.
        </p>
      </div>
    </div>
  );
};

export default PurchaseVATReport;