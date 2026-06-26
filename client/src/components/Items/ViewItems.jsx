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
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import './ItemManagement.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const ItemsList = () => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVat, setFilterVat] = useState('all');
  const [filterAutoAdd, setFilterAutoAdd] = useState('all');
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [searchTerm, filterVat, filterAutoAdd, items]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/items');
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
        // Convert both to boolean for comparison
        return Boolean(item.vat_applicable) === vatValue;
      });
    }

    // Apply Auto-Add filter
    if (filterAutoAdd !== 'all') {
      const autoAddValue = filterAutoAdd === 'yes';
      filtered = filtered.filter(item => {
        // Convert both to boolean for comparison
        return Boolean(item.auto_add_to_stock) === autoAddValue;
      });
    }

    setFilteredItems(filtered);
  };

  const handleDelete = async (id, itemName) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) {
      return;
    }

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
  };

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

        {(searchTerm || filterVat !== 'all' || filterAutoAdd !== 'all') && (
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
            {searchTerm || filterVat !== 'all' || filterAutoAdd !== 'all'
              ? "No items match your search criteria. Try adjusting your filters." 
              : "Get started by adding your first item."}
          </p>
          {(searchTerm || filterVat !== 'all' || filterAutoAdd !== 'all') && (
            <button onClick={clearSearch} className="minimal-button minimal-button-secondary">
              Clear All Filters
            </button>
          )}
          {!searchTerm && filterVat === 'all' && filterAutoAdd === 'all' && (
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
                  <th>VAT Status</th>
                  <th>Auto-Add to Stock</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id}>
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
                      <span className="current-stock">{item.current_stock || 0}</span>
                    </td>
                    <td>
                      <span className="reorder-level">{item.reorder_level}</span>
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
                        <button 
                          onClick={() => handleDelete(item.id, item.name)} 
                          className="btn-icon delete"
                          title="Delete item"
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

export default ItemsList;