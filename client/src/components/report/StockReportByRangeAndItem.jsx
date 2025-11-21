//src/components/report/StockReportByRangeAndItem.jsx

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileExcel, faCalendar, faChartLine, faEye, faSearch } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './StockReport.css';   

// Transaction Details Modal Component
const TransactionDetailsModal = ({ date, itemId, itemName, onClose }) => {
  const [transactions, setTransactions] = useState({
    purchases: [],
    issuances: [],
    wastages: [],
    returns: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactionDetails = async () => {
      try {
        const [purchasesRes, issuancesRes, wastagesRes, returnsRes] = await Promise.all([
          api.get(`/reports/daily-transactions/purchases`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/issuances`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/wastages`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/returns`, { params: { date, itemId }}),
        ]);

        setTransactions({
          purchases: purchasesRes.data,
          issuances: issuancesRes.data,
          wastages: wastagesRes.data,
          returns: returnsRes.data,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionDetails();
  }, [date, itemId]);

  if (loading) return <div className="modal-loading">Loading...</div>;

  return (
    <div className="modern-modal-overlay" onClick={onClose}>
      <div className="modern-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modern-modal-header">
          <div>
            <h2>Transaction Details</h2>
            <p className="modal-subtitle">
              {format(new Date(date), "MMMM dd, yyyy")} • {itemName}
            </p>
          </div>
          <button className="modern-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Scrollable Content */}
        <div className="modern-modal-body">

          {/* SECTION: PURCHASES */}
          <div className="modal-section">
            <div className="modal-section-title purchases-bg">
              📦 Purchases ({transactions.purchases.length})
            </div>

            {transactions.purchases.length > 0 ? (
              <div className="modern-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Supplier</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.purchases.map((p, i) => (
                      <tr key={i}>
                        <td>{p.invoice_no}</td>
                        <td>{p.supplier_name}</td>
                        <td>{Number(p.quantity).toFixed(3)}</td>
                        <td>{Number(p.unit_price).toFixed(2)}</td>
                        <td>{Number(p.total_price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No purchases recorded</p>}
          </div>

          {/* SECTION: ISSUANCES */}
          <div className="modal-section">
            <div className="modal-section-title issuance-bg">
              📤 Issuances ({transactions.issuances.length})
            </div>
            
            {transactions.issuances.length > 0 ? (
              <div className="modern-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Department</th>
                      <th>Received By</th>
                      <th>Qty</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.issuances.map((i, idx) => (
                      <tr key={idx}>
                        <td>ISS-{i.issuance_id}</td>
                        <td>{i.department_name}</td>
                        <td>{i.received_by}</td>
                        <td>{Number(i.quantity).toFixed(3)}</td>
                        <td>{i.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No issuances recorded</p>}
          </div>

          {/* SECTION: WASTAGE */}
          <div className="modal-section">
            <div className="modal-section-title wastage-bg">
              🗑️ Wastages ({transactions.wastages.length})
            </div>

            {transactions.wastages.length > 0 ? (
              <div className="modern-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th>Approved By</th>
                      <th>Reason</th>
                      <th>Qty</th>
                      <th>Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.wastages.map((w, idx) => (
                      <tr key={idx}>
                        <td>{w.wastage_note_number}</td>
                        <td>{w.approved_by}</td>
                        <td>{w.reason}</td>
                        <td>{Number(w.quantity).toFixed(3)}</td>
                        <td>{Number(w.estimated_loss).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No wastages recorded</p>}
          </div>

          {/* SECTION: RETURNS */}
          <div className="modal-section">
            <div className="modal-section-title returns-bg">
              🔄 Returns ({transactions.returns.length})
            </div>

            {transactions.returns.length > 0 ? (
              <div className="modern-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Department</th>
                      <th>Received By</th>
                      <th>Qty</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.returns.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.return_number}</td>
                        <td>{r.department_name}</td>
                        <td>{r.received_by}</td>
                        <td>{Number(r.quantity).toFixed(3)}</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No returns recorded</p>}
          </div>

        </div>
      </div>
    </div>
  );
};

const StockReportByRangeAndItem = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await api.get('/items');
        const itemsData = res.data.map(item => ({
          value: item.id,
          label: `${item.item_code} - ${item.name}`,
          data: item
        }));
        setItems(itemsData);
      } catch (err) {
        console.error('Failed to fetch items:', err);
      }
    };
    fetchItems();
  }, []);

  const fetchStockReport = async () => {
    if (!startDate || !endDate || !selectedItem) {
      alert('Please select start date, end date, and item.');
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date cannot be after end date.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/reports/stock-range-item`, {
        params: { startDate, endDate, itemId: selectedItem.value }
      });
      setStockData(res.data);
    } catch (err) {
      console.error(err);
      alert('Error fetching stock data');
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (rowData) => {
    if (selectedItem) {
      setSelectedTransaction({
        date: rowData.date,
        itemId: selectedItem.value,
        itemName: selectedItem.label
      });
    }
  };

  const downloadPDF = () => {
    if (stockData.length === 0) {
      alert('No data to export');
      return;
    }

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('STOCK MOVEMENT REPORT', 105, 15, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    const itemLabel = selectedItem ? selectedItem.label : 'Selected Item';
    doc.text(`Item: ${itemLabel}`, 105, 22, { align: 'center' });
    
    // Date range
    const rangeStr = `Period: ${format(new Date(startDate), 'MMM dd, yyyy')} to ${format(new Date(endDate), 'MMM dd, yyyy')}`;
    doc.text(rangeStr, 105, 28, { align: 'center' });
    
    // Generated date
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 105, 34, { align: 'center' });

    // Table
    autoTable(doc, {
      head: [
        ['Date', 'Opening', 'Purchased', 'Issued', 'Wasted', 'Returned', 'Closing', 'Net Change']
      ],
      body: stockData.map(r => {
        const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + Number(r.returned);
        return [
          format(new Date(r.date), 'MMM dd, yyyy'),
          Number(r.opening).toFixed(3),
          Number(r.purchased).toFixed(3),
          Number(r.issued).toFixed(3),
          Number(r.wasted).toFixed(3),
          Number(r.returned).toFixed(3),
          Number(r.closing).toFixed(3),
          netChange.toFixed(3)
        ];
      }),
      startY: 40,
      styles: { 
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: { 
        fillColor: [40, 116, 166],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: 18 },
        6: { cellWidth: 18 },
        7: { cellWidth: 18 }
      }
    });

    // Summary section
    const finalY = doc.lastAutoTable.finalY + 10;
    if (finalY < 280) {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.setFont(undefined, 'bold');
      doc.text('SUMMARY', 14, finalY);
      
      doc.setFont(undefined, 'normal');
      const summary = calculateSummary();
      
      doc.text(`Total Purchased: ${summary.totalPurchased.toFixed(3)}`, 14, finalY + 8);
      doc.text(`Total Issued: ${summary.totalIssued.toFixed(3)}`, 14, finalY + 16);
      doc.text(`Total Wasted: ${summary.totalWasted.toFixed(3)}`, 14, finalY + 24);
      doc.text(`Total Returned: ${summary.totalReturned.toFixed(3)}`, 14, finalY + 32);
      doc.text(`Average Closing Balance: ${summary.avgClosing.toFixed(3)}`, 14, finalY + 40);
    }

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, 200, 290, { align: 'right' });
    }

    const fileName = `StockReport_${selectedItem.value}_${startDate}_to_${endDate}.pdf`;
    doc.save(fileName);
  };

  const downloadExcel = () => {
    if (stockData.length === 0) {
      alert('No data to export');
      return;
    }

    // Prepare worksheet data
    const worksheetData = [
      ['STOCK MOVEMENT REPORT'],
      [`Item: ${selectedItem ? selectedItem.label : ''}`],
      [`Period: ${format(new Date(startDate), 'MMM dd, yyyy')} to ${format(new Date(endDate), 'MMM dd, yyyy')}`],
      [`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`],
      [''], // Empty row for spacing
      ['Date', 'Opening Balance', 'Purchased', 'Issued', 'Wasted', 'Returned', 'Closing Balance', 'Net Change']
    ];

    // Add data rows
    stockData.forEach(r => {
      const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + Number(r.returned);
      worksheetData.push([
        format(new Date(r.date), 'MMM dd, yyyy'),
        Number(r.opening),
        Number(r.purchased),
        Number(r.issued),
        Number(r.wasted),
        Number(r.returned),
        Number(r.closing),
        netChange
      ]);
    });

    // Add summary section
    const summary = calculateSummary();
    worksheetData.push(['']);
    worksheetData.push(['SUMMARY']);
    worksheetData.push(['Total Purchased:', summary.totalPurchased]);
    worksheetData.push(['Total Issued:', summary.totalIssued]);
    worksheetData.push(['Total Wasted:', summary.totalWasted]);
    worksheetData.push(['Total Returned:', summary.totalReturned]);
    worksheetData.push(['Average Closing Balance:', summary.avgClosing]);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Apply styles through cell references
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    // Title styling
    for (let i = 0; i <= 4; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: i, c: 0 });
      if (!worksheet[cellRef]) continue;
      worksheet[cellRef].s = {
        font: { bold: true, sz: i === 0 ? 14 : 11 },
        alignment: { horizontal: 'left' }
      };
    }

    // Header row styling
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 5, c: col });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "2874A6" } },
          alignment: { horizontal: 'center' }
        };
      }
    }

    // Summary styling
    for (let i = worksheetData.length - 6; i < worksheetData.length; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: i, c: 0 });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
          alignment: { horizontal: 'left' }
        };
      }
    }

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Date
      { wch: 15 }, // Opening
      { wch: 12 }, // Purchased
      { wch: 12 }, // Issued
      { wch: 12 }, // Wasted
      { wch: 12 }, // Returned
      { wch: 15 }, // Closing
      { wch: 12 }  // Net Change
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');

    // Generate file name and save
    const itemLabel = selectedItem ? selectedItem.label.replace(/[^\w\s]/gi, '') : 'Item';
    const fileName = `stock-report-${itemLabel}-${startDate}-to-${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const calculateSummary = () => {
    if (stockData.length === 0) {
      return {
        totalPurchased: 0,
        totalIssued: 0,
        totalWasted: 0,
        totalReturned: 0,
        avgClosing: 0
      };
    }

    return {
      totalPurchased: stockData.reduce((sum, day) => sum + Number(day.purchased), 0),
      totalIssued: stockData.reduce((sum, day) => sum + Number(day.issued), 0),
      totalWasted: stockData.reduce((sum, day) => sum + Number(day.wasted), 0),
      totalReturned: stockData.reduce((sum, day) => sum + Number(day.returned), 0),
      avgClosing: stockData.reduce((sum, day) => sum + Number(day.closing), 0) / stockData.length
    };
  };

  const summary = calculateSummary();

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>
          <FontAwesomeIcon icon={faChartLine} style={{ marginRight: '12px', color: '#007acc' }} />
          Item-wise Stock Trend
        </h2>
        <p className="report-subtitle">Analyze stock movements for specific items over time</p>
      </div>

      {/* Single Row Layout for Controls */}
      <div className="controls-row">
        {/* Start Date */}
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> Start Date
          </label>
          <input 
            type="date" 
            max={endDate} 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className="date-input"
          />
        </div>

        {/* End Date */}
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> End Date
          </label>
          <input 
            type="date" 
            min={startDate} 
            max={today} 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className="date-input"
          />
        </div>

        {/* Item Selection with Search */}
        <div className="form-group item-search-container">
          <label>
            <FontAwesomeIcon icon={faSearch} /> ITEM SELECTION
          </label>
          <Select
            options={items}
            value={selectedItem}
            onChange={setSelectedItem}
            isClearable
            placeholder="Search items by code or name..."
            className="react-select-container"
            classNamePrefix="react-select"
            styles={{
              control: (base) => ({
                ...base,
                minHeight: '48px',
                border: '2px solid #e9ecef',
                borderRadius: '8px',
                '&:hover': {
                  borderColor: '#007acc'
                }
              }),
              placeholder: (base) => ({
                ...base,
                color: '#6c757d',
                fontSize: '14px'
              })
            }}
          />
        </div>

        {/* Action Buttons */}
        <div className="form-group action-buttons-container">
          <label style={{ opacity: 0, pointerEvents: 'none' }}>Actions</label>
          <div className="action-buttons-row">
            <button 
              onClick={fetchStockReport} 
              disabled={loading || !selectedItem}
              className="btn btn-generate"
            >
              {loading ? 'Generating Report...' : 'Generate Trend Report'}
            </button>
            
            {stockData.length > 0 && (
              <>
                <button onClick={downloadPDF} className="btn btn-pdf">
                  <FontAwesomeIcon icon={faDownload} /> Export PDF
                </button>
                <button onClick={downloadExcel} className="btn btn-excel">
                  <FontAwesomeIcon icon={faFileExcel} /> Export Excel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && stockData.length > 0 && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">TOTAL PURCHASED</div>
            <div className="summary-value positive">{summary.totalPurchased.toFixed(3)}</div>
          </div>
          
          <div className="summary-card warning">
            <div className="summary-label">TOTAL ISSUED</div>
            <div className="summary-value negative">{summary.totalIssued.toFixed(3)}</div>
          </div>
          
          <div className="summary-card danger">
            <div className="summary-label">TOTAL WASTED</div>
            <div className="summary-value negative">{summary.totalWasted.toFixed(3)}</div>
          </div>

          <div className="summary-card positive">
            <div className="summary-label">TOTAL RETURNED</div>
            <div className="summary-value positive">{summary.totalReturned.toFixed(3)}</div>
          </div>
          
          <div className="summary-card info">
            <div className="summary-label">AVG CLOSING BALANCE</div>
            <div className="summary-value">{summary.avgClosing.toFixed(3)}</div>
          </div>
        </div>
      )}

      {/* Data Table */}
      {loading ? (
        <div className="loading">Loading stock trend data...</div>
      ) : stockData.length > 0 ? (
        <div className="table-container">
          <table className="report-table clickable-rows">
            <thead>
              <tr>
                <th>DATE</th>
                <th>OPENING BALANCE</th>
                <th>PURCHASED</th>
                <th>ISSUED</th>
                <th>WASTED</th>
                <th>RETURNED</th>
                <th>CLOSING BALANCE</th>
                <th>NET CHANGE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((r, index) => {
                const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + Number(r.returned);
                const hasTransactions = Number(r.purchased) > 0 || Number(r.issued) > 0 || Number(r.wasted) > 0 || Number(r.returned) > 0;
                
                return (
                  <tr 
                    key={r.date} 
                    className={hasTransactions ? 'clickable-row' : ''}
                    onClick={() => hasTransactions && handleRowClick(r)}
                    style={{ cursor: hasTransactions ? 'pointer' : 'default' }}
                  >
                    <td style={{ fontWeight: '600' }}>
                      {format(new Date(r.date), 'MMM dd, yyyy')}
                    </td>
                    <td>{Number(r.opening).toFixed(3)}</td>
                    <td className="positive">+{Number(r.purchased).toFixed(3)}</td>
                    <td className="negative">-{Number(r.issued).toFixed(3)}</td>
                    <td className="negative">-{Number(r.wasted).toFixed(3)}</td>
                    <td className="positive">+{Number(r.returned).toFixed(3)}</td>
                    <td style={{ fontWeight: '600' }}>{Number(r.closing).toFixed(3)}</td>
                    <td style={{ 
                      color: netChange >= 0 ? '#28a745' : '#dc3545',
                      fontWeight: '600'
                    }}>
                      {netChange >= 0 ? '+' : ''}{netChange.toFixed(3)}
                    </td>
                    <td>
                      {hasTransactions && (
                        <button 
                          className="btn-view-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(r);
                          }}
                          title="View transaction details"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          {selectedItem ? (
            <p>No stock data available for {selectedItem.label} in the selected date range.</p>
          ) : (
            <p>Please select a date range and an item to generate the stock trend report.</p>
          )}
        </div>
      )}

      {selectedTransaction && (
        <TransactionDetailsModal
          date={selectedTransaction.date}
          itemId={selectedTransaction.itemId}
          itemName={selectedTransaction.itemName}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
};

export default StockReportByRangeAndItem;