// src/components/report/StockReportByRangeAndItem.jsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFileExcel, 
  faCalendar, 
  faBoxOpen,
  faEye, 
  faSearch,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatNumber } from '../../utils/formatters';
import { filterItemByName, reportItemSelectStyles } from './reportItemSelectHelper';
import './StockReport.css';   

// Transaction Details Modal Component
const TransactionDetailsModal = ({ date, itemId, itemName, onClose }) => {
  const [transactions, setTransactions] = useState({
    purchases: [],
    issuances: [],
    wastages: [],
    returns: [],
    purchaseReturns: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactionDetails = async () => {
      try {
        const [purchasesRes, issuancesRes, wastagesRes, returnsRes, purchaseReturnsRes] = await Promise.all([
          api.get(`/reports/daily-transactions/purchases`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/issuances`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/wastages`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/returns`, { params: { date, itemId }}),
          api.get(`/reports/daily-transactions/purchase-returns`, { params: { date, itemId }}),
        ]);

        setTransactions({
          purchases: purchasesRes.data,
          issuances: issuancesRes.data,
          wastages: wastagesRes.data,
          returns: returnsRes.data,
          purchaseReturns: purchaseReturnsRes.data,
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
      <div className="modern-modal erp-transaction-modal" onClick={(e) => e.stopPropagation()}>
        
        <div className="modern-modal-header">
          <div>
            <h2>Transaction Details (Auto-Add Item)</h2>
            <p className="modal-subtitle">
              {format(new Date(date), "MMMM dd, yyyy")} • {itemName}
            </p>
          </div>
          <button className="modern-close-btn" onClick={onClose}>✕</button>
        </div>

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
                        <td>{formatNumber(p.quantity, 3, 3)}</td>
                        <td>{formatNumber(p.unit_price, 2, 2)}</td>
                        <td>{formatNumber(p.total_price, 2, 2)}</td>
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
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.issuances.map((i, idx) => (
                      <tr key={idx}>
                        <td>ISS-{i.issuance_id}</td>
                        <td>{i.department_name}</td>
                        <td>{i.received_by}</td>
                        <td>{formatNumber(i.quantity, 3, 3)}</td>
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
                      <th>Reason</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.wastages.map((w, idx) => (
                      <tr key={idx}>
                        <td>{w.wastage_note_number}</td>
                        <td>{w.reason}</td>
                        <td>{formatNumber(w.quantity, 3, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No wastages recorded</p>}
          </div>

          {/* SECTION: PURCHASE RETURNS */}
          <div className="modal-section">
            <div className="modal-section-title returns-bg">
              ↩️ Purchase Returns ({transactions.purchaseReturns.length})
            </div>
            {transactions.purchaseReturns.length > 0 ? (
              <div className="modern-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Return #</th>
                      <th>Supplier</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.purchaseReturns.map((pr, idx) => (
                      <tr key={idx}>
                        <td>{pr.return_number}</td>
                        <td>{pr.supplier_name}</td>
                        <td>{formatNumber(pr.quantity, 3, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="no-data">No purchase returns recorded</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const ALL_ITEMS_OPTION = { value: 'all', label: 'All Items', name: 'All Items', item_code: '', data: null };

const StockReportByRangeAndItem = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [items, setItems] = useState([ALL_ITEMS_OPTION]);
  const [selectedItem, setSelectedItem] = useState(ALL_ITEMS_OPTION);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchItems = async () => {
      try {
        // Only fetch auto-add enabled items
        const res = await api.get('/items?auto_add_only=true');
        const itemsData = [
          ALL_ITEMS_OPTION,
          ...res.data.map(item => ({
            value: item.id,
            label: `${item.item_code} - ${item.name} (Auto-Add)`,
            name: item.name,
            item_code: item.item_code,
            data: item
          }))
        ];
        setItems(itemsData);
      } catch (err) {
        console.error('Failed to fetch items:', err);
        setError('Failed to load items');
      }
    };
    fetchItems();
  }, []);

  const fetchStockReport = async (overrideItem = null) => {
    if (!startDate || !endDate) {
      alert('Please select start date and end date.');
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date cannot be after end date.');
      return;
    }

    const currentItem = overrideItem !== null ? overrideItem : selectedItem;

    setLoading(true);
    setError('');
    
    try {
      const params = { startDate, endDate };
      if (currentItem && currentItem.value && currentItem.value !== 'all') {
        params.itemId = currentItem.value;
      }
      const res = await api.get(`/reports/stock-range-item`, { params });
      setStockData(res.data);
      setHasGenerated(true);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Error fetching stock data');
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (selected) => {
    const nextItem = selected || ALL_ITEMS_OPTION;
    setSelectedItem(nextItem);
    if (hasGenerated) {
      fetchStockReport(nextItem);
    }
  };

  const handleRowClick = (rowData) => {
    if (selectedItem && selectedItem.value !== 'all') {
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
    doc.text('AUTO-MANAGED STOCK MOVEMENT', 105, 15, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    const itemLabel = (selectedItem && selectedItem.value !== 'all') ? selectedItem.label : 'All Items';
    doc.text(itemLabel, 105, 22, { align: 'center' });
    
    // Date range
    const rangeStr = `Period: ${format(new Date(startDate), 'MMM dd, yyyy')} to ${format(new Date(endDate), 'MMM dd, yyyy')}`;
    doc.text(rangeStr, 105, 28, { align: 'center' });
    
    // Generated date
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 105, 34, { align: 'center' });

    // Table
    autoTable(doc, {
      head: [
        ['Date', 'Opening', 'Purchased', 'Issued', 'Wasted', 'Dept Ret', 'Pur Ret', 'Adjustments', 'Closing', 'Net']
      ],
      body: stockData.map(r => {
        const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + 
                          Number(r.returned) - Number(r.purchaseReturned || 0) + Number(r.adjusted || 0);
        return [
          format(new Date(r.date), 'MMM dd'),
          formatNumber(r.opening, 2, 2),
          formatNumber(r.purchased, 2, 2),
          formatNumber(r.issued, 2, 2),
          formatNumber(r.wasted, 2, 2),
          formatNumber(r.returned, 2, 2),
          formatNumber(r.purchaseReturned || 0, 2, 2),
          formatNumber(r.adjusted || 0, 2, 2),
          formatNumber(r.closing, 2, 2),
          formatNumber(netChange, 2, 2)
        ];
      }),
      startY: 40,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 204] }
    });

    const itemSuffix = (selectedItem && selectedItem.value !== 'all') ? selectedItem.value : 'all';
    doc.save(`auto-stock-movement-${itemSuffix}-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    if (stockData.length === 0) {
      alert('No data to export');
      return;
    }

    const itemLabel = (selectedItem && selectedItem.value !== 'all') ? selectedItem.label : 'All Items';
    const worksheetData = [
      ['AUTO-MANAGED STOCK MOVEMENT REPORT'],
      [`Item: ${itemLabel}`],
      [`Period: ${format(new Date(startDate), 'MMM dd, yyyy')} to ${format(new Date(endDate), 'MMM dd, yyyy')}`],
      [''],
      ['Date', 'Opening', 'Purchased', 'Issued', 'Wasted', 'Dept Return', 'Purchase Return', 'Adjustments', 'Closing', 'Net Change']
    ];

    stockData.forEach(r => {
      const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + 
                        Number(r.returned) - Number(r.purchaseReturned || 0) + Number(r.adjusted || 0);
      worksheetData.push([
        format(new Date(r.date), 'yyyy-MM-dd'),
        Number(r.opening),
        Number(r.purchased),
        Number(r.issued),
        Number(r.wasted),
        Number(r.returned),
        Number(r.purchaseReturned || 0),
        Number(r.adjusted || 0),
        Number(r.closing),
        netChange
      ]);
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Auto-Managed Stock');
    
    const itemSuffix = (selectedItem && selectedItem.value !== 'all') ? selectedItem.value : 'all';
    const fileName = `auto-stock-movement-${itemSuffix}-${startDate}-to-${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const calculateSummary = () => {
    if (stockData.length === 0) return null;

    return {
      totalPurchased: stockData.reduce((sum, day) => sum + Number(day.purchased), 0),
      totalIssued: stockData.reduce((sum, day) => sum + Number(day.issued), 0),
      totalWasted: stockData.reduce((sum, day) => sum + Number(day.wasted), 0),
      totalReturned: stockData.reduce((sum, day) => sum + Number(day.returned), 0),
      totalPurchaseReturned: stockData.reduce((sum, day) => sum + Number(day.purchaseReturned || 0), 0),
      totalAdjusted: stockData.reduce((sum, day) => sum + Number(day.adjusted || 0), 0),
      avgClosing: stockData.reduce((sum, day) => sum + Number(day.closing), 0) / stockData.length
    };
  };

  const summary = calculateSummary();

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>RM Item Wise Stock Movement</h2>
        </div>
      </header>

      {/* Controls */}
      <div className="filters-section report-filter-bar">
        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendar} /> Start Date
          </label>
          <input 
            type="date" 
            max={endDate} 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendar} /> End Date
          </label>
          <input 
            type="date" 
            min={startDate} 
            max={today} 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faBoxOpen} className="filter-icon" /> Item
          </label>
        
          <Select
            value={selectedItem || ALL_ITEMS_OPTION}
            onChange={handleItemChange}
            options={items}
            filterOption={filterItemByName}
            styles={reportItemSelectStyles}
            className="react-select-container"
            classNamePrefix="react-select"
            isSearchable
            isClearable={false}
            placeholder="Select item..."
          />
        </div>

        <div className="report-filter-actions">
          <button 
            onClick={() => fetchStockReport()} 
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
          
          {stockData.length > 0 && (
              <button onClick={downloadExcel} className="btn btn-success">
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-lg)' }}>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">TOTAL PURCHASED</div>
            <div className="report-summary-value text-primary">{formatNumber(summary.totalPurchased, 2, 2)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">TOTAL ISSUED</div>
            <div className="report-summary-value text-danger">{formatNumber(summary.totalIssued, 2, 2)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">TOTAL WASTED</div>
            <div className="report-summary-value text-danger">{formatNumber(summary.totalWasted, 2, 2)}</div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">TOTAL ADJUSTED</div>
            <div
              className={`report-summary-value ${summary.totalAdjusted >= 0 ? 'text-primary' : 'text-danger'}`}
            >
              {summary.totalAdjusted >= 0 ? '+' : ''}{formatNumber(summary.totalAdjusted, 2, 2)}
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-summary-label">AVG CLOSING</div>
            <div className="report-summary-value">{formatNumber(summary.avgClosing, 2, 2)}</div>
          </div>
        </div>
      )}

      {/* Data Table */}
      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">Loading data...</div>
      ) : stockData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>OPENING</th>
                <th>PURCHASED</th>
                <th>ISSUED</th>
                <th>WASTED</th>
                <th>DEPT RET</th>
                <th>PUR RET</th>
                <th>ADJUSTMENTS</th>
                <th>CLOSING</th>
                <th>NET</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((r, index) => {
                const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted) + 
                                  Number(r.returned) - Number(r.purchaseReturned || 0) + Number(r.adjusted || 0);
                const hasTransactions = Number(r.purchased) > 0 || Number(r.issued) > 0 || 
                                        Number(r.wasted) > 0 || Number(r.returned) > 0 || 
                                        Number(r.purchaseReturned || 0) > 0 || Number(r.adjusted || 0) !== 0;
                
                return (
                  <tr 
                    key={r.date} 
                    className={hasTransactions ? 'clickable-row' : ''}
                    onClick={() => hasTransactions && handleRowClick(r)}
                  >
                    <td>{format(new Date(r.date), 'MMM dd')}</td>
                    <td className="text-right">{formatNumber(r.opening, 2, 2)}</td>
                    <td className="text-right positive">+{formatNumber(r.purchased, 2, 2)}</td>
                    <td className="text-right negative">-{formatNumber(r.issued, 2, 2)}</td>
                    <td className="text-right negative">-{formatNumber(r.wasted, 2, 2)}</td>
                    <td className="text-right positive">+{formatNumber(r.returned, 2, 2)}</td>
                    <td className="text-right negative">-{formatNumber(r.purchaseReturned || 0, 2, 2)}</td>
                    <td
                      className={`text-right ${Number(r.adjusted || 0) >= 0 ? 'positive' : 'negative'}`}
                    >
                      {Number(r.adjusted || 0) >= 0 ? '+' : ''}{formatNumber(r.adjusted || 0, 2, 2)}
                    </td>
                    <td className="text-right" style={{ fontWeight: '600' }}>{formatNumber(r.closing, 2, 2)}</td>
                    <td className="text-right" style={{ 
                      color: netChange >= 0 ? '#28a745' : '#dc3545',
                      fontWeight: '600'
                    }}>
                      {netChange >= 0 ? '+' : ''}{formatNumber(netChange, 2, 2)}
                    </td>
                    <td className="text-center">
                      {hasTransactions && (
                        <button 
                          className="btn-view-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(r);
                          }}
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
        </div>
      ) : (
        <div className="empty-state">
          {selectedItem ? (
            <>
              <p>No data available for the selected period.</p>
              <p style={{ fontSize: '0.9em', color: '#6c757d' }}>
                This is an Auto-Add enabled item but no transactions found.
              </p>
            </>
          ) : (
            <p>Select an Auto-Add item and date range to generate report.</p>
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
