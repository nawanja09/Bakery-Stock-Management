import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faEdit, faUtensils, faCalculator, faBox, faDollarSign } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const ViewFinishedGoodsItem = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  
  const [item, setItem] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outputQuantity, setOutputQuantity] = useState(''); // ✅ Changed from 25 to empty
  const [costDetails, setCostDetails] = useState({
    totalCost: 0,
    utilityCost: 0,
    perUnitCost: 0
  });

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  useEffect(() => {
    // Recalculate costs when output quantity changes
    calculateCosts(ingredients);
  }, [outputQuantity, ingredients]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch item details
      const itemResponse = await api.get(`/finished-goods-items/${id}`);
      if (itemResponse.status === 200) {
        setItem(itemResponse.data);
        
        try {
          // Fetch ingredients - handle potential 404 or 500 errors
          const ingredientsResponse = await api.get(`/finished-goods-ingredients/${id}`);
          if (ingredientsResponse.status === 200) {
            const ingredientsData = ingredientsResponse.data;
            setIngredients(ingredientsData);
            
            // Calculate costs
            calculateCosts(ingredientsData);
          }
        } catch (ingredientError) {
          console.log('No ingredients found or error fetching ingredients:', ingredientError);
          setIngredients([]);
          calculateCosts([]);
        }

        // Fetch saved output quantity from cost calculations
        try {
          const costResponse = await api.get(`/cost-calculations/finished-good/${id}`);
          if (costResponse.status === 200 && costResponse.data.length > 0) {
            const latestCalculation = costResponse.data[0];
            setOutputQuantity(latestCalculation.output_quantity || ''); // ✅ Changed from 25 to empty
          }
        } catch (error) {
          console.log('No cost calculations found, using empty output quantity');
          setOutputQuantity(''); // ✅ Changed from 25 to empty
        }
      } else {
        showPopup('error', 'Failed to fetch item details');
      }
    } catch (error) {
      console.error('Error fetching item details:', error);
      if (error.response?.status === 404) {
        showPopup('error', 'Item not found');
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateCosts = (ingredientsData) => {
    const totalCost = ingredientsData.reduce((total, ing) => {
      const quantity = parseFloat(ing.quantity) || 0;
      const unitPrice = parseFloat(ing.unit_price) || 0;
      return total + (quantity * unitPrice);
    }, 0);
    
    const utilityCost = totalCost * 0.7;
    const outputQty = parseInt(outputQuantity) || 0; // ✅ Changed from 25 to 0
    const perUnitCost = outputQty > 0 ? (totalCost + utilityCost) / outputQty : 0;
    
    setCostDetails({
      totalCost: totalCost.toFixed(2),
      utilityCost: utilityCost.toFixed(2),
      perUnitCost: perUnitCost.toFixed(2)
    });
  };

  const handleOutputChange = (e) => {
    const value = e.target.value === '' ? '' : parseInt(e.target.value); // ✅ Fixed
    setOutputQuantity(value);
  };

  const handleEdit = () => {
    navigate(`/finished-goods/items/edit/${id}`);
  };

  if (loading) {
    return (
      <div className="finished-goods-management-container">
        <div className="loading-state">
          <div className="spinner"></div>
          Loading item details...
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="finished-goods-management-container">
        <div className="empty-state">
          <FontAwesomeIcon icon={faBox} size="2x" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <div>Item not found</div>
          <button 
            onClick={() => navigate('/finished-goods/items')} 
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const sellingPrice = parseFloat(item.unit_price) || 0;
  const costPrice = parseFloat(costDetails.perUnitCost) || 0;
  const profitMargin = sellingPrice - costPrice;
  const marginPercentage = sellingPrice > 0 ? (profitMargin / sellingPrice) * 100 : 0;

  return (
    <div className="finished-goods-management-container">
      {/* Header */}
      <div className="header-section">
        <button onClick={() => navigate('/finished-goods/items')} className="back-button">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Products
        </button>
        
        <div className="header-actions">
          <div>
            <h1 className="page-title">Product Details</h1>
            <p className="page-subtitle">
              View complete information about {item.name}
            </p>
          </div>
          
          <button 
            onClick={handleEdit}
            className="btn btn-primary"
          >
            <FontAwesomeIcon icon={faEdit} />
            Edit Product
          </button>
        </div>
      </div>

      <div className="form-card">
        {/* Basic Information */}
        <section style={{ marginBottom: '2rem' }}>
          <h3 className="section-title">Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Item Code</label>
              <input 
                type="text" 
                value={item.item_code || 'N/A'}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
            </div>

            <div className="form-group">
              <label>Product Name</label>
              <input
                type="text"
                value={item.name || 'N/A'}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
            </div>
            
            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={item.category || 'N/A'}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
            </div>

            <div className="form-group">
              <label>Selling Price (Rs.)</label>
              <input
                type="number"
                value={item.unit_price || '0.00'}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
            </div>
          </div>
        </section>

        {/* Ingredients Section */}
        <section className="ingredients-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">
                <FontAwesomeIcon icon={faUtensils} style={{ marginRight: '0.5rem' }} />
                Ingredients
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Raw materials required for this product
              </p>
            </div>
          </div>

          {ingredients.length === 0 ? (
            <div className="no-ingredients">
              <FontAwesomeIcon icon={faUtensils} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <div>No ingredients added</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Add ingredients to define the recipe for this product
              </p>
            </div>
          ) : (
            <div className="ingredients-table-container">
              <table className="ingredients-table">
                <thead>
                  <tr>
                    <th>Raw Material</th>
                    <th style={{ width: '100px' }}>Unit</th>
                    <th style={{ width: '120px' }}>Quantity</th>
                    <th style={{ width: '120px' }}>Unit Price (Rs.)</th>
                    <th style={{ width: '120px' }}>Cost (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ingredient, index) => {
                    const ingredientCost = (parseFloat(ingredient.quantity) || 0) * (parseFloat(ingredient.unit_price) || 0);
                    return (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            value={ingredient.item_name || 'N/A'}
                            readOnly
                            className="form-input"
                            style={{ margin: 0, backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={ingredient.unit || 'N/A'}
                            readOnly
                            className="form-input unit-input"
                            style={{ margin: 0 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={ingredient.quantity || '0.000'}
                            readOnly
                            className="form-input"
                            style={{ margin: 0, backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={ingredient.unit_price || '0.00'}
                            readOnly
                            className="form-input"
                            style={{ margin: 0, backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={ingredientCost.toFixed(2)}
                            readOnly
                            className="form-input unit-input"
                            style={{ margin: 0, fontWeight: '600' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'right', fontWeight: '600', padding: '1rem' }}>
                      Total Raw Material Cost:
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <input
                        type="number"
                        value={costDetails.totalCost}
                        readOnly
                        className="form-input unit-input"
                        style={{ margin: 0, fontWeight: '700', color: 'var(--primary)' }}
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Cost Calculation Section */}
        <section className="cost-section">
          <h3 className="section-title">
            <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '0.5rem' }} />
            Cost Calculation
          </h3>
          
          {/* Output Quantity Input */}
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Total Output (Quantity) *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="number"
                value={outputQuantity}
                onChange={handleOutputChange}
                required
                min="1"
                step="1"
                placeholder="Enter output quantity"
                className="form-input"
                style={{ maxWidth: '200px' }}
              />
              <span style={{ 
                fontSize: '0.875rem', 
                color: 'var(--text-muted)',
                backgroundColor: 'var(--background-light)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)'
              }}>
                Units
              </span>
            </div>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem', display: 'block' }}>
              Enter the total quantity produced from these ingredients. Changing this value will update the per unit cost.
            </small>
          </div>
          
          <div className="cost-grid">
            <div className="cost-item">
              <span className="cost-label">Total Raw Material Cost:</span>
              <span className="cost-value">Rs. {costDetails.totalCost}</span>
            </div>
            
            <div className="cost-item">
              <span className="cost-label">Utility Cost (70%):</span>
              <span className="cost-value">Rs. {costDetails.utilityCost}</span>
            </div>
            
            <div className="cost-item highlight">
              <span className="cost-label">Per Unit Cost:</span>
              <span className="cost-value">Rs. {costDetails.perUnitCost}</span>
            </div>

            <div className="cost-item" style={{ gridColumn: '1 / -1' }}>
              <span className="cost-label">Total Production Cost:</span>
              <span className="cost-value" style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Rs. {(parseFloat(costDetails.totalCost) + parseFloat(costDetails.utilityCost)).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="formula-display">
            <strong>Formula:</strong> Per Unit Cost = (Total Raw Material Cost + Utility Cost) ÷ Output Quantity
            <br />
            <span style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
              Utility Cost = Total Raw Material Cost × 0.7
            </span>
            <br />
            <span style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.5rem', display: 'block' }}>
              Current Calculation: ({costDetails.totalCost} + {costDetails.utilityCost}) ÷ {outputQuantity || 0} = {costDetails.perUnitCost}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ViewFinishedGoodsItem;