import React, { useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import api from '../../api';
import PurchaseDetailsModal from '../purchase/PurchaseDetailsModal';
import { formatNumber } from '../../utils/formatters';
import './VATReport.css';

const VATReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [vatFilter, setVatFilter] = useState('all');
  
  // State for modal
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Format date to MM/DD/YYYY (with 4-digit year)
  const formatDateMMDDYYYY = (dateString) => {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const fetchVATReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      const purchases = response.data;

      const detailedPurchases = await Promise.all(
        purchases.map(async (purchase) => {
          try {
            const detailResponse = await api.get(`/purchases/${purchase.id}`);
            return detailResponse.data;
          } catch (error) {
            console.error(`Error fetching details for purchase ${purchase.id}:`, error);
            return { ...purchase, items: [] };
          }
        })
      );

      setReportData(detailedPurchases);
    } catch (error) {
      console.error('Error fetching VAT report:', error);
      alert('Failed to fetch VAT report');
    } finally {
      setLoading(false);
    }
  };

  /* Handle VAT filter change */
  const handleVatFilterChange = (e) => {
    setVatFilter(e.target.value);
  };

  // Handle row click to open modal
  const handleRowClick = (purchaseId) => {
    setSelectedPurchaseId(purchaseId);
    setShowModal(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedPurchaseId(null);
  };

  // Process data for VAT report - Group by invoice
  const processVATData = () => {
    const vatData = [];
    const invoiceMap = new Map();

    reportData.forEach(purchase => {
      // Check if we already have this invoice
      if (invoiceMap.has(purchase.id)) {
        return;
      }

      let totalNetAmount = 0;
      let totalVATAmount = 0;
      let totalDisallowableVAT = 0;

      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          const amount = parseFloat(item.quantity) * parseFloat(item.unit_price);
          const vatAmount = amount * 0.18;
          const vatApplicable = item.vat_applicable !== undefined ? item.vat_applicable : true;
          
          totalNetAmount += amount;
          
          // Check if VAT is applicable for this item
          if (vatApplicable) {
            totalVATAmount += vatAmount;
          } else {
            // If VAT is not applicable for this item, add to disallowable VAT
            totalDisallowableVAT += vatAmount;
          }
        });
      } else {
        // Handle case where items might be in a different structure
        const netAmount = parseFloat(purchase.bill_amount || 0) - parseFloat(purchase.vat_amount || 0);
        const vatAmount = parseFloat(purchase.vat_amount || 0);
        totalNetAmount = netAmount;
        totalVATAmount = vatAmount;
        totalDisallowableVAT = 0;
      }

      const invoiceData = {
        purchaseId: purchase.id,
        invoiceDate: purchase.purchase_date,
        invoiceNo: purchase.invoice_no,
        supplierTIN: purchase.supplier_vat_number || '—',
        supplierName: purchase.supplier_name,
        netAmount: totalNetAmount,
        vatAmount: totalVATAmount,
        disallowableVATAmount: totalDisallowableVAT
      };

      invoiceMap.set(purchase.id, invoiceData);
      vatData.push(invoiceData);
    });

    // VAT FILTER APPLY
    let filteredData = vatData;

    if (vatFilter === 'yes') {
      filteredData = vatData.filter(item => item.vatAmount > 0);
    }

    if (vatFilter === 'no') {
      filteredData = vatData.filter(item => item.vatAmount === 0);
    }

    return filteredData;
  };

  const downloadExcel = () => {
    const vatData = processVATData();
    
    if (vatData.length === 0) {
      alert('No data to export. Please generate the report first.');
      return;
    }

    const worksheetData = [];

    worksheetData.push([
      'Invoice Date (MM/DD/YYYY)',
      'Invoice No',
      'Supplier TIN Number',
      'Name of Supplier',
      'Net Amount (Rs.)',
      'VAT Amount (18%) (Rs.)',
      'Disallowable VAT Amount (Rs.)'
    ]);

    vatData.forEach(item => {
      worksheetData.push([
        formatDateMMDDYYYY(item.invoiceDate),
        item.invoiceNo,
        item.supplierTIN,
        item.supplierName,
        formatNumber(item.netAmount, 2, 2),
        formatNumber(item.vatAmount, 2, 2),
        formatNumber(item.disallowableVATAmount, 2, 2)
      ]);
    });

    worksheetData.push([]);

    const totalNetAmount = vatData.reduce((sum, item) => sum + item.netAmount, 0);
    const totalVATAmount = vatData.reduce((sum, item) => sum + item.vatAmount, 0);
    const totalDisallowableVAT = vatData.reduce((sum, item) => sum + item.disallowableVATAmount, 0);
    
    worksheetData.push([
      'TOTAL',
      '',
      '',
      '',
      formatNumber(totalNetAmount, 2, 2),
      formatNumber(totalVATAmount, 2, 2),
      formatNumber(totalDisallowableVAT, 2, 2)
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'VAT Report');
    const fileName = `vat-report-${startDate}-to-${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const vatData = processVATData();

  const totalNetAmount = vatData.reduce((sum, item) => sum + item.netAmount, 0);
  const totalVATAmount = vatData.reduce((sum, item) => sum + item.vatAmount, 0);
  const totalDisallowableVAT = vatData.reduce((sum, item) => sum + item.disallowableVATAmount, 0);

  return (
    <div className="vat-report-container">
      <div className="report-header">
        <h2>VAT Purchasing Report</h2>
        {vatData.length > 0 && (
          <button onClick={downloadExcel} className="btn btn-success">
            <span>📊</span> Export to Excel
          </button>
        )}
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label>Start Date</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="control-input"
          />
        </div>

        <div className="control-group">
          <label>End Date</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="control-input"
          />
        </div>

        <div className="control-group">
          <label>Company</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="control-input"
          >
            <option value="">All Companies</option>
            <option value="1">JH</option>
            <option value="2">RR</option>
            <option value="3">Delights</option>
          </select>
        </div>

        <button 
          onClick={fetchVATReport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <div className="loading-spinner"></div>
              Generating...
            </>
          ) : (
            'Generate VAT Report'
          )}
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          Loading VAT report data...
        </div>
      ) : vatData.length > 0 ? (
        <>
          <div className="table-container">
            <table className="vat-report-table">
              <thead>
                <tr>
                  <th>Invoice Date</th>
                  <th>Invoice No</th>
                  <th>Supplier TIN Number</th>
                  <th>Name of Supplier</th>
                  <th className="amount-col">Net Amount (Rs.)</th>
                  <th className="amount-col">VAT Amount (18%) (Rs.)</th>
                  <th className="amount-col">Disallowable VAT Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {vatData.map((item, index) => (
                  <tr 
                    key={`${item.invoiceNo}-${index}`}
                    onClick={() => handleRowClick(item.purchaseId)}
                    className="clickable-row"
                    title="Click to view full purchase details"
                  >
                    <td>{formatDateMMDDYYYY(item.invoiceDate)}</td>
                    <td>{item.invoiceNo}</td>
                    <td>{item.supplierTIN}</td>
                    <td>{item.supplierName}</td>
                    <td className="amount-col">{formatNumber(item.netAmount, 2, 2)}</td>
                    <td className="amount-col vat-amount">{formatNumber(item.vatAmount, 2, 2)}</td>
                    <td className="amount-col disallowable-vat-amount">{formatNumber(item.disallowableVATAmount, 2, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" className="text-right"><strong>TOTAL</strong></td>
                  <td className="amount-col"><strong>{formatNumber(totalNetAmount, 2, 2)}</strong></td>
                  <td className="amount-col vat-amount"><strong>{formatNumber(totalVATAmount, 2, 2)}</strong></td>
                  <td className="amount-col disallowable-vat-amount"><strong>{formatNumber(totalDisallowableVAT, 2, 2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="report-summary">
            <div className="summary-card">
              <h3>Summary</h3>
              <div className="summary-column">
                <span>Total Net Amount:</span>
                <span>Rs. {formatNumber(totalNetAmount, 2, 2)}</span>
              </div>
              <div className="summary-column vat">
                <span>Total VAT (18%):</span>
                <span>Rs. {formatNumber(totalVATAmount, 2, 2)}</span>
              </div>
              <div className="summary-column disallowable-vat">
                <span>Total Disallowable VAT:</span>
                <span>Rs. {formatNumber(totalDisallowableVAT, 2, 2)}</span>
              </div>
              <div className="summary-column total">
                <span>Total with VAT:</span>
                <span>Rs. {formatNumber(totalNetAmount + totalVATAmount, 2, 2)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No data to display. Select a date range and generate the report.</p>
        </div>
      )}

      {/* Modal for Purchase Details */}
      {showModal && selectedPurchaseId && (
        <PurchaseDetailsModal 
          purchaseId={selectedPurchaseId} 
          onClose={handleCloseModal} 
        />
      )}
    </div>
  );
};

export default VATReport;