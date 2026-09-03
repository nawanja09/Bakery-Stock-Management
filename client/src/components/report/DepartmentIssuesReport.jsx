import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExcel, faFilter, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import './DepartmentIssuesReport.css';
import Select from 'react-select';
import api from '../../api';
import { formatNumber } from '../../utils/formatters';

const DepartmentIssuesReport = () => {
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedItem, setSelectedItem] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [deptResponse, itemsResponse] = await Promise.all([
          api.get("/departments"),
          api.get("/items")
        ]);
        setDepartments(deptResponse.data);
        setItems(itemsResponse.data);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchInitialData();

    // Default date range: last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  }, []);

  const generateReport = async () => {
    if (!startDate || !endDate) {
      alert("Please select a date range");
      return;
    }

    setLoading(true);
    try {
      const params = { startDate, endDate };
      if (selectedDepartment !== "all") params.departmentId = selectedDepartment;
      if (selectedItem !== "all") params.itemId = selectedItem;

      const response = await api.get("/reports/department", { params });
      setReportData(response.data);
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    if (reportData.length === 0) {
      alert("No data to export");
      return;
    }

    const doc = new jsPDF();
    const dateRange = `${format(new Date(startDate), 'dd,MMM, yyyy')} - ${format(new Date(endDate), 'dd,MMM, yyyy')}`;

    const departmentName = selectedDepartment === "all"
      ? "All Departments"
      : (departments.find((dept) => dept.id === Number(selectedDepartment))?.name || "Unknown Department");

    const itemName = selectedItem === "all"
      ? "All Items"
      : (items.find((item) => item.id === Number(selectedItem))?.name || "Unknown Item");

    doc.setFontSize(16);
    doc.text("Issuance Report", 14, 16);

    doc.setFontSize(12);
    doc.text(`Date Range: ${dateRange}`, 14, 24);
    doc.text(`Department: ${departmentName}`, 14, 32);
    doc.text(`Item: ${itemName}`, 14, 40);

    // Calculate grand total
    const grandTotal = reportData.reduce((total, row) => total + (parseFloat(row.total_price) || 0), 0);

    autoTable(doc, {
      startY: 50,
      head: [["Date", "Department", "Item Code", "Item Name", "Quantity", "Unit", "Unit Price (Rs.)", "Total Price (Rs.)", "Received By", "Remarks"]],
      body: reportData.map(row => [
        format(new Date(row.issuance_date), 'MMM dd, yyyy'),
        row.department_name,
        row.item_code,
        row.item_name,
        formatNumber(row.quantity, 3, 3),
        row.unit,
        row.unit_price ? `Rs. ${formatNumber(row.unit_price, 2, 2)}` : 'N/A',
        row.total_price ? `Rs. ${formatNumber(row.total_price, 2, 2)}` : 'N/A',
        row.received_by,
        row.remarks || 'N/A'
      ]),
      foot: [
        ['', '', '', '', '', '', 'Grand Total:', `Rs. ${formatNumber(grandTotal, 2, 2)}`, '', '']
      ]
    });

    doc.save("issuance_report.pdf");
  };

  const exportExcel = () => {
    if (reportData.length === 0) {
      alert("No data to export");
      return;
    }

    const worksheetData = reportData.map(row => ({
      'Date': format(new Date(row.issuance_date), 'MMM dd, yyyy'),
      'Department': row.department_name,
      'Item Code': row.item_code,
      'Item Name': row.item_name,
      'Quantity': formatNumber(row.quantity, 3, 3),
      'Unit': row.unit,
      'Unit Price (Rs.)': row.unit_price ? formatNumber(row.unit_price, 2, 2) : 'N/A',
      'Total Price (Rs.)': row.total_price ? formatNumber(row.total_price, 2, 2) : 'N/A',
      'Received By': row.received_by,
      'Remarks': row.remarks || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issuance Report');
    
    // Add grand total
    const grandTotal = reportData.reduce((total, row) => total + (parseFloat(row.total_price) || 0), 0);
    XLSX.utils.sheet_add_aoa(worksheet, [['', '', '', '', '', '', 'Grand Total:', `Rs. ${formatNumber(grandTotal, 2, 2)}`]], { origin: -1 });
    
    XLSX.writeFile(workbook, `issuance-report-${startDate}-to-${endDate}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
        <h2 style={{ textAlign: 'left', margin: 0 }}>RM Issue Item Detail</h2>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Track and manage raw material issued to departments.</p>
      </header>

      <div className="filters-section report-filter-bar">
        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendarAlt} /> START DATE
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendarAlt} /> END DATE
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faFilter} /> DEPARTMENT
          </label>
          <Select
            className="react-select-container"
            classNamePrefix="react-select"
            value={selectedDepartment === "all" ? { value: "all", label: "All Departments" } : departments.find(d => d.id === Number(selectedDepartment)) && { value: selectedDepartment, label: departments.find(d => d.id === Number(selectedDepartment))?.name }}
            onChange={(option) => setSelectedDepartment(option.value)}
            options={[
              { value: "all", label: "All Departments" },
              ...departments.map((dept) => ({
                value: dept.id.toString(),
                label: dept.name,
              })),
            ]}
            menuPortalTarget={document.body}
            menuPosition="fixed"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faFilter} /> ITEM SECTION
          </label>
          <Select
            className="react-select-container"
            classNamePrefix="react-select"
            value={selectedItem === "all" ? { value: "all", label: "All Items" } : items.find(i => i.id === Number(selectedItem)) && { value: selectedItem, label: items.find(i => i.id === Number(selectedItem))?.name + ` (${items.find(i => i.id === Number(selectedItem))?.item_code})` }}
            onChange={(option) => setSelectedItem(option.value)}
            options={[
              { value: "all", label: "All Items" },
              ...items.map((item) => ({
                value: item.id.toString(),
                label: `${item.name} (${item.item_code})`,
              })),
            ]}
            menuPortalTarget={document.body}
            menuPosition="fixed"
          />
        </div>

        <div className="report-filter-actions">
          <button
            onClick={generateReport}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? "Generating..." : "Generate"}
          </button>

          <button
            onClick={exportExcel}
            disabled={reportData.length === 0}
            className="btn btn-secondary"
          >
            <FontAwesomeIcon icon={faFileExcel} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading report data...</div>
      ) : reportData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Department</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Unit Price (Rs.)</th>
                  <th>Total Price (Rs.)</th>
                  <th>Received By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, idx) => (
                  <tr key={idx}>
                    <td>{format(new Date(row.issuance_date), 'MMM dd, yyyy')}</td>
                    <td>{row.department_name}</td>
                    <td>{row.item_code}</td>
                    <td>{row.item_name}</td>
                    <td>{formatNumber(row.quantity, 3, 3)}</td>
                    <td>{row.unit}</td>
                    <td>{row.unit_price ? `Rs. ${formatNumber(row.unit_price, 2, 2)}` : 'N/A'}</td>
                    <td style={{ fontWeight: 'bold' }}>
                      {row.total_price ? `Rs. ${formatNumber(row.total_price, 2, 2)}` : 'N/A'}
                    </td>
                    <td>{row.received_by}</td>
                    <td>{row.remarks || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "bold" }}>
                  <td colSpan={3}></td>
                  <td style={{ textAlign: "right" }}>Grand Total:</td>
                  <td>
                    {formatNumber(
                      reportData.reduce(
                        (total, row) => total + (parseFloat(row.quantity) || 0),
                        0
                      ),
                      3,
                      3
                    )}
                  </td>
                  <td></td>
                  <td></td>
                  <td>
                    Rs.&nbsp;
                    {formatNumber(
                      reportData.reduce(
                        (total, row) => total + (parseFloat(row.total_price) || 0),
                        0
                      ),
                      2,
                      2
                    )}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No data available for the selected filters. Generate a report to view data.</p>
        </div>
      )}
    </div>
  );
};

export default DepartmentIssuesReport;