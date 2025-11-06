// client/src/components/FinishedGoods/Reports/BakeryStockReport.jsx
import React, { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDownload, 
  faFileExcel, 
  faCalendar, 
  faCalculator, 
  faExclamationTriangle,
  faSyncAlt,
  faUtensils
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import './BakeryStockReport.css';

const BakeryStockReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBakeryStockReport = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/reports/bakery-stock?date=${selectedDate}`);
      setReportData(response.data);
    } catch (error) {
      console.error('Error fetching bakery stock report:', error);
      setError(error.response?.data?.error || 'Failed to fetch bakery stock report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (reportData.length === 0) {
      alert('No data to export');
      return;
    }

    const doc = new jsPDF();
    const dateStr = format(new Date(selectedDate), 'MMMM dd, yyyy');
    const prevDate = format(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate() - 1)), 'MMMM dd, yyyy');
    
    // Title
    doc.setFontSize(16);
    doc.text('Bakery Stock Report', 14, 15);
    
    // Date information
    doc.setFontSize(10);
    doc.text(`Report Date: ${dateStr}`, 14, 25);
    doc.text(`Opening Balance & Issuance Date: ${prevDate}`, 14, 32);
    doc.text(`Items shown: Only those issued to Bakery department`, 14, 39);

    // Table data
    const tableData = reportData.map(item => [
      item.item_code,
      item.item_name,
      item.unit,
      Number(item.opening_balance).toFixed(3),
      Number(item.previous_day_issuance).toFixed(3),
      Number(item.production_requirement).toFixed(3),
      Number(item.closing_balance).toFixed(3)
    ]);

    autoTable(doc, {
      head: [['Item Code', 'Item Name', 'Unit', 'Opening Balance', 'Previous Day Issuance', 'Production Requirement', 'Closing Balance']],
      body: tableData,
      startY: 45,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' }
      }
    });

    // Summary
    const finalY = doc.lastAutoTable.finalY + 10;
    if (finalY < 280) {
      const totalOpening = reportData.reduce((sum, item) => sum + Number(item.opening_balance), 0);
      const totalIssuance = reportData.reduce((sum, item) => sum + Number(item.previous_day_issuance), 0);
      const totalRequirement = reportData.reduce((sum, item) => sum + Number(item.production_requirement), 0);
      const totalClosing = reportData.reduce((sum, item) => sum + Number(item.closing_balance), 0);

      doc.setFontSize(10);
      doc.text('Summary:', 14, finalY);
      doc.text(`Total Opening: ${totalOpening.toFixed(3)}`, 14, finalY + 7);
      doc.text(`Total Issuance: ${totalIssuance.toFixed(3)}`, 14, finalY + 14);
      doc.text(`Total Requirement: ${totalRequirement.toFixed(3)}`, 14, finalY + 21);
      doc.text(`Total Closing: ${totalClosing.toFixed(3)}`, 14, finalY + 28);
    }

    doc.save(`bakery-stock-report-${selectedDate}.pdf`);
  };

  const downloadExcel = () => {
    if (reportData.length === 0) {
      alert('No data to export');
      return;
    }

    const prevDate = format(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate() - 1)), 'yyyy-MM-dd');
    
    const worksheetData = [
      ['Bakery Stock Report'],
      [`Report Date: ${selectedDate}`],
      [`Opening Balance & Issuance Date: ${prevDate}`],
      ['Note: Shows only items issued to Bakery department'],
      [],
      ['Item Code', 'Item Name', 'Unit', 'Opening Balance', 'Previous Day Issuance', 'Production Requirement', 'Closing Balance']
    ];

    reportData.forEach(item => {
      worksheetData.push([
        item.item_code,
        item.item_name,
        item.unit,
        Number(item.opening_balance),
        Number(item.previous_day_issuance),
        Number(item.production_requirement),
        Number(item.closing_balance)
      ]);
    });

    // Add summary
    const totalOpening = reportData.reduce((sum, item) => sum + Number(item.opening_balance), 0);
    const totalIssuance = reportData.reduce((sum, item) => sum + Number(item.previous_day_issuance), 0);
    const totalRequirement = reportData.reduce((sum, item) => sum + Number(item.production_requirement), 0);
    const totalClosing = reportData.reduce((sum, item) => sum + Number(item.closing_balance), 0);

    worksheetData.push([]);
    worksheetData.push(['SUMMARY', '', '', totalOpening, totalIssuance, totalRequirement, totalClosing]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bakery Stock Report');
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Item Code
      { wch: 30 }, // Item Name
      { wch: 10 }, // Unit
      { wch: 15 }, // Opening Balance
      { wch: 20 }, // Previous Day Issuance
      { wch: 20 }, // Production Requirement
      { wch: 15 }  // Closing Balance
    ];

    XLSX.writeFile(workbook, `bakery-stock-report-${selectedDate}.xlsx`);
  };

  // Calculate totals for display
  const totals = {
    opening: reportData.reduce((sum, item) => sum + Number(item.opening_balance), 0),
    issuance: reportData.reduce((sum, item) => sum + Number(item.previous_day_issuance), 0),
    requirement: reportData.reduce((sum, item) => sum + Number(item.production_requirement), 0),
    closing: reportData.reduce((sum, item) => sum + Number(item.closing_balance), 0)
  };

  return (
    <div className="bakery-report-container">
      <div className="report-header">
        <div className="header-content">
          <h2>
            <FontAwesomeIcon icon={faUtensils} className="header-icon" />
            Bakery Stock Report
          </h2>
          <p className="report-subtitle">
            Shows only items issued to Bakery department - Opening balances and issuances from previous day, production requirements from selected date
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="controls-section">
        <div className="date-control">
          <label htmlFor="report-date">
            <FontAwesomeIcon icon={faCalendar} /> Report Date
          </label>
          <input 
            id="report-date"
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="date-input"
          />
          <small className="date-help">
            Opening balance and issuance are from previous day | Shows only bakery-issued items
          </small>
        </div>

        <div className="action-buttons">
          <button 
            onClick={fetchBakeryStockReport}
            disabled={loading}
            className="btn btn-generate"
          >
            <FontAwesomeIcon icon={loading ? faSyncAlt : faCalculator} spin={loading} />
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          
          {reportData.length > 0 && (
            <>
              <button onClick={downloadPDF} className="btn btn-export">
                <FontAwesomeIcon icon={faDownload} /> PDF
              </button>
              <button onClick={downloadExcel} className="btn btn-export">
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <FontAwesomeIcon icon={faSyncAlt} spin size="2x" />
          <p>Generating bakery stock report...</p>
        </div>
      ) : reportData.length > 0 ? (
        <>
          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-label">Total Opening Balance</div>
              <div className="summary-value">{totals.opening.toFixed(3)}</div>
              <div className="summary-count">{reportData.length} items</div>
            </div>
            <div className="summary-card positive">
              <div className="summary-label">Total Issuance</div>
              <div className="summary-value">+{totals.issuance.toFixed(3)}</div>
              <div className="summary-count">
                {reportData.filter(item => item.previous_day_issuance > 0).length} items
              </div>
            </div>
            <div className="summary-card negative">
              <div className="summary-label">Total Requirement</div>
              <div className="summary-value">-{totals.requirement.toFixed(3)}</div>
              <div className="summary-count">
                {reportData.filter(item => item.production_requirement > 0).length} items
              </div>
            </div>
            <div className="summary-card total">
              <div className="summary-label">Total Closing Balance</div>
              <div className="summary-value">{totals.closing.toFixed(3)}</div>
              <div className="summary-count">{reportData.length} items</div>
            </div>
          </div>

          {/* Data Table */}
          <div className="table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Opening Balance</th>
                  <th>Previous Day Issuance</th>
                  <th>Production Requirement</th>
                  <th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((item) => (
                  <tr key={item.item_id}>
                    <td className="item-code">{item.item_code}</td>
                    <td className="item-name">{item.item_name}</td>
                    <td className="unit">{item.unit}</td>
                    <td className="number">{Number(item.opening_balance).toFixed(3)}</td>
                    <td className="number positive">+{Number(item.previous_day_issuance).toFixed(3)}</td>
                    <td className="number negative">-{Number(item.production_requirement).toFixed(3)}</td>
                    <td className="number closing">
                      {Number(item.closing_balance).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-totals">
                  <td colSpan="3"><strong>Grand Totals</strong></td>
                  <td><strong>{totals.opening.toFixed(3)}</strong></td>
                  <td><strong className="positive">+{totals.issuance.toFixed(3)}</strong></td>
                  <td><strong className="negative">-{totals.requirement.toFixed(3)}</strong></td>
                  <td><strong>{totals.closing.toFixed(3)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="report-info">
            <p>
              <strong>Note:</strong> This report shows only raw materials that were issued to the Bakery department on the previous day. 
              Opening balances and issuances are from {format(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate() - 1)), 'MMMM dd, yyyy')}, 
              while production requirements are from {format(new Date(selectedDate), 'MMMM dd, yyyy')}.
            </p>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <FontAwesomeIcon icon={faUtensils} size="3x" />
          <h3>No Bakery Items Found</h3>
          <p>No items were issued to the Bakery department on the previous day.</p>
          <small>
            Selected date: {selectedDate} | 
            Previous day: {format(new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate() - 1)), 'yyyy-MM-dd')}
          </small>
        </div>
      )}
    </div>
  );
};

export default BakeryStockReport;