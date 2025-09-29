import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus, faSearch } from '@fortawesome/free-solid-svg-icons';
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
    const fetchItems = async () => {
      try {
        const response = await api.get('/finished-goods-items');
        const data = response.data;
        if (response.status === 200) {
          setItems(data);
          setFilteredItems(data);
        } else {
          showPopup('error', data.error || 'Failed to fetch items');
        }
      } catch (err) {
        showPopup('error', 'Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [showPopup]);

  useEffect(() => {
    const filtered = items.filter(item =>
      item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredItems(filtered);
  }, [searchTerm, items]);

  const handleEdit = (id) => {
    navigate(`/finished-goods/items/edit/${id}`);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const response = await api.delete(`/finished-goods-items/${id}`);

        if (response.status === 200) {
          setItems(items.filter(item => item.id !== id));
          showPopup('success', 'Finished Goods Item deleted successfully!');
        } else {
          const data = response.data;
          showPopup('error', data.error || 'Failed to delete item');
        }
      } catch (error) {
        showPopup('error', 'Network error. Please try again.');
      }
    }
  };

  return (
    <div className="finished-goods-container">
      <div className="header-buttons">
        <h1 className="page-title">Finished Goods Items</h1>
        <button onClick={() => navigate('/finished-goods/items/add')} className="btn-add">
          <FontAwesomeIcon icon={faPlus} /> Add New Item
        </button>
      </div>

      {/* Search Bar */}
      <div className="form-group" style={{marginBottom: '2rem', maxWidth: '400px'}}>
        <div style={{position: 'relative'}}>
          <FontAwesomeIcon 
            icon={faSearch} 
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af'
            }} 
          />
          <input
            type="text"
            placeholder="Search items by code, name, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: '2.5rem',
              width: '100%'
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading items...</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          {searchTerm ? 'No items found matching your search.' : 'No finished goods items found.'}
        </div>
      ) : (
        <table className="finished-goods-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Unit Price (LKR)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id}>
                <td style={{fontWeight: '500', color: '#1f2937'}}>{item.item_code}</td>
                <td>{item.name}</td>
                <td>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    backgroundColor: '#f3f4f6',
                    color: '#374151'
                  }}>
                    {item.category}
                  </span>
                </td>
                <td style={{fontWeight: '600', color: '#059669'}}>
                  {parseFloat(item.unit_price).toFixed(2)}
                </td>
                <td className="actions">
                  <button onClick={() => handleEdit(item.id)} className="btn-edit" title="Edit">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="btn-delete" title="Delete">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ViewFinishedGoodsItems;