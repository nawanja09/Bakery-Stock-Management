import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './OpeningBalance.css';
import api from '../../api';

const OpeningBalanceHistory = () => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // store record being edited
  const [editData, setEditData] = useState({ date: '', quantity: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    try {
      const response = await api.get('/opening-balance');
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
      await api.put(`/opening-balance/${id}`, editData);
      setEditing(null);
      fetchBalances(); // reload table
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  // Filter balances based on search term
  const filteredBalances = balances.filter(balance =>
    balance.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    balance.item_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="opening-balance-container">
      <div className="header-buttons">
        <button onClick={() => navigate('/opening/add')} className="btn-add">
          + Add New
        </button>
        {/* Search Input */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by item code or name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <h2>Opening Balance History</h2>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : filteredBalances.length === 0 ? (
        <p>No matching opening balances found</p>
      ) : (
        <table className="opening-balance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBalances.map(balance => (
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
                    />
                  ) : (
                    Number(balance.quantity).toFixed(3)
                  )}
                </td>
                <td>{balance.unit}</td>
                <td>
                  {editing === balance.id ? (
                    <>
                      <button onClick={() => handleUpdate(balance.id)}>Save</button>
                      <button onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => handleEditClick(balance)}>Edit</button>
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

export default OpeningBalanceHistory;
