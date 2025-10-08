import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator, faEye, faTrash, faArrowLeft, faSave} from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './CostCalculator.css';

const SavedCosting = () => {
  const [savedCalculations, setSavedCalculations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCalculation, setSelectedCalculation] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchSavedCalculations();
  }, []);

  const fetchSavedCalculations = async () => {
    try {
      const response = await api.get('/cost-calculations');
      setSavedCalculations(response.data);
    } catch (error) {
      console.error('Error fetching saved calculations:', error);
      showPopup('error', 'Failed to load saved calculations');
    } finally {
      setLoading(false);
    }
  };

  const viewCalculationDetails = async (id) => {
    try {
      const response = await api.get(`/cost-calculations/${id}`);
      setSelectedCalculation(response.data);
      setShowDetails(true);
    } catch (error) {
      console.error('Error fetching calculation details:', error);
      showPopup('error', 'Failed to load calculation details');
    }
  };

  const deleteCalculation = async (id) => {
    if (window.confirm('Are you sure you want to delete this cost calculation?')) {
      try {
        await api.delete(`/cost-calculations/${id}`);
        showPopup('success', 'Cost calculation deleted successfully!');
        fetchSavedCalculations();
      } catch (error) {
        console.error('Error deleting calculation:', error);
        showPopup('error', 'Failed to delete calculation');
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="cost-calculator-container">
        <div className="loading-state">Loading saved calculations...</div>
      </div>
    );
  }

  if (showDetails && selectedCalculation) {
    return (
      <div className="cost-calculator-container">
        <div className="details-header">
          <button 
            className="btn-back"
            onClick={() => setShowDetails(false)}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Back to List
          </button>
          <h2>Cost Calculation Details</h2>
        </div>

        <div className="calculation-details">
          <div className="detail-section">
            <h3>Basic Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Created Date:</label>
                <span>{formatDate(selectedCalculation.created_at)}</span>
              </div>
              <div className="detail-item">
                <label>Finished Good:</label>
                <span>{selectedCalculation.finished_good_name}</span>
              </div>
              <div className="detail-item">
                <label>Output Quantity:</label>
                <span>{selectedCalculation.output_quantity}</span>
              </div>
              <div className="detail-item">
                <label>Total Cost:</label>
                <span>Rs. {parseFloat(selectedCalculation.total_cost).toFixed(2)}</span>
              </div>
              <div className="detail-item">
                <label>Per Unit Cost:</label>
                <span>Rs. {parseFloat(selectedCalculation.per_unit_cost).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>Ingredients</h3>
            <table className="ingredients-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Unit Price (Rs.)</th>
                  <th>Cost (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {selectedCalculation.ingredients.map((ingredient, index) => (
                  <tr key={index}>
                    <td>{ingredient.item_name}</td>
                    <td>{ingredient.unit}</td>
                    <td>{parseFloat(ingredient.quantity).toFixed(3)}</td>
                    <td>{parseFloat(ingredient.unit_price).toFixed(2)}</td>
                    <td>{parseFloat(ingredient.cost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cost-calculator-container">
      <div className="header-actions">
        <h1 className="page-title">
          <FontAwesomeIcon icon={faSave} /> Saved Cost Calculations
        </h1>
        <button 
          className="btn-primary"
          onClick={() => navigate('/cost-calculator/calculate')}
        >
          <FontAwesomeIcon icon={faCalculator} /> New Calculation
        </button>
      </div>

      {savedCalculations.length === 0 ? (
        <div className="empty-state">
          <p>No saved cost calculations found.</p>
          <button 
            className="btn-primary"
            onClick={() => navigate('/cost-calculator/calculate')}
          >
            Create Your First Calculation
          </button>
        </div>
      ) : (
        <div className="calculations-list">
          <table className="calculations-table">
            <thead>
              <tr>
                <th>Created Date</th>
                <th>Finished Good</th>
                <th>Output Quantity</th>
                <th>Total Cost (Rs.)</th>
                <th>Per Unit Cost (Rs.)</th>
                <th>Ingredients</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {savedCalculations.map(calculation => (
                <tr key={calculation.id}>
                  <td>{formatDate(calculation.created_at)}</td>
                  <td>{calculation.finished_good_name}</td>
                  <td>{calculation.output_quantity}</td>
                  <td>{parseFloat(calculation.total_cost).toFixed(2)}</td>
                  <td>{parseFloat(calculation.per_unit_cost).toFixed(2)}</td>
                  <td>{calculation.ingredient_count} items</td>
                  <td className="actions">
                    <button 
                      className="btn-view"
                      onClick={() => viewCalculationDetails(calculation.id)}
                      title="View Details"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button 
                      className="btn-delete"
                      onClick={() => deleteCalculation(calculation.id)}
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SavedCosting;