// src/components/Analysis/LastIssueDateReport.jsx

// Raw Material -> Analysis -> Last Issue Date
//
// Shows every raw material item together with the most recent date it was
// issued to a department. Items are sorted by Last Issue Date ascending by
// default (oldest last-issued item on top, most recently issued at the
// bottom). Items that have never been issued show "Not Issued" and are
// always placed at the end of the list, regardless of sort direction.
import React, { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileExcel,
  faFilter,
  faSync,
  faSortAmountUp,
  faSortAmountDown,
  faHistory
} from '@fortawesome/free-solid-svg-icons';
import './LastIssueDateReport.css';
import api from '../../api';

const LastIssueDateReport = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [sortOrder, setSortOrder] = useState('ASC'); // 'ASC' = oldest first, 'DESC' = newest first
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reports/last-issue-date', {
        params: { status: statusFilter, sortOrder }
      });
      setRows(response.data || []);
    } catch (err) {
      console.error('Error fetching last issue date report:', err);
      setError('Failed to load the Last Issue Date report');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortOrder]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (r.item_name || '').toLowerCase().includes(term) ||
        (r.item_code || '').toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const formatDate = (value) => {
    if (!value) return 'Not Issued';
    try {
      return format(new Date(value), 'dd MMM yyyy');
    } catch {
      return value;
    }
  };

  const notIssuedCount = useMemo(
    () => rows.filter((r) => !r.last_issue_date).length,
    [rows]
  );

  const downloadPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Raw Material - Last Issue Date Report', 15, 15);

    const directionLabel = sortOrder === 'DESC' ? 'Newest Issued First' : 'Oldest Issued First';
    const statusLabel =
      statusFilter === 'all' ? 'All Statuses' : statusFilter === 'active' ? 'Active Only' : 'Inactive Only';
    doc.setFontSize(10);
    doc.text(`Sort: ${directionLabel}  |  Filter: ${statusLabel}`, 15, 22);

    const tableData = filteredRows.map((item) => [
      item.item_code,
      item.item_name,
      item.unit,
      formatDate(item.last_issue_date),
      item.status === 1 ? 'Active' : 'Inactive'
    ]);

    autoTable(doc, {
      head: [['Item Code', 'Item Name', 'Unit', 'Last Issue Date', 'Status']],
      body: tableData,
      startY: 30,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 160, 133] }
    });

    doc.save(`last-issue-date-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = filteredRows.map((item) => ({
      'Item Code': item.item_code,
      'Item Name': item.item_name,
      Unit: item.unit,
      'Last Issue Date': item.last_issue_date || 'Not Issued',
      Status: item.status === 1 ? 'Active' : 'Inactive'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Last Issue Date');
    XLSX.writeFile(workbook, `last-issue-date-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const getStatusBadge = (status) => (status === 1 ? 'status-badge active' : 'status-badge inactive');

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Raw Material - Last Issue Date</h2>
      </div>

      <div className="controls-row report-filter-bar">
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faFilter} /> Item Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={sortOrder === 'ASC' ? faSortAmountUp : faSortAmountDown} /> Sort Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="filter-select"
          >
            <option value="ASC">Oldest Issued First (Ascending)</option>
            <option value="DESC">Newest Issued First (Descending)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Search Item</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Item name or code..."
            className="date-input"
          />
        </div>

        <div className="form-group action-buttons-container">
          <label style={{ opacity: 0 }}>Actions</label>
          <div className="action-buttons-row">
            <button onClick={fetchReport} disabled={loading} className="btn btn-generate">
              <FontAwesomeIcon icon={faSync} className={loading ? 'spin' : ''} />
              {loading ? 'Loading...' : 'Refresh'}
            </button>

            {filteredRows.length > 0 && (
              <>
                <button onClick={downloadExcel} className="btn btn-excel">
                  <FontAwesomeIcon icon={faFileExcel} /> Excel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading" role="status" aria-live="polite">Loading last issue date data...</div>
      ) : filteredRows.length > 0 ? (
        <>
          <div className="table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th><FontAwesomeIcon icon={faHistory} /> Last Issue Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.item_code}</td>
                    <td>{item.item_name}</td>
                    <td>{item.unit}</td>
                    <td>
                      {item.last_issue_date ? (
                        formatDate(item.last_issue_date)
                      ) : (
                        <span className="status-badge inactive">Not Issued</span>
                      )}
                    </td>
                    <td>
                      <span className={getStatusBadge(item.status)}>
                        {item.status === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-summary">
            <span>Total items: {filteredRows.length}</span>
            <span>Never issued: {notIssuedCount}</span>
          </div>
        </>
      ) : (
        <div className="no-data">No raw material items found.</div>
      )}
    </div>
  );
};

export default LastIssueDateReport;
