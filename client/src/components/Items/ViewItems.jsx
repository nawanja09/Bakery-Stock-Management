import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  faToggleOff
} from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { ITEM_TYPE_OPTIONS } from './itemTypeOptions';
import { formatNumber } from '../../utils/formatters';

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
    navigate(`/items/edit/${id}`);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFilterVat('all');
    setFilterAutoAdd('all');
    setFilterItemType('all');
    setFilterStatus('active');
  };

  const hasActiveFilters = searchTerm || filterVat !== 'all' || filterAutoAdd !== 'all' || filterItemType !== 'all' || filterStatus !== 'active';

  if (loading) {
    return (
      <div className="minimal-container">
        <div className="minimal-card loading-card">
          <div className="minimal-spinner"></div>
          <p className="loading-text">Loading items...</p>
        </div>
      </div>
    );
  }

  const activeCount = items.filter(i => i.is_active).length;
  const inactiveCount = items.filter(i => !i.is_active).length;

  return (
    <div className="items-table-container">
      <div className="items-table-header">
        <h2 className="items-table-title">Items Management</h2>
        <div className="items-table-actions">
          <button
            onClick={() => navigate('/items/add')}
            className="minimal-button minimal-button-primary"
          >
            <FontAwesomeIcon icon={faPlus} className="button-icon" />
            Add New Item
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="items-search">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        {/* Status Filter — Active / Inactive / All */}
        <div className="filter-dropdown">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="minimal-select filter-select"
          >
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="filter-dropdown">
          <select
            value={filterVat}
            onChange={(e) => setFilterVat(e.target.value)}
            className="minimal-select filter-select"
          >
            <option value="all">All VAT Status</option>
            <option value="yes">VAT Applicable</option>
            <option value="no">VAT Not Applicable</option>
          </select>
        </div>

        {/* Auto-Add Filter Dropdown */}
        <div className="filter-dropdown">
          <select
            value={filterAutoAdd}
            onChange={(e) => setFilterAutoAdd(e.target.value)}
            className="minimal-select filter-select"
          >
            <option value="all">All Auto-Add Status</option>
            <option value="yes">Auto-Add Enabled</option>
            <option value="no">Auto-Add Disabled</option>
          </select>
        </div>

        <div className="filter-dropdown">
          <select
            value={filterItemType}
            onChange={(e) => setFilterItemType(e.target.value)}
            className="minimal-select filter-select"
          >
            <option value="all">All Item Types</option>
            {ITEM_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearSearch}
            className="minimal-button minimal-button-secondary clear-filters"
          >
            Clear Filters
          </button>
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
            <button onClick={clearSearch} className="minimal-button minimal-button-secondary">
              Clear All Filters
            </button>
          )}
          {!hasActiveFilters && (
            <button
              onClick={() => navigate('/items/add')}
              className="minimal-button minimal-button-primary"
            >
              <FontAwesomeIcon icon={faPlus} className="button-icon" />
              Add Your First Item
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="minimal-table">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Item Type</th>
                  <th>Status</th>
                  <th>VAT Status</th>
                  <th>Auto-Add to Stock</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} style={!item.is_active ? { opacity: 0.6 } : {}}>
                    <td>
                      <span className="item-code-badge">{item.item_code}</span>
                    </td>
                    <td className="item-name-cell">
                      <span className="item-name">{item.name}</span>
                    </td>
                    <td>
                      <span className="unit-badge">{item.unit}</span>
                    </td>
                    <td>
                      <span className="unit-badge">{item.item_type || 'Other'}</span>
                    </td>
                    {/* Active / Inactive status badge */}
                    <td>
                      <span
                        className={`auto-add-badge ${item.is_active ? 'enabled' : 'disabled'}`}
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
                      <span className={`vat-status-badge ${item.vat_applicable ? 'applicable' : 'not-applicable'}`}>
                        {item.vat_applicable ? 'VAT Applicable' : 'VAT Not Applicable'}
                      </span>
                    </td>
                    <td>
                      <span className={`auto-add-badge ${item.auto_add_to_stock ? 'enabled' : 'disabled'}`}>
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
                    <td>
                      <span className="current-stock">{formatNumber(item.current_stock || 0)}</span>
                    </td>
                    <td>
                      <span className="reorder-level">{formatNumber(item.reorder_level || 0)}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          onClick={() => handleEdit(item.id)}
                          className="btn-icon edit"
                          title="Edit item"
                          aria-label={`Edit ${item.name}`}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>

                        {/* Toggle Active / Inactive */}
                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`btn-icon ${item.is_active ? 'delete' : 'edit'}`}
                          title={item.is_active ? 'Deactivate item (hide from dropdowns & reports)' : 'Activate item (restore to dropdowns & reports)'}
                          aria-label={item.is_active ? `Deactivate ${item.name}` : `Activate ${item.name}`}
                          style={item.is_active
                            ? { background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }
                            : { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' }
                          }
                        >
                          <FontAwesomeIcon icon={item.is_active ? faToggleOff : faToggleOn} />
                        </button>

                        {/* Soft-Delete */}
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="btn-icon delete"
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

          <div className="table-footer">
            <div className="table-stats">
              <span className="stat-item">
                <strong>{filteredItems.length}</strong> items displayed
              </span>
              {filteredItems.length !== items.length && (
                <span className="stat-item text-muted">
                  (filtered from {items.length} total)
                </span>
              )}
              <span className="stat-item" style={{ color: '#2e7d32' }}>
                <strong>{activeCount}</strong> Active
              </span>
              {inactiveCount > 0 && (
                <span className="stat-item" style={{ color: '#e65100' }}>
                  <strong>{inactiveCount}</strong> Inactive
                </span>
              )}
              <span className="stat-item">
                <strong>{items.filter(i => i.auto_add_to_stock).length}</strong> Auto-Add
              </span>
            </div>
            <div className="table-export">
              <button className="minimal-button minimal-button-secondary" disabled>
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
