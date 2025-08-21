import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './OpeningBalance.css';
import api from '../../api';

const OpeningBalanceHistory = () => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
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

    fetchBalances();
  }, []);

  return (
    <div className="opening-balance-container">
      <div className="header-buttons">
        <button onClick={() => navigate('/opening/add')} className="btn-add">
          + Add New
        </button>
      </div>

      <h2>Opening Balance History</h2>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : balances.length === 0 ? (
        <p>No opening balances found</p>
      ) : (
        <table className="opening-balance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Cost (Rs.)</th>
              <th>Total Value (Rs.)</th>
              <th>Entered By</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(balance => (
              <tr key={balance.id}>
                <td>{new Date(balance.date).toLocaleDateString()}</td>
                <td>{balance.item_name}</td>
                <td>{balance.quantity}</td>
                <td>{balance.unit}</td>
                <td>{Number(balance.unit_cost).toFixed(2)}</td>
                <td>{Number(balance.total_value).toFixed(2)}</td>
                <td>{balance.entered_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default OpeningBalanceHistory;
