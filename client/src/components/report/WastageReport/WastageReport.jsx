// WastageReport.js
import React, { useState } from 'react';
import { format, subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../PurchasingReport/PurchasingReport.css';
import api from '../../../api';

const WastageReport = () => {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [wastageData, setWastageData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWastageReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/wastage?startDate=${startDate}&endDate=${endDate}`);
      setWastageData(response.data);
    } catch (error) {
      console.error('Error fetching wastage report:', error);
      alert('Failed to fetcwh wastage report');
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="wastage-report-container">
      <h2>Wastage Report</h2>
      
<div className="date-range-selector">
        <div className="date-input">
          <label>Start Date:</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
          />
        </div>
        
        <div className="date-input">
          <label>End Date:</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
          />
        </div>
        
        <button 
          onClick={fetchWastageReport}
          disabled={loading}
          className="btn-generate"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>
      
      {wastageData.length > 0 && (
        <div className="report-actions">
          <button onClick={downloadPDF} className="btn-download">
            Download PDF
          </button>
        </div>
      )}

      {wastageData.length > 0 ? (
        <div className="table-responsive">
          <table className="styled-table wastage-report-table">
            <thead>
              <tr>
                <th>Note #</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Approved By</th>
                <th>Entered By</th>
                <th>Items Count</th>
                <th>Total Loss (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {wastageData.map((wastage) => {
                const totalLoss = wastage.items.reduce((total, item) => 
                  total + (Number(item.estimated_loss) || 0), 0
                );

                return (
                  <tr key={wastage.id}>
                    <td>{wastage.wastage_note_number}</td>
                    <td>{format(new Date(wastage.date), 'MM/dd/yyyy')}</td>
                    <td>{wastage.reason}</td>
                    <td>{wastage.approved_by}</td>
                    <td>{wastage.entered_by}</td>
                    <td>{wastage.items.length}</td>
                    <td>{totalLoss.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan="5">Grand Total</td>
                <td>{wastageData.reduce((total, wastage) => total + wastage.items.length, 0)}</td>
                <td>
                  {wastageData.reduce((total, wastage) => 
                    total + wastage.items.reduce((wTotal, item) => 
                      wTotal + (Number(item.estimated_loss) || 0), 0
                    ), 0).toFixed(2)
                  }
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p>No data to display. Select a date range and generate the report.</p>
      )}
    </div>
  );
};

export default WastageReport;
