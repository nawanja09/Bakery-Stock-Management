import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus, faSearch, faBox, faEye } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const ViewFinishedGoodsItems = () => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/finished-goods-items');
      const data = response.data;

      if (response.status === 200) {
        // Sort numerically based on item_code (e.g., FG001 -> 1, FG010 -> 10)
        const sortedData = data.sort((a, b) => {
          const numA = parseInt(a.item_code.replace(/\D/g, ''), 10);
          const numB = parseInt(b.item_code.replace(/\D/g, ''), 10);
          return numA - numB;
        });

        setItems(sortedData);
        setFilteredItems(sortedData);
      } else {
        showPopup('error', data.error || 'Failed to fetch items');
      }
    } catch (err) {
      console.error('Error fetching items:', err);
      if (err.code === 'ERR_NETWORK') {
        showPopup('error', 'Cannot connect to server. Please make sure the backend is running.');
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const filtered = items.filter(item =>
      item.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredItems(filtered);
  }, [searchTerm, items]);

  const handleView = (id) => {
    navigate(`/finished-goods/items/view/${id}`);
  };

  const handleEdit = (id) => {
    navigate(`/finished-goods/items/edit/${id}`);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      try {
        const response = await api.delete(`/finished-goods-items/${id}`);

        if (response.status === 200) {
          setItems(items.filter(item => item.id !== id));
          showPopup('success', 'Item deleted successfully!');
        } else {
          const data = response.data;
          showPopup('error', data.error || 'Failed to delete item');
        }
      } catch (error) {
        console.error('Error deleting item:', error);
        showPopup('error', 'Network error. Please try again.');
      }
    }
  };

  return (
    <div className="finished-goods-container">
      {/* Header */}
      <div className="header-buttons">
        <div>
          <h1 className="page-title">Finished Goods</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Manage your finished products and their ingredients
          </p>
        </div>
        <button 
          onClick={() => navigate('/finished-goods/items/add')} 
          className="btn btn-primary"
        >
          <FontAwesomeIcon icon={faPlus} />
          Add New Item
        </button>
      </div>

      {/* Search */}
      <div className="search-container">
        <FontAwesomeIcon icon={faSearch} className="search-icon" />
        <input
          type="text"
          placeholder="Search items by code, name, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          Loading items...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faBox} size="2x" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <div style={{ fontSize: '1.125rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            {searchTerm ? 'No items found' : 'No finished goods items'}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            {searchTerm 
              ? 'Try adjusting your search terms' 
              : 'Get started by adding your first finished product'
            }
          </p>
          {!searchTerm && (
            <button 
              onClick={() => navigate('/finished-goods/items/add')} 
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add New Item
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="finished-goods-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Ingredients</th>
                <th style={{ width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {item.item_code}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: '500' }}>{item.name}</div>
                  </td>
                  <td>
                    <span className="category-badge">
                      {item.category}
                    </span>
                  </td>
                  <td>
                    {item.has_ingredients ? (
                      <span className="ingredients-badge">
                        {item.has_ingredients}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No ingredients
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button 
                        onClick={() => handleView(item.id)} 
                        className="btn-icon"
                        title="View item details"
                        style={{ color: '#3b82f6' }}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button 
                        onClick={() => handleEdit(item.id)} 
                        className="btn-icon"
                        title="Edit item"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        className="btn-icon error"
                        title="Delete item"
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
      )}

      {/* Results Count */}
      {!loading && filteredItems.length > 0 && (
        <div style={{ 
          marginTop: '1rem', 
          textAlign: 'center', 
          color: 'var(--text-muted)',
          fontSize: '0.875rem'
        }}>
          Showing {filteredItems.length} of {items.length} items
          {searchTerm && ` for "${searchTerm}"`}
        </div>
      )}
    </div>
  );
};

export default ViewFinishedGoodsItems;