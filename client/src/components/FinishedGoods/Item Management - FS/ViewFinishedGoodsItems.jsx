import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus, faSearch, faBox, faEye } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsManagement.css';

const ViewFinishedGoodsItems = () => {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
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

  const handleView = (id) => navigate(`/finished-goods/items/view/${id}`, { state: { backgroundLocation: location } });
  const handleEdit = (id) => navigate(`/finished-goods/items/edit/${id}`, { state: { backgroundLocation: location } });

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const response = await api.delete(`/finished-goods-items/${id}`);
        if (response.status === 200) {
          setItems(items.filter(item => item.id !== id));
          showPopup('success', 'Item deleted successfully!');
        } else showPopup('error', 'Failed to delete item');
      } catch (err) {
        console.error(err);
        showPopup('error', 'Network error. Please try again.');
      }
    }
  };

  return (
    <div className="fg-container">
      
      {/* Header */}
      <div className="fg-header">
        <div>
          <h1 className="fg-title">Finished Goods</h1>
          <p className="fg-subtitle">Minimalist view of your finished products</p>
        </div>

        <button onClick={() => navigate('/finished-goods/items/add', { state: { backgroundLocation: location } })} className="fg-btn-primary">
          <FontAwesomeIcon icon={faPlus} /> Add Item
        </button>
      </div>

      {/* Search */}
      <div className="fg-search-box">
        <FontAwesomeIcon icon={faSearch} className="fg-search-icon" />
        <input
          placeholder="Search by code, name, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="fg-search-input"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="fg-loading">
          <div className="fg-spinner"></div>
          <span>Loading items...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="fg-empty">
          <FontAwesomeIcon icon={faBox} size="3x" />
          <h3>No items found</h3>
          <p>Try adjusting your search or add a new item.</p>
          {!searchTerm && (
            <button onClick={() => navigate('/finished-goods/items/add', { state: { backgroundLocation: location } })} className="fg-btn-primary mt">
              <FontAwesomeIcon icon={faPlus} /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <div className="fg-table-wrapper">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Ingredients</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id}>
                  <td className="fg-bold">{item.item_code}</td>
                  <td>{item.name}</td>
                  <td><span className="fg-tag">{item.category}</span></td>
                  <td>
                    {item.has_ingredients ? (
                      <span className="fg-badge">{item.has_ingredients}</span>
                    ) : (
                      <span className="fg-empty-text">None</span>
                    )}
                  </td>
                  <td className="fg-actions">
                    <button className="fg-icon-btn" onClick={() => handleView(item.id)}>
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button className="fg-icon-btn" onClick={() => handleEdit(item.id)}>
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button className="fg-icon-btn danger" onClick={() => handleDelete(item.id)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Count */}
      {!loading && filteredItems.length > 0 && (
        <div className="fg-count">
          Showing {filteredItems.length} of {items.length} items
          {searchTerm && ` for "${searchTerm}"`}
        </div>
      )}
    </div>
  );
};

export default ViewFinishedGoodsItems;