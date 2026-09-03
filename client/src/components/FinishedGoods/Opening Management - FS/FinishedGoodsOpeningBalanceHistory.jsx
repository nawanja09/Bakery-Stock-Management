import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './FinishedGoodsOpeningBalance.css';
import api from '../../../api';

const FinishedGoodsOpeningBalanceHistory = () => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({ date: '', quantity: '' });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    try {
      const response = await api.get('/finished-goods-opening-balance');
      setBalances(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (balance) => {
    setEditing(balance.id);
    setEditData({
      date: balance.date.split('T')[0],
      quantity: balance.quantity
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseFloat(value) : value
    }));
  };

  const handleUpdate = async (id) => {
    try {
      await api.put(`/finished-goods-opening-balance/${id}`, editData);
      setEditing(null);
      fetchBalances();
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this opening balance?')) {
      try {
        await api.delete(`/finished-goods-opening-balance/${id}`);
        fetchBalances();
      } catch (err) {
        alert(err.response?.data?.error || 'Delete failed');
      }
    }
  };

  return (
    <div className="fg-opening-balance-container">
      <div className="fg-header-buttons">
        <button onClick={() => navigate('/finished-goods/opening/add', { state: { backgroundLocation: location } })} className="fg-btn-add">
          + Add New Opening Balance
        </button>
      </div>

      <h2>Finished Goods Opening Balance History</h2>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="fg-error">{error}</p>
      ) : balances.length === 0 ? (
        <p>No finished goods opening balances found</p>
      ) : (
        <table className="fg-opening-balance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Quantity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(balance => (
              <tr key={balance.id}>
                <td>
                  {editing === balance.id ? (
                    <input
                      type="date"
                      name="date"
                      value={editData.date}
                      onChange={handleEditChange}
                    />
                  ) : (
                    new Date(balance.date).toLocaleDateString()
                  )}
                </td>
                <td>{balance.item_code}</td>
                <td>{balance.item_name}</td>
                <td>{balance.category}</td>
                <td style={{
                  color: Number(balance.quantity) < 0 ? 'red' : Number(balance.quantity) === 0 ? 'orange' : 'green',
                  fontWeight: 'bold'
                }}>
                  {editing === balance.id ? (
                    <input
                      type="number"
                      name="quantity"
                      value={editData.quantity}
                      onChange={handleEditChange}
                      min="0"
                      step="1"
                      className="fg-edit-input"
                    />
                  ) : (
                    Number(balance.quantity).toFixed(0)
                  )}
                </td>
                <td>
                  {editing === balance.id ? (
                    <>
                      <button onClick={() => handleUpdate(balance.id)} className="fg-btn-save">Save</button>
                      <button onClick={() => setEditing(null)} className="fg-btn-cancel">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEditClick(balance)} className="fg-btn-edit">Edit</button>
                      <button onClick={() => handleDelete(balance.id)} className="fg-btn-delete">Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default FinishedGoodsOpeningBalanceHistory;