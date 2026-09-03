import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileExcel, faCalendar, faFilter } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import api from '../../api';
import './DepartmentUsageReport.css';
import { formatNumber, formatQuantity } from '../../utils/formatters';

const DepartmentUsageReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01')); // First day of current month
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd')); // Today
  const [reportData, setReportData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch items for dropdown
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await api.get('/items');
        setItems(response.data.map(item => ({
          value: item.id,
          label: `${item.item_code} - ${item.name}`,
          data: item
        })));
      } catch (error) {
        console.error('Error fetching items:', error);
      }
    };
    fetchItems();
  }, []);

  // Filter data when search term or selected item changes
  useEffect(() => {
    let filtered = reportData;

    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedItem) {
      filtered = filtered.filter(item => item.item_code === selectedItem.data.item_code);
    }

    setFilteredData(filtered);
  }, [reportData, searchTerm, selectedItem]);

  const generateReport = async () => {
    if (!startDate || !endDate) {
      alert('Please select start date and end date');
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/department-usage-report', {
        params: { startDate, endDate }
      });
      setReportData(response.data);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate department usage report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    const doc = new jsPDF();
    const dateRange = `${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`;

    // Title
    doc.setFontSize(16);
    doc.text('Department Usage Report', 14, 15);
    
    // Date range
    doc.setFontSize(12);
    doc.text(`Date Range: ${dateRange}`, 14, 25);

    // Table data
    const tableData = filteredData.map(item => [
      item.item_code,
      item.item_name,
      item.unit,
      formatQuantity(item.opening_balance),
      `-${formatQuantity(item.bakery)}`,
      `-${formatQuantity(item.pastry)}`,
      `-${formatQuantity(item.savory)}`,
      `-${formatQuantity(item.cake)}`,
      formatQuantity(item.due_balance)
    ]);

    autoTable(doc, {
      head: [['Item Code', 'Item Name', 'Unit', 'Opening', 'Bakery', 'Pastry', 'Savory', 'Cake', 'Due Balance']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        3: { halign: 'right' }, // Opening balance
        4: { halign: 'right', textColor: [255, 0, 0] }, // Bakery (red for negative)
        5: { halign: 'right', textColor: [255, 0, 0] }, // Pastry
        6: { halign: 'right', textColor: [255, 0, 0] }, // Savory
        7: { halign: 'right', textColor: [255, 0, 0] }, // Cake
        8: { halign: 'right' } // Due balance
      }
    });

    // Totals
    const totals = calculateTotals();
    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.text(`Total Opening Balance: ${formatQuantity(totals.opening)}`, 14, finalY);
    doc.text(`Total Due Balance: ${formatQuantity(totals.due)}`, 14, finalY + 7);

    doc.save(`department-usage-report-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    const worksheetData = [
      ['Department Usage Report'],
      [`Date Range: ${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`],
      [],
      ['Item Code', 'Item Name', 'Unit', 'Opening Balance', 'Bakery', 'Pastry', 'Savory', 'Cake', 'Due Balance']
    ];

    filteredData.forEach(item => {
      worksheetData.push([
        item.item_code,
        item.item_name,
        item.unit,
        item.opening_balance,
        -item.bakery, // Negative values for issuance
        -item.pastry,
        -item.savory,
        -item.cake,
        item.due_balance
      ]);
    });

    // Add totals
    const totals = calculateTotals();
    worksheetData.push([]);
    worksheetData.push(['TOTALS', '', '', totals.opening, -totals.bakery, -totals.pastry, -totals.savory, -totals.cake, totals.due]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Department Usage Report');

    // Style the totals row
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    worksheet['!merges'].push({ s: { r: worksheetData.length - 1, c: 0 }, e: { r: worksheetData.length - 1, c: 2 } });

    XLSX.writeFile(workbook, `department-usage-report-${startDate}-to-${endDate}.xlsx`);
  };

  const calculateTotals = () => {
    return filteredData.reduce((totals, item) => ({
      opening: totals.opening + item.opening_balance,
      bakery: totals.bakery + item.bakery,
      pastry: totals.pastry + item.pastry,
      savory: totals.savory + item.savory,
      cake: totals.cake + item.cake,
      due: totals.due + item.due_balance
    }), {
      opening: 0,
      bakery: 0,
      pastry: 0,
      savory: 0,
      cake: 0,
      due: 0
    });
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedItem(null);
  };

  const totals = calculateTotals();

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
        <h2 style={{ textAlign: 'left', margin: 0 }}>Department Usage Report</h2>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Track item usage across departments with opening and due balances</p>
      </header>

      {/* Controls Section */}
      <div className="filters-section">
          <div className="report-filter-group">
            <label className="report-filter-label">
              <FontAwesomeIcon icon={faCalendar} /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
              className="report-filter-input"
            />
          </div>

          <div className="report-filter-group">
            <label className="report-filter-label">
              <FontAwesomeIcon icon={faCalendar} /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="report-filter-input"
            />
          </div>

          <div className="report-filter-group" style={{ flex: '1 1 200px' }}>
            <label className="report-filter-label">
              <FontAwesomeIcon icon={faFilter} /> Filter by Item
            </label>
            <Select
              options={items}
              value={selectedItem}
              onChange={setSelectedItem}
              isClearable
              placeholder="Search items..."
              className="react-select-container"
              classNamePrefix="react-select"
            />
          </div>

        <div className="report-filter-actions">
          <button
            onClick={generateReport}
            disabled={loading}
            className="btn btn-primary generate-btn"
          >
            {loading ? (
              <>
                <div className="loading-spinner"></div>
                Generating...
              </>
            ) : (
              'Generate Report'
            )}
          </button>

          {(searchTerm || selectedItem) && (
            <button
              onClick={clearFilters}
              className="btn btn-secondary"
            >
              Clear Filters
            </button>
          )}

          {filteredData.length > 0 && (
            <>
              <button onClick={downloadPDF} className="btn btn-success">
                <FontAwesomeIcon icon={faDownload} /> PDF
              </button>
              <button onClick={downloadExcel} className="btn btn-success">
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {filteredData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)' }}>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">Total Items</div>
            <div className="report-summary-value">{formatNumber(filteredData.length)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">Total Opening</div>
            <div className="report-summary-value">{formatQuantity(totals.opening)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">Total Due</div>
            <div className="report-summary-value">{formatQuantity(totals.due)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">Total Issued</div>
            <div className="report-summary-value text-danger">
              {formatQuantity(totals.bakery + totals.pastry + totals.savory + totals.cake)}
            </div>
          </div>
        </div>
      )}

      {/* Report Table */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          Loading department usage report...
        </div>
      ) : filteredData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="report-table department-usage-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Unit</th>
                <th>Opening Balance</th>
                <th>Bakery</th>
                <th>Pastry</th>
                <th>Savory</th>
                <th>Cake</th>
                <th>Due Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => (
                <tr key={index}>
                  <td className="item-code">{item.item_code}</td>
                  <td className="item-name">{item.item_name}</td>
                  <td className="unit">{item.unit}</td>
                  <td className="opening-balance">{formatQuantity(item.opening_balance)}</td>
                  <td className="issuance negative">-{formatQuantity(item.bakery)}</td>
                  <td className="issuance negative">-{formatQuantity(item.pastry)}</td>
                  <td className="issuance negative">-{formatQuantity(item.savory)}</td>
                  <td className="issuance negative">-{formatQuantity(item.cake)}</td>
                  <td className={`due-balance ${item.due_balance < 0 ? 'negative' : item.due_balance === 0 ? 'zero' : 'positive'}`}>
                    {formatQuantity(item.due_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan="3"><strong>Totals</strong></td>
                <td><strong>{formatQuantity(totals.opening)}</strong></td>
                <td className="negative"><strong>-{formatQuantity(totals.bakery)}</strong></td>
                <td className="negative"><strong>-{formatQuantity(totals.pastry)}</strong></td>
                <td className="negative"><strong>-{formatQuantity(totals.savory)}</strong></td>
                <td className="negative"><strong>-{formatQuantity(totals.cake)}</strong></td>
                <td><strong>{formatQuantity(totals.due)}</strong></td>
              </tr>
            </tfoot>
            </table>
          </div>
        </div>
      ) : reportData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No Report Generated</h3>
          <p>Select a date range and generate the department usage report to view data.</p>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No Matching Items</h3>
          <p>No items match your current filters. Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
};

export default DepartmentUsageReport;
