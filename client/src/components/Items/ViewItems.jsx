import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faTimes,
  faCheck,
  faBan,
  faToggleOn,
  faToggleOff,
  faFileExcel
} from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { ITEM_TYPE_OPTIONS } from './itemTypeOptions';
import { formatNumber } from '../../utils/formatters';
import * as XLSX from 'xlsx';

const ViewItems = () => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVat, setFilterVat] = useState('all');
  const [filterAutoAdd, setFilterAutoAdd] = useState('all');
  const [filterItemType, setFilterItemType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active'); // 'all' | 'active' | 'inactive'
  const { showPopup } = usePopup();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [searchTerm, filterVat, filterAutoAdd, filterItemType, filterStatus, items]);

  // Fetch ALL non-deleted items (active + inactive) so admin can manage them
  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/items?include_inactive=true');
      setItems(response.data);
      setFilteredItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
      showPopup('error', 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...items];

    // Apply status filter
    if (filterStatus === 'active') {
      filtered = filtered.filter(item => item.is_active);
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter(item => !item.is_active);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply VAT filter
    if (filterVat !== 'all') {
      const vatValue = filterVat === 'yes';
      filtered = filtered.filter(item => {
        return Boolean(item.vat_applicable) === vatValue;
      });
    }

    // Apply Auto-Add filter
    if (filterAutoAdd !== 'all') {
      const autoAddValue = filterAutoAdd === 'yes';
      filtered = filtered.filter(item => {
        return Boolean(item.auto_add_to_stock) === autoAddValue;
      });
    }

    // Apply Item Type filter
    if (filterItemType !== 'all') {
      filtered = filtered.filter(item => (item.item_type || 'Other') === filterItemType);
    }

    setFilteredItems(filtered);
  };

  // Toggle active/inactive status for an item
  const handleToggleStatus = async (item) => {
    const newStatus = !item.is_active;
    const action = newStatus ? 'activate' : 'deactivate';

    if (!window.confirm(
      `Are you sure you want to ${action} "${item.name}"?\n\n` +
      (newStatus
        ? 'The item will reappear in all dropdowns and the Stock Report.'
        : 'The item will be hidden from all dropdowns and the Stock Report, but its data will be preserved.')
    )) return;

    try {
      await api.patch(`/items/${item.id}/status`, { is_active: newStatus });
      showPopup('success', `Item ${newStatus ? 'activated' : 'deactivated'} successfully!`);
      fetchItems();
    } catch (error) {
      console.error('Error toggling item status:', error);
      showPopup('error', 'Failed to update item status');
    }
  };

  // Soft-delete the item (sets deleted = TRUE in DB, removes from all views)
  const handleDelete = async (id, itemName) => {
    if (!window.confirm(
      `Are you sure you want to DELETE "${itemName}"?\n\n` +
      'This will permanently remove it from all views (dropdowns, reports, and this list).\n' +
      'The record will remain in the database as deleted.'
    )) return;

    try {
      await api.delete(`/items/${id}`);
      showPopup('success', 'Item deleted successfully!');
      fetchItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      showPopup('error', 'Failed to delete item');
    }
  };

  const handleEdit = (id) => {
    navigate(`/items/edit/${id}`, { state: { backgroundLocation: location } });
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFilterVat('all');
    setFilterAutoAdd('all');
    setFilterItemType('all');
    setFilterStatus('active');
  };

  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      return;
    }

    const worksheetData = filteredItems.map(item => ({
      'Item Code': item.item_code || '',
      'Item Name': item.name || '',
      'Unit': item.unit || '',
      'Item Type': item.item_type || 'Other',
      'Status': item.is_active ? 'Active' : 'Inactive',
      'VAT Status': item.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable',
      'Auto-Add to Stock': item.auto_add_to_stock ? 'Enabled' : 'Disabled',
      'Current Stock': Number(item.current_stock || 0),
      'Reorder Level': Number(item.reorder_level || 0)
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 30 },
      { wch: 10 },
      { wch: 18 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');
    XLSX.writeFile(workbook, `items-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hasActiveFilters = searchTerm || filterVat !== 'all' || filterAutoAdd !== 'all' || filterItemType !== 'all' || filterStatus !== 'active';

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading items...</p>
        </div>
      </div>
    );
  }

  const activeCount = items.filter(i => i.is_active).length;
  const inactiveCount = items.filter(i => !i.is_active).length;

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Items Management</h2>
        </div>
        <div className="page-actions">
          <button
            onClick={() => navigate('/items/add', { state: { backgroundLocation: location } })}
            className="btn btn-primary"
          >
            <FontAwesomeIcon icon={faPlus} className="button-icon" /> Add New Item
          </button>
        </div>
      </header>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="report-filter-group" style={{ flex: '1 1 250px', position: 'relative' }}>
          <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '10px', top: '35px', color: 'var(--color-text-tertiary)' }} />
          <label className="report-filter-label">Search</label>
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="report-filter-input"
            style={{ paddingLeft: '30px' }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: '10px', top: '35px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        {/* Status Filter — Active / Inactive / All */}
        <div className="report-filter-group">
          <label className="report-filter-label">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="report-filter-select"
          >
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">VAT</label>
          <select
            value={filterVat}
            onChange={(e) => setFilterVat(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All VAT Status</option>
            <option value="yes">VAT Applicable</option>
            <option value="no">VAT Not Applicable</option>
          </select>
        </div>

        {/* Auto-Add Filter Dropdown */}
        <div className="report-filter-group">
          <label className="report-filter-label">Auto-Add</label>
          <select
            value={filterAutoAdd}
            onChange={(e) => setFilterAutoAdd(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All Auto-Add Status</option>
            <option value="yes">Auto-Add Enabled</option>
            <option value="no">Auto-Add Disabled</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Item Type</label>
          <select
            value={filterItemType}
            onChange={(e) => setFilterItemType(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All Item Types</option>
            {ITEM_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <div className="report-filter-actions">
            <button
              onClick={clearSearch}
              className="btn btn-secondary"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>No Items Found</h3>
          <p>
            {hasActiveFilters
              ? "No items match your search criteria. Try adjusting your filters."
              : "Get started by adding your first item."}
          </p>
          {hasActiveFilters && (
            <button onClick={clearSearch} className="btn btn-secondary">
              Clear All Filters
            </button>
          )}
          {!hasActiveFilters && (
            <button
              onClick={() => navigate('/items/add', { state: { backgroundLocation: location } })}
              className="btn btn-primary"
            >
              <FontAwesomeIcon icon={faPlus} className="button-icon" />
              Add Your First Item
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Item Type</th>
                  <th>Status</th>
                  <th>VAT Status</th>
                  <th>Auto-Add to Stock</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Reorder Level</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} style={!item.is_active ? { opacity: 0.6 } : {}}>
                    <td>
                      <span className="badge badge-neutral">{item.item_code}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: '500' }}>{item.name}</span>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{item.unit}</span>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{item.item_type || 'Other'}</span>
                    </td>
                    {/* Active / Inactive status badge */}
                    <td>
                      <span
                        className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}
                        title={item.is_active
                          ? 'Active — visible in dropdowns and reports'
                          : 'Inactive — hidden from dropdowns and reports'}
                      >
                        <FontAwesomeIcon
                          icon={item.is_active ? faCheck : faBan}
                          style={{ fontSize: '0.7rem', marginRight: '4px' }}
                        />
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${item.vat_applicable ? 'badge-success' : 'badge-neutral'}`}>
                        {item.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${item.auto_add_to_stock ? 'badge-success' : 'badge-neutral'}`}>
                        <FontAwesomeIcon
                          icon={item.auto_add_to_stock ? faCheck : faBan}
                          style={{ fontSize: '0.7rem', marginRight: '4px' }}
                        />
                        {item.auto_add_to_stock ? 'Enabled' : 'Disabled'}
                      </span>
                      {item.auto_add_to_stock && (
                        <small style={{ display: 'block', color: '#28a745', fontSize: '10px', marginTop: '2px' }}>
                          Auto-managed
                        </small>
                      )}
                    </td>
                    <td className="report-table-value-numeric">
                      <span>{formatNumber(item.current_stock || 0)}</span>
                    </td>
                    <td className="report-table-value-numeric">
                      <span>{formatNumber(item.reorder_level || 0)}</span>
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEdit(item.id)}
                          className="btn btn-secondary btn-sm"
                          title="Edit item"
                          aria-label={`Edit ${item.name}`}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>

                        {/* Toggle Active / Inactive */}
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`btn btn-sm ${item.is_active ? 'btn-danger' : 'btn-success'}`}
                          title={item.is_active ? 'Deactivate item (hide from dropdowns & reports)' : 'Activate item (restore to dropdowns & reports)'}
                          aria-label={item.is_active ? `Deactivate ${item.name}` : `Activate ${item.name}`}
                        >
                          <FontAwesomeIcon icon={item.is_active ? faToggleOff : faToggleOn} />
                        </button>

                        {/* Soft-Delete */}
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="btn btn-danger btn-sm"
                          title="Delete item (removes from all views permanently)"
                          aria-label={`Delete ${item.name}`}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-md)' }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              <span style={{ marginRight: '15px' }}>
                <strong>{filteredItems.length}</strong> items displayed
              </span>
              {filteredItems.length !== items.length && (
                <span style={{ marginRight: '15px' }}>
                  (filtered from {items.length} total)
                </span>
              )}
              <span style={{ color: '#2e7d32', marginRight: '15px' }}>
                <strong>{activeCount}</strong> Active
              </span>
              {inactiveCount > 0 && (
                <span style={{ color: '#e65100', marginRight: '15px' }}>
                  <strong>{inactiveCount}</strong> Inactive
                </span>
              )}
              <span>
                <strong>{items.filter(i => i.auto_add_to_stock).length}</strong> Auto-Add
              </span>
            </div>
            <div>
              <button
                className="btn btn-secondary"
                onClick={handleExportExcel}
                disabled={filteredItems.length === 0}
                title="Export the currently displayed items to Excel"
              >
                <FontAwesomeIcon icon={faFileExcel} className="button-icon" />
                Export List
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ViewItems;
