// client/src/components/Items/ViewItems.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import './ItemManagement.css';

const ViewItems = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/items');
        const data = await response.json();
        if (response.ok) {
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

    fetchItems();
  }, [showPopup]);

  const handleEdit = (id) => {
    navigate(`/items/edit/${id}`);
  };

  
    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
            const response = await fetch(`http://localhost:5000/api/items/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setItems(items.filter(item => item.id !== id));
                setMessage('Item deleted successfully!');
                setTimeout(() => navigate('/items'), 1500); 
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete item');
            }
            } catch (error) {
            alert('Network error. Please try again.');
            }
        }
    };

  return (
    <div className="item-container">
      <h2>Item List</h2>

      {loading ? (
        <p>Loading items...</p>
      ) : items.length === 0 ? (
        <p>No items found</p>
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
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.item_code}</td>
                <td>{item.name}</td>
                <td>{item.unit}</td>
                <td>{item.reorder_level}</td>
                <td className="actions">
                  <button onClick={() => handleEdit(item.id)} className="btn-edit">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="btn-delete">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default ViewItems;