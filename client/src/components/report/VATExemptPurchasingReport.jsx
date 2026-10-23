import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxOpen } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatNumber, toExportNumber } from '../../utils/formatters';
import { filterItemByName, reportItemSelectStyles } from './reportItemSelectHelper';
import './VATExemptPurchasingReport.css';

const ALL_ITEMS_OPTION = { value: 'all', label: 'All Items', name: 'All Items', item_code: '', data: null };

const VATExemptPurchasingReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [companyFilter, setCompanyFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  // Replaces the old Item Category filter: driven by Items Management's own
  // VAT status column (VAT Applicable / VAT Not Applicable) rather than item type.
  const [vatStatusFilter, setVatStatusFilter] = useState('not_applicable');
  const [supplierVatStatusFilter, setSupplierVatStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(ALL_ITEMS_OPTION);

  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadDropdownData = async () => {
      try {
        const [suppliersRes, itemsRes] = await Promise.all([
          api.get('/suppliers'),
          api.get('/items')
        ]);
        if (mounted) {
          setSuppliers(suppliersRes.data || []);
          setItemsList(itemsRes.data || []);
        }
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };
    loadDropdownData();
    return () => { mounted = false; };
  }, []);

  const itemOptions = useMemo(() => [
    ALL_ITEMS_OPTION,
    ...itemsList.map((it) => {
      const name = it.name || it.item_name || 'Unknown';
      const code = it.item_code;
      return {
        value: it.id || it.item_id,
        label: code ? `${code} - ${name}` : name,
        name,
        item_code: code || '',
        data: it
      };
    })
  ], [itemsList]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, vatStatus: vatStatusFilter, supplierVatStatus: supplierVatStatusFilter });
      if (companyFilter) params.append('companyId', companyFilter);
      if (supplierFilter) params.append('supplierId', supplierFilter);
      if (selectedItem && selectedItem.value !== 'all') params.append('itemId', selectedItem.value);

      const response = await api.get(`/reports/vat-exempt-purchasing?${params.toString()}`);
      setReportData(response.data.data || []);
      setHasGenerated(true);
    } catch (error) {
      console.error('Error fetching VAT Exempt Purchasing report:', error);
      alert('Failed to fetch VAT Exempt Purchasing report');
    } finally {
      setLoading(false);
    }
  };

  const totalValue = reportData.reduce((sum, row) => sum + (Number(row.value_of_purchase) || 0), 0);

  const downloadExcel = () => {
    if (reportData.length === 0) {
      alert('No data to export. Please generate the report first.');
      return;
    }

    const worksheetData = [[
      'Invoice Date', 'Invoice Number', 'Name of the Supplier', 'Supplier VAT Status', 'Item Name',
      'VAT Status', 'Value of Purchase (Rs.)'
    ]];

    reportData.forEach((row) => {
      worksheetData.push([
        row.invoice_date ? format(new Date(row.invoice_date), 'dd/MM/yyyy') : 'N/A',
        row.invoice_no || 'N/A',
        row.supplier_name || 'N/A',
        row.supplier_vat_registered ? 'VAT Registered' : 'Not VAT Registered',
        row.item_name || 'N/A',
        row.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable',
        toExportNumber(row.value_of_purchase, 2)
      ]);
    });

    worksheetData.push([]);
    worksheetData.push(['TOTAL', '', '', '', '', '', toExportNumber(totalValue, 2)]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'VAT Exempt Purchasing');
    XLSX.writeFile(workbook, `vat-exempt-purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>VAT Exempt Purchasing Report</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 14px)' }}>
            View all VAT exempt purchases with item code and VAT status.
          </p>
        </div>
        {reportData.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={downloadExcel} className="btn btn-success">
              <span>📊</span> Export to Excel
            </button>
          </div>
        )}
      </header>

      <div className="filters-section card" style={{ display: 'flex', gap: 'var(--spacing-lg)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="report-filter-group">
          <label className="report-filter-label">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Company</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Companies</option>
            <option value="1">JH</option>
            <option value="2">RR</option>
            <option value="3">RD</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Supplier</label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">VAT Status</label>
          <select
            value={vatStatusFilter}
            onChange={(e) => setVatStatusFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All</option>
            <option value="applicable">VAT Applicable</option>
            <option value="not_applicable">VAT Not Applicable</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Supplier VAT Status</label>
          <select
            value={supplierVatStatusFilter}
            onChange={(e) => setSupplierVatStatusFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All Suppliers</option>
            <option value="registered">VAT Registered</option>
            <option value="not_registered">Not VAT Registered</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faBoxOpen} className="filter-icon" /> Item
          </label>
          <Select
            value={selectedItem}
            onChange={(selected) => setSelectedItem(selected || ALL_ITEMS_OPTION)}
            options={itemOptions}
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
            onClick={fetchReport}
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
      </div>

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <div className="loading-spinner"></div>
          Loading VAT Exempt Purchasing report data...
        </div>
      ) : reportData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th className="text-left">Invoice Date</th>
                  <th className="text-left">Invoice Number</th>
                  <th className="text-left">Name of the Supplier</th>
                  <th className="text-left">Supplier VAT Status</th>
                  <th className="text-left">Item Name</th>
                  <th className="text-left">VAT Status</th>
                  <th className="text-right">Value of Purchase (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => (
                  <tr key={`${row.purchase_id}-${row.item_id}-${index}`}>
                    <td className="text-left">{row.invoice_date ? format(new Date(row.invoice_date), 'dd/MM/yyyy') : 'N/A'}</td>
                    <td className="text-left">{row.invoice_no || 'N/A'}</td>
                    <td className="text-left">{row.supplier_name || 'N/A'}</td>
                    <td className="text-left">
                      <span className={`badge ${row.supplier_vat_registered ? 'badge-success' : 'badge-neutral'}`}>
                        {row.supplier_vat_registered ? 'VAT Registered' : 'Not VAT Registered'}
                      </span>
                    </td>
                    <td className="text-left">{row.item_name || 'N/A'}</td>
                    <td className="text-left">
                      <span className={`badge ${row.vat_applicable ? 'badge-success' : 'badge-neutral'}`}>
                        {row.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable'}
                      </span>
                    </td>
                    <td className="report-table-value-numeric">{formatNumber(row.value_of_purchase, 2, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" className="text-right"><strong>TOTAL</strong></td>
                  <td className="report-table-value-numeric"><strong>{formatNumber(totalValue, 2, 2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)', opacity: 0.5 }}>📊</div>
          <h3>No Data Available</h3>
          <p>{hasGenerated ? 'No purchases match these filters.' : 'Select a date range and generate the report.'}</p>
        </div>
      )}
    </div>
  );
};

export default VATExemptPurchasingReport;
