import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const ViewFinishedGoodsItems = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await api.get('/finished-goods-items');
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

    fetchItems();
  }, [showPopup]);

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
        <button onClick={() => navigate('/finished-goods/items/add')} className="btn-add">
          <FontAwesomeIcon icon={faPlus} /> Add New Item
        </button>
      </div>

      <h2>Finished Goods Item List</h2>

      {loading ? (
        <p>Loading items...</p>
      ) : items.length === 0 ? (
        <p>No finished goods items found</p>
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
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.item_code}</td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{parseFloat(item.unit_price).toFixed(2)}</td>
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
    </div>
  );
};

export default ViewFinishedGoodsItems;