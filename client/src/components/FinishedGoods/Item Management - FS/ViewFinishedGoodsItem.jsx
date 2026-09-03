import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faEdit, faUtensils, faCalculator, faBox, faDollarSign } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const ViewFinishedGoodsItem = () => {
  const { id: rawId } = useParams();
  // Extract only the numeric part of the ID (in case it contains extra characters like "20:1")
  const id = rawId?.split(':')[0] || '';
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  
  const [item, setItem] = useState(null);
  const location = useLocation();
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [costDetails, setCostDetails] = useState({
    totalCost: 0,
    utilityCost: 0,
    perUnitCost: 0
  });

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  useEffect(() => {
    if (item) {
      calculateCosts(ingredients, item.output_quantity);
    }
  }, [item, ingredients]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch item details
      const itemResponse = await api.get(`/finished-goods-items/${id}`);
      if (itemResponse.status === 200) {
        const itemData = itemResponse.data;
        setItem(itemData);
        
        try {
          // Fetch ingredients
          const ingredientsResponse = await api.get(`/finished-goods-ingredients/${id}`);
          if (ingredientsResponse.status === 200) {
            const ingredientsData = ingredientsResponse.data;
            setIngredients(ingredientsData);
            
            // Calculate costs with the saved output quantity
            calculateCosts(ingredientsData, itemData.output_quantity);
          }
        } catch (ingredientError) {
          console.log('No ingredients found or error fetching ingredients:', ingredientError);
          setIngredients([]);
          calculateCosts([], itemData.output_quantity);
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

  const calculateCosts = (ingredientsData, outputQuantity) => {
    const totalCost = ingredientsData.reduce((total, ing) => {
      // FIX: Safely parse quantity and unit price
      const quantity = parseFloat(ing.quantity) || 0;
      const unitPrice = parseFloat(ing.unit_price) || 0;
      return total + (quantity * unitPrice);
    }, 0);
    
    const utilityCost = totalCost * 0.7;
    const outputQty = parseInt(outputQuantity) || 1;
    const perUnitCost = outputQty > 0 ? (totalCost + utilityCost) / outputQty : 0;
    
    setCostDetails({
      totalCost: totalCost.toFixed(2),
      utilityCost: utilityCost.toFixed(2),
      perUnitCost: perUnitCost.toFixed(2)
    });
  };

  const handleEdit = () => {
    navigate(`/finished-goods/items/edit/${id}`, { state: { backgroundLocation: location } });
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

  // FIX: Safely parse prices
  const sellingPrice = parseFloat(item.unit_price) || 0;
  const costPrice = parseFloat(costDetails.perUnitCost) || 0;
  const profitMargin = sellingPrice - costPrice;
  const marginPercentage = sellingPrice > 0 ? (profitMargin / sellingPrice) * 100 : 0;

  return (
    <div className="finished-goods-management-container">
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
                value={sellingPrice.toFixed(2)}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
            </div>

            <div className="form-group">
              <label>Total Output (Quantity)</label>
              <input
                type="number"
                value={item.output_quantity || 1}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Output quantity can be modified in Edit mode
              </small>
            </div>
          </div>
        </section>

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
                    // FIX: Safely calculate ingredient cost
                    const quantity = parseFloat(ingredient.quantity) || 0;
                    const unitPrice = parseFloat(ingredient.unit_price) || 0;
                    const ingredientCost = quantity * unitPrice;
                    
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
                            value={quantity.toFixed(3)}
                            readOnly
                            className="form-input"
                            style={{ margin: 0, backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={unitPrice.toFixed(2)}
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

        <section className="cost-section">
          <h3 className="section-title">
            <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '0.5rem' }} />
            Cost Calculation
          </h3>
          
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

            <div className="cost-item">
              <span className="cost-label">Selling Price:</span>
              <span className="cost-value">Rs. {sellingPrice.toFixed(2)}</span>
            </div>

            <div className="cost-item">
              <span className="cost-label">Profit Margin:</span>
              <span className="cost-value" style={{ color: profitMargin >= 0 ? '#059669' : '#dc2626' }}>
                Rs. {profitMargin.toFixed(2)} ({marginPercentage.toFixed(1)}%)
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
              Current Calculation: ({costDetails.totalCost} + {costDetails.utilityCost}) ÷ {item.output_quantity || 1} = {costDetails.perUnitCost}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ViewFinishedGoodsItem;