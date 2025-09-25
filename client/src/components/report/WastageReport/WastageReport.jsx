import React, { useState } from 'react';
import { format, subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import '../PurchasingReport/PurchasingReport.css';
import api from '../../../api';

const WastageReport = () => {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [wastageData, setWastageData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const fetchWastageReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/wastage?startDate=${startDate}&endDate=${endDate}`);
      setWastageData(response.data);
      setExpandedRows(new Set()); // Collapse all rows when new data loads
    } catch (error) {
      console.error('Error fetching wastage report:', error);
      alert('Failed to fetch wastage report');
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpand = (wastageId) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(wastageId)) {
      newExpandedRows.delete(wastageId);
    } else {
      newExpandedRows.add(wastageId);
    }
    setExpandedRows(newExpandedRows);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const dateRange = `${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`;
    
    doc.setFontSize(16);
    doc.text(`Wastage Report - ${dateRange}`, 15, 15);

    const tableData = wastageData.flatMap(wastage => 
      wastage.items.map(item => [
        wastage.wastage_note_number,
        format(new Date(wastage.date), 'MM/dd/yyyy'),
        wastage.reason,
        item.item_code,
        item.item_name,
        item.quantity,
        item.unit,
        Number(item.estimated_loss).toFixed(2)
      ])
    );

    const headers = [
      'Note #', 
      'Date', 
      'Reason', 
      'Item Code', 
      'Item Name', 
      'Quantity', 
      'Unit', 
      'Loss (Rs.)'
    ];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 25,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 160, 133] }
    });

    const totalLoss = wastageData.reduce((total, wastage) => {
      return total + wastage.items.reduce((wTotal, item) => 
        wTotal + (Number(item.estimated_loss) || 0), 0
      );
    }, 0);

    doc.setFontSize(12);
    doc.text(`Total Estimated Loss: Rs. ${totalLoss.toFixed(2)}`, 15, doc.lastAutoTable.finalY + 15);

    doc.save(`wastage-report-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = wastageData.flatMap(wastage => 
      wastage.items.map(item => ({
        'Note No': wastage.wastage_note_number,
        'Date': format(new Date(wastage.date), 'MM/dd/yyyy'),
        'Reason': wastage.reason,
        'Approved By': wastage.approved_by,
        'Entered By': wastage.entered_by,
        'Item Code': item.item_code,
        'Item Name': item.item_name,
        'Quantity': item.quantity,
        'Unit': item.unit,
        'Estimated Loss (Rs.)': Number(item.estimated_loss)
      }))
    );

    const totalLoss = wastageData.reduce((total, wastage) => {
      return total + wastage.items.reduce((wTotal, item) => 
        wTotal + (Number(item.estimated_loss) || 0), 0
      );
    }, 0);

    worksheetData.push({});
    worksheetData.push({
      'Item Name': 'TOTAL ESTIMATED LOSS',
      'Estimated Loss (Rs.)': totalLoss
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Wastage Report');

    XLSX.writeFile(workbook, `wastage-report-${startDate}-to-${endDate}.xlsx`);
  };

  // Calculate summary statistics
  const totalWastageNotes = wastageData.length;
  const totalItems = wastageData.reduce((total, wastage) => total + wastage.items.length, 0);
  const totalLoss = wastageData.reduce((total, wastage) => 
    total + wastage.items.reduce((wTotal, item) => wTotal + (Number(item.estimated_loss) || 0), 0
  ), 0);
  const avgLossPerNote = totalWastageNotes > 0 ? totalLoss / totalWastageNotes : 0;

  return (
    <div className="wastage-report-container">
      <div className="report-header">
        <h2>Wastage Report</h2>
        {wastageData.length > 0 && (
          <div className="report-actions">
            <button onClick={downloadPDF} className="btn btn-success">
              <span>📄</span> PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-success">
              <span>📊</span> Excel
            </button>
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      {wastageData.length > 0 && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-value">{totalWastageNotes}</div>
            <div className="stat-label">Wastage Notes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalItems}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">Rs. {totalLoss.toFixed(2)}</div>
            <div className="stat-label">Total Loss</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">Rs. {avgLossPerNote.toFixed(2)}</div>
            <div className="stat-label">Avg. per Note</div>
          </div>
        </div>
      )}
      
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
        
        <button 
          onClick={fetchWastageReport}
          disabled={loading}
          className="btn btn-primary"
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
      </div>

      {loading ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          Loading wastage report...
        </div>
      ) : wastageData.length > 0 ? (
        <div className="table-container">
          <table className="purchasing-report-table wastage-report-table compact-view">
            <thead>
              <tr>
                <th style={{width: '60px'}}></th>
                <th>Note #</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Approved By</th>
                <th>Entered By</th>
                <th>Items</th>
                <th>Total Loss</th>
              </tr>
            </thead>
            <tbody>
              {wastageData.map((wastage) => {
                const totalLoss = wastage.items.reduce((total, item) => 
                  total + (Number(item.estimated_loss) || 0), 0
                );
                const isExpanded = expandedRows.has(wastage.id);

                return (
                  <React.Fragment key={wastage.id}>
                    <tr>
                      <td>
                        <button 
                          onClick={() => toggleRowExpand(wastage.id)}
                          className="expand-toggle"
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      </td>
                      <td>{wastage.wastage_note_number}</td>
                      <td>{format(new Date(wastage.date), 'MMM dd, yyyy')}</td>
                      <td>{wastage.reason}</td>
                      <td>
                        <span className={`status-badge ${wastage.approved_by ? 'status-approved' : 'status-pending'}`}>
                          {wastage.approved_by || 'Pending'}
                        </span>
                      </td>
                      <td>{wastage.entered_by}</td>
                      <td>{wastage.items.length}</td>
                      <td className="loss-amount">
                        Rs. {totalLoss.toFixed(2)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="expanded-row">
                        <td colSpan="8">
                          <table className="items-table">
                            <thead>
                              <tr>
                                <th>Item Code</th>
                                <th>Item Name</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                                <th>Estimated Loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {wastage.items.map((item, index) => (
                                <tr key={index}>
                                  <td>{item.item_code}</td>
                                  <td>{item.item_name}</td>
                                  <td>{item.quantity}</td>
                                  <td>{item.unit}</td>
                                  <td className="loss-amount">
                                    Rs. {Number(item.estimated_loss).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan="6">Grand Total</td>
                <td>{totalItems}</td>
                <td className="loss-amount">Rs. {totalLoss.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No wastage data found. Select a date range and generate the report.</p>
        </div>
      )}
    </div>
  );
};

export default WastageReport;