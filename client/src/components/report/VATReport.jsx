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
  const [descriptionFilter, setDescriptionFilter] = useState('all');
  const [vatFilter, setVatFilter] = useState('all');

  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}&vatOnly=true`);
      const reportRows = Array.isArray(response.data) ? response.data : [];

      const detailedPurchases = await Promise.all(
        reportRows
          .filter((row) => row.source !== 'expense')
          .map(async (purchase) => {
            try {
              const detailResponse = await api.get(`/purchases/${purchase.id}`);
              return {
                ...detailResponse.data,
                source: 'purchase',
                description: 'Purchases',
                purchaseId: detailResponse.data.id
              };
            } catch (error) {
              console.error(`Error fetching details for purchase ${purchase.id}:`, error);
              return {
                ...purchase,
                items: [],
                source: 'purchase',
                description: 'Purchases',
                purchaseId: purchase.id
              };
            }
          })
      );

      const expenseRows = reportRows
        .filter((row) => row.source === 'expense')
        .map((expense) => ({
          ...expense,
          id: expense.id,
          purchaseId: expense.id,
          invoiceDate: expense.purchase_date,
          invoiceNo: expense.invoice_no,
          supplierTIN: expense.supplier_vat_number || '—',
          supplierName: expense.supplier_name,
          netAmount: parseFloat(expense.net_amount || 0),
          vatAmount: parseFloat(expense.vat_amount || 0),
          disallowableVATAmount: 0,
          description: 'Expense',
          isExpense: true
        }));

      setReportData([...detailedPurchases, ...expenseRows]);
    } catch (error) {
      console.error('Error fetching VAT report:', error);
      alert('Failed to fetch VAT report');
    } finally {
      setLoading(false);
    }
  };

  const handleVatFilterChange = (e) => {
    setVatFilter(e.target.value);
  };

  const handleDescriptionFilterChange = (e) => {
    setDescriptionFilter(e.target.value);
  };

  const handleRowClick = (purchaseId) => {
    setSelectedPurchaseId(purchaseId);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedPurchaseId(null);
  };

  const processVATData = () => {
    const vatData = [];
    const invoiceMap = new Map();

    reportData.forEach((entry) => {
      const invoiceKey = entry.source === 'expense' ? `expense-${entry.id}` : entry.id;
      if (invoiceMap.has(invoiceKey)) {
        return;
      }

      let totalNetAmount = 0;
      let totalVATAmount = 0;
      let totalDisallowableVAT = 0;
      let invoiceDate = entry.purchase_date || entry.invoiceDate || entry.bill_date;
      let invoiceNo = entry.invoice_no || entry.bill_number || entry.invoiceNo || 'N/A';
      let supplierTIN = entry.supplier_vat_number || entry.supplierTIN || '—';
      let supplierName = entry.supplier_name || entry.supplierName || 'Expense';
      let description = entry.description || (entry.source === 'expense' ? 'Expense' : 'Purchases');
      let purchaseId = entry.purchaseId || entry.id;

      if (entry.source === 'expense') {
        totalNetAmount = parseFloat(entry.netAmount || entry.net_amount || 0);
        totalVATAmount = parseFloat(entry.vatAmount || entry.vat_amount || 0);
        totalDisallowableVAT = 0;
      } else if (entry.items && entry.items.length > 0) {
        entry.items.forEach((item) => {
          const amount = parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0);
          const vatAmount = amount * 0.18;
          const vatApplicable = item.vat_applicable !== undefined ? item.vat_applicable : true;

          totalNetAmount += amount;

          if (vatApplicable) {
            totalVATAmount += vatAmount;
          } else {
            totalDisallowableVAT += vatAmount;
          }
        });
      } else {
        const netAmount = parseFloat(entry.bill_amount || 0) - parseFloat(entry.vat_amount || 0);
        const vatAmount = parseFloat(entry.vat_amount || 0);
        totalNetAmount = netAmount;
        totalVATAmount = vatAmount;
        totalDisallowableVAT = 0;
      }

      const invoiceData = {
        purchaseId,
        invoiceDate,
        invoiceNo,
        supplierTIN,
        supplierName,
        description,
        netAmount: totalNetAmount,
        vatAmount: totalVATAmount,
        disallowableVATAmount: totalDisallowableVAT,
        isExpense: entry.source === 'expense'
      };

      invoiceMap.set(invoiceKey, invoiceData);
      vatData.push(invoiceData);
    });

    let filteredData = vatData;

    if (descriptionFilter !== 'all') {
      filteredData = filteredData.filter((item) => item.description === descriptionFilter);
    }

    if (vatFilter === 'yes') {
      filteredData = filteredData.filter((item) => item.vatAmount > 0);
    }

    if (vatFilter === 'no') {
      filteredData = filteredData.filter((item) => item.vatAmount === 0);
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
      'Invoice No',
      'Supplier TIN Number',
      'Name of Supplier',
      'Description',
      'Net Amount (Rs.)',
      'VAT Amount (18%) (Rs.)',
      'Disallowable VAT Amount (Rs.)'
    ]);

    vatData.forEach((item) => {
      worksheetData.push([
        item.invoiceNo,
        item.supplierTIN,
        item.supplierName,
        item.description,
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
      { wch: 22 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 }
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
            <option value="3">RD</option>
          </select>
        </div>

        <div className="control-group">
          <label>Description</label>
          <select
            value={descriptionFilter}
            onChange={handleDescriptionFilterChange}
            className="control-input"
          >
            <option value="all">All</option>
            <option value="Purchases">Purchases</option>
            <option value="Expense">Expense</option>
          </select>
        </div>

        <div className="control-group">
          <label>VAT</label>
          <select
            value={vatFilter}
            onChange={handleVatFilterChange}
            className="control-input"
          >
            <option value="all">All</option>
            <option value="yes">Has VAT</option>
            <option value="no">No VAT</option>
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
              <colgroup>
                <col style={{ width: '140px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '220px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-left">Invoice No</th>
                  <th className="text-left">Supplier TIN Number</th>
                  <th className="text-left">Name of Supplier</th>
                  <th className="text-left">Description</th>
                  <th className="amount-col">Net Amount (Rs.)</th>
                  <th className="amount-col">VAT Amount (18%) (Rs.)</th>
                  <th className="amount-col">Disallowable VAT Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {vatData.map((item, index) => (
                  <tr
                    key={`${item.invoiceNo}-${index}`}
                    onClick={item.isExpense ? undefined : () => handleRowClick(item.purchaseId)}
                    className={item.isExpense ? '' : 'clickable-row'}
                    title={item.isExpense ? '' : 'Click to view full purchase details'}
                  >
                    <td className="text-left">{item.invoiceNo}</td>
                    <td className="text-left">{item.supplierTIN}</td>
                    <td className="text-left">{item.supplierName}</td>
                    <td className="text-left">{item.description}</td>
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