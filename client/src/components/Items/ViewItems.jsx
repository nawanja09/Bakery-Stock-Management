import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import './ItemManagement.css';
import api from '../../api';

const ViewItems = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      const data = response.data;
      if (response.status === 200) {
        setItems(data);
      } else {
        showPopup('error', data.error || 'Failed to fetch items');
      }
    } catch (err) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (id) => {
    navigate(`/items/edit/${id}`);
  };

  const handleDelete = async (id) => {
    const itemToDelete = items.find(item => item.id === id);
    
    if (!itemToDelete) return;

    if (window.confirm(`Are you sure you want to delete item "${itemToDelete.name}" (${itemToDelete.item_code})?`)) {
      try {
        const response = await api.delete(`/items/${id}`);

        if (response.status === 200) {
          setItems(items.filter(item => item.id !== id));
          showPopup('success', 'Item deleted successfully!');
        } else {
          const data = response.data;
          showPopup('error', data.error || 'Failed to delete item');
        }
      } catch (error) {
        if (error.response && error.response.data && error.response.data.error) {
          showPopup('error', error.response.data.error);
        } else {
          showPopup('error', 'Network error. Please try again.');
        }
      }
    }
  };

  const handleAddNew = () => {
    navigate('/items/add');
  };

  const filteredItems = items.filter(item =>
    item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="item-container">
      <div className="item-header">
        <h2>Item List</h2>
        <div className="item-header-actions">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search by item code or name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={handleAddNew} className="btn-add">
            <FontAwesomeIcon icon={faPlus} /> Add New Item
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading items...</p>
      ) : filteredItems.length === 0 ? (
        <p>No items found. {searchTerm && 'Try a different search term.'}</p>
      ) : (
        <table className="items-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Unit</th>
              <th>Reorder Level</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id}>
                <td>{item.item_code}</td>
                <td>{item.name}</td>
                <td>{item.unit}</td>
                <td>{item.reorder_level}</td>
                <td className="actions">
                  <button 
                    onClick={() => handleEdit(item.id)} 
                    className="btn-edit"
                    title="Edit Item"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)} 
                    className="btn-delete"
                    title="Delete Item"
                  >
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

export default ViewItems;