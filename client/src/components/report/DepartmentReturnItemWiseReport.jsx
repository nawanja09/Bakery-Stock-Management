/* DepartmentReturnItemWiseReport.jsx */
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFileExcel, 
  faSearch,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { toExportNumber } from '../../utils/formatters';
import './DepartmentReturnReport.css';

const DepartmentReturnItemWiseReport = () => {
  const { showPopup } = usePopup();
  
  // State
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [departments, setDepartments] = useState([]);
  
  // Filter states
  const [filters, setFilters] = useState({
    startDate: format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    departmentId: 'all',
    searchTerm: '',
    sortBy: 'return_date',
    sortOrder: 'ASC'
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  useEffect(() => {
    fetchDepartments();
    generateReport();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] && filters[key] !== 'all') {
          params.append(key, filters[key]);
        }
      });

      const response = await api.get(`/reports/department-return-item-wise?${params.toString()}`);
      setReportData(response.data.data || []);
      setSummary(response.data.summary || null);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error generating report:', error);
      showPopup('error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    generateReport();
  };

  const clearFilters = () => {
    setFilters({
      startDate: format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      departmentId: 'all',
      searchTerm: '',
      sortBy: 'return_date',
      sortOrder: 'ASC'
    });
    setTimeout(() => generateReport(), 100);
  };

  const handleSort = (sortBy) => {
    const newSortOrder = filters.sortBy === sortBy && filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    setFilters(prev => ({
      ...prev,
      sortBy,
      sortOrder: newSortOrder
    }));
    setTimeout(() => generateReport(), 100);
  };

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = reportData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(reportData.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Export functions
  const exportPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.text('Department Return Item Wise Detail Report', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated Date: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, pageWidth / 2, 28, { align: 'center' });
    
    if (filters.startDate && filters.endDate) {
      doc.text(`Period: ${filters.startDate} to ${filters.endDate}`, pageWidth / 2, 34, { align: 'center' });
    }
    
    const tableData = reportData.map(item => [
      format(new Date(item.return_date), 'yyyy-MM-dd'),
      item.return_number,
      item.department_name,
      item.item_code,
      item.item_name,
      item.category || 'N/A',
      item.unit,
      Number(item.returned_quantity).toFixed(3),
      item.return_reason,
      item.received_by,
      item.remarks || ''
    ]);

    autoTable(doc, {
      head: [[
        'Date', 'Ref No', 'Department', 'Item Code', 'Item Name', 
        'Category', 'Unit', 'Qty', 'Reason', 'Received By', 'Remarks'
      ]],
      body: tableData,
      startY: 40,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [22, 160, 133] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 25 },
        4: { cellWidth: 35 },
        5: { cellWidth: 20 },
        6: { cellWidth: 15 },
        7: { cellWidth: 20 },
        8: { cellWidth: 25 },
        9: { cellWidth: 25 },
        10: { cellWidth: 30 }
      },
      didDrawPage: function(data) {
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.text(
          `Total Items: ${reportData.length} | Total Quantity: ${summary?.totalReturnQuantity?.toFixed(3) || 0} | Generated by: ${JSON.parse(localStorage.getItem('user'))?.name || 'System'}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }
    });
    
    doc.save(`department-return-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportExcel = () => {
    const worksheetData = reportData.map(item => ({
      'Return Date': format(new Date(item.return_date), 'yyyy-MM-dd'),
      'Return Reference': item.return_number,
      'Department': item.department_name,
      'Item Code': item.item_code,
      'Item Name': item.item_name,
      'Category': item.category || 'N/A',
      'Unit': item.unit,
      'Returned Quantity': toExportNumber(item.returned_quantity, 3),
      'Return Reason': item.return_reason,
      'Received By': item.received_by,
      'Remarks': item.remarks || ''
    }));

    const summaryData = [
      { 'Summary': 'Department Return Item Wise Report' },
      {},
      { 'Total Items Returned': summary?.totalItems || 0 },
      { 'Total Return Quantity': toExportNumber(summary?.totalReturnQuantity || 0, 3) },
      { 'Total Return Transactions': summary?.totalTransactions || 0 },
      {},
      { 'Item Summary:' : '' },
      {},
      ...(summary?.itemSummaryList?.map(item => ({
        'Item Code': item.item_code,
        'Item Name': item.item_name,
        'Total Quantity Returned': toExportNumber(item.total_quantity, 3),
        'Number of Returns': item.return_count,
        'Unit': item.unit
      })) || [])
    ];

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Return Details');
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
    
    XLSX.writeFile(workbook, `department-return-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container">
      {/* Header with Export Button */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Department Return Item Wise Detail</h2>
        </div>
        {reportData.length > 0 && (
          <button onClick={exportExcel} className="btn btn-success">
            <FontAwesomeIcon icon={faFileExcel} /> Export Excel
          </button>
        )}
      </header>

      {/* Filters */}
      <form onSubmit={handleSearch} className="filters-section report-filter-bar department-return-filter">
        <div className="report-filter-group">
          <label className="report-filter-label">From Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="report-filter-input"
          />
        </div>
        <div className="report-filter-group">
          <label className="report-filter-label">To Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="report-filter-input"
          />
        </div>
        <div className="report-filter-group">
          <label className="report-filter-label">Department</label>
          <select
            value={filters.departmentId}
            onChange={(e) => handleFilterChange('departmentId', e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>
        <div className="report-filter-group">
          <label className="report-filter-label">Search</label>
          <div className="items-search report-search-field">
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              placeholder="Search..."
              className="report-filter-input"
            />
          </div>
        </div>
        <div className="report-filter-actions">
          <button type="submit" className="btn btn-primary">
            <FontAwesomeIcon icon={faSearch} /> Search
          </button>
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            <FontAwesomeIcon icon={faTimes} /> Reset
          </button>
        </div>
      </form>

      {/* Report Table */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Generating report...</p>
        </div>
      ) : reportData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('return_date')} className="sortable">
                    Return Date {filters.sortBy === 'return_date' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th>Ref No</th>
                  <th onClick={() => handleSort('department_name')} className="sortable">
                    Department {filters.sortBy === 'department_name' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('item_code')} className="sortable">
                    Item Code {filters.sortBy === 'item_code' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('item_name')} className="sortable">
                    Item Name {filters.sortBy === 'item_name' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th onClick={() => handleSort('returned_quantity')} className="sortable">
                    Qty {filters.sortBy === 'returned_quantity' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('return_reason')} className="sortable">
                    Reason {filters.sortBy === 'return_reason' && (filters.sortOrder === 'DESC' ? '↓' : '↑')}
                  </th>
                  <th>Received By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((item, index) => (
                  <tr key={`${item.return_id}-${index}`}>
                    <td>{format(new Date(item.return_date), 'yyyy-MM-dd')}</td>
                    <td>
                      <span className="badge badge-neutral">{item.return_number}</span>
                    </td>
                    <td>{item.department_name}</td>
                    <td>
                      <span className="badge badge-primary">{item.item_code}</span>
                    </td>
                    <td className="item-name">{item.item_name}</td>
                    <td>{item.category || 'N/A'}</td>
                    <td>
                      <span className="badge badge-neutral">{item.unit}</span>
                    </td>
                    <td className="report-table-value-numeric">
                      {Number(item.returned_quantity).toFixed(3)}
                    </td>
                    <td>
                      <span className={`badge badge-neutral`}>
                        {item.return_reason}
                      </span>
                    </td>
                    <td>{item.received_by}</td>
                    <td className="remarks-cell">{item.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className="page-btn"
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="page-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No Return Records Found</h3>
          <button onClick={clearFilters} className="btn btn-secondary">
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default DepartmentReturnItemWiseReport;