import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlus, faTrash, faUtensils, faCalculator } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsManagement.css';
import api from '../../../api';

const EditFinishedGoodsItem = () => {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    item_code: '',
    name: '',
    category: 'Cake',
    unit_price: ''
  });
  const [ingredients, setIngredients] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [isLoadingRawMaterials, setIsLoadingRawMaterials] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchRawMaterials();
    fetchPreviousPurchasePrices();
    fetchItem();
  }, [id]);

  const fetchRawMaterials = async () => {
    setIsLoadingRawMaterials(true);
    try {
      const response = await api.get('/finished-goods-ingredients/raw-materials');
      if (response.status === 200) {
        setRawMaterials(response.data);
      } else {
        showPopup('error', 'Failed to fetch raw materials');
      }
    } catch (error) {
      console.error('Error fetching raw materials:', error);
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoadingRawMaterials(false);
    }
  };

  const fetchPreviousPurchasePrices = async () => {
    try {
      const response = await api.get('/purchases/previous-prices');
      setPreviousPurchasePrices(response.data);
    } catch (error) {
      console.error('Error fetching previous purchase prices:', error);
    }
  };

  const fetchItem = async () => {
    try {
      // Fetch item details
      const itemResponse = await api.get(`/finished-goods-items/${id}`);
      const itemData = itemResponse.data;

      if (itemResponse.status === 200) {
        setFormData({
          item_code: itemData.item_code || '',
          name: itemData.name || '',
          category: itemData.category || 'Cake',
          unit_price: itemData.unit_price || ''
        });

        // Fetch ingredients for this item
        const ingredientsResponse = await api.get(`/finished-goods-ingredients/${id}`);
        if (ingredientsResponse.status === 200) {
          const ingredientsData = ingredientsResponse.data;
          const formattedIngredients = ingredientsData.map(ing => {
            const selectedMaterial = rawMaterials.find(rm => rm.id === ing.raw_material_id);
            const unitPrice = previousPurchasePrices[ing.raw_material_id] || ing.unit_price || 0;
            const cost = (ing.quantity * unitPrice).toFixed(2);
            
            return {
              id: ing.id,
              raw_material_id: ing.raw_material_id?.toString() || '',
              item_name: ing.item_name || '',
              unit: ing.unit || '',
              quantity: ing.quantity?.toString() || '',
              unit_price: unitPrice,
              cost: cost
            };
          });
          setIngredients(formattedIngredients);
        }
      } else {
        showPopup('error', itemData.error || 'Failed to fetch item');
      }
    } catch (error) {
      console.error('Error fetching item:', error);
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setFetchLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...ingredients];
    
    if (field === 'raw_material_id') {
      const selectedMaterial = rawMaterials.find(rm => rm.id === parseInt(value));
      if (selectedMaterial) {
        // Auto-populate all fields when raw material is selected
        updatedIngredients[index] = {
          ...updatedIngredients[index],
          raw_material_id: value,
          item_name: selectedMaterial.name,
          unit: selectedMaterial.unit,
          // Set previous purchase price automatically
          unit_price: previousPurchasePrices[selectedMaterial.id] || selectedMaterial.unit_price || 0,
          // Reset quantity and cost to avoid old values
          quantity: updatedIngredients[index].quantity || '',
          cost: '0.00'
        };
        
        // Calculate cost if quantity exists
        if (updatedIngredients[index].quantity) {
          const quantity = parseFloat(updatedIngredients[index].quantity) || 0;
          const unitPrice = parseFloat(updatedIngredients[index].unit_price) || 0;
          updatedIngredients[index].cost = (quantity * unitPrice).toFixed(2);
        }
      }
    } else if (field === 'quantity') {
      updatedIngredients[index][field] = value;
      // Calculate cost when quantity changes
      const quantity = parseFloat(value) || 0;
      const unitPrice = parseFloat(updatedIngredients[index].unit_price) || 0;
      updatedIngredients[index].cost = (quantity * unitPrice).toFixed(2);
    } else if (field === 'unit_price') {
      updatedIngredients[index][field] = value;
      // Calculate cost when unit price changes
      const quantity = parseFloat(updatedIngredients[index].quantity) || 0;
      const unitPrice = parseFloat(value) || 0;
      updatedIngredients[index].cost = (quantity * unitPrice).toFixed(2);
    } else {
      updatedIngredients[index][field] = value;
    }
    
    setIngredients(updatedIngredients);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, {
      raw_material_id: '',
      item_name: '',
      unit: '',
      quantity: '',
      unit_price: '',
      cost: '0.00'
    }]);
  };

  const removeIngredient = (index) => {
    const updatedIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(updatedIngredients);
  };

  // Calculate total raw materials quantity
  const calculateTotalQuantity = () => {
    return ingredients.reduce((total, ingredient) => {
      return total + (parseFloat(ingredient.quantity) || 0);
    }, 0).toFixed(3);
  };

  // Calculate total cost
  const calculateTotalCost = () => {
    return ingredients.reduce((total, ingredient) => {
      return total + (parseFloat(ingredient.cost) || 0);
    }, 0).toFixed(2);
  };

  // Calculate per unit cost
  const calculatePerUnitCost = () => {
    const totalCost = parseFloat(calculateTotalCost());
    const unitPrice = parseFloat(formData.unit_price) || 1;
    return (totalCost / unitPrice).toFixed(2);
  };

  const validateForm = () => {
    if (!formData.item_code.trim()) {
      showPopup('error', 'Item code is required');
      return false;
    }
    
    if (!formData.name.trim()) {
      showPopup('error', 'Product name is required');
      return false;
    }
    
    // Check for duplicate raw materials in ingredients
    const rawMaterialIds = ingredients
      .filter(ing => ing.raw_material_id)
      .map(ing => ing.raw_material_id);
    
    const uniqueIds = new Set(rawMaterialIds);
    if (rawMaterialIds.length !== uniqueIds.size) {
      showPopup('error', 'Duplicate raw materials are not allowed');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      // Update the finished goods item
      const itemPayload = {
        item_code: formData.item_code.trim(),
        name: formData.name.trim(),
        category: formData.category,
        unit_price: formData.unit_price || 0
      };

      const itemResponse = await api.put(`/finished-goods-items/${id}`, itemPayload);

      if (itemResponse.status === 200) {
        // Update the ingredients
        const validIngredients = ingredients.filter(ing => 
          ing.raw_material_id && ing.quantity && parseFloat(ing.quantity) > 0
        );

        const ingredientsPayload = {
          finished_good_id: parseInt(id),
          ingredients: validIngredients.map(ing => ({
            raw_material_id: parseInt(ing.raw_material_id),
            quantity: parseFloat(ing.quantity)
          }))
        };

        await api.put('/finished-goods-ingredients', ingredientsPayload);

        showPopup('success', 'Product updated successfully!');
        setTimeout(() => navigate('/finished-goods/items'), 1500);
      } else {
        showPopup('error', itemResponse.data.error || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      if (error.response && error.response.data && error.response.data.error) {
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="finished-goods-management-container">
        <div className="loading-state">Loading product details...</div>
      </div>
    );
  }

  return (
    <div className="finished-goods-management-container">
      {/* Header */}
      <div className="header-section">
        <button onClick={() => navigate(-1)} className="back-button">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Products
        </button>
        
        <div className="header-actions">
          <div>
            <h1 className="page-title">Edit Product</h1>
            <p className="page-subtitle">
              Update product information and ingredients
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        {/* Basic Information */}
        <section style={{ marginBottom: '2rem' }}>
          <h3 className="section-title">Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Item Code</label>
              <input 
                type="text" 
                value={formData.item_code}
                readOnly
                className="form-input"
                style={{ backgroundColor: 'var(--background-light)', color: 'var(--text-muted)' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Item code is auto-generated and cannot be changed
              </small>
            </div>

            <div className="form-group">
              <label>Product Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Chocolate Cake"
                maxLength="255"
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="form-input"
              >
                <option value="Cake">Cake</option>
                <option value="Bakery">Bakery</option>
                <option value="Pastry">Pastry</option>
                <option value="Chinese">Chinese</option>
                <option value="Savory">Savory</option>
                <option value="Beverage">Beverage</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Selling Price (Rs.) *</label>
              <input
                type="number"
                name="unit_price"
                value={formData.unit_price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                className="form-input"
              />
            </div>
          </div>
        </section>

        {/* Ingredients Section */}
        <section className="ingredients-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">Ingredients</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Manage raw materials required for this product
              </p>
            </div>
            <button 
              type="button" 
              onClick={addIngredient} 
              className="btn btn-secondary"
              disabled={isLoadingRawMaterials}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Ingredient
            </button>
          </div>

          {isLoadingRawMaterials ? (
            <div className="loading-state">
              Loading raw materials...
            </div>
          ) : ingredients.length === 0 ? (
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
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ingredient, index) => (
                    <tr key={index}>
                      <td>
                        <select
                          value={ingredient.raw_material_id}
                          onChange={(e) => handleIngredientChange(index, 'raw_material_id', e.target.value)}
                          required
                          className="form-input"
                          style={{ margin: 0 }}
                        >
                          <option value="">Select material...</option>
                          {rawMaterials.map(material => (
                            <option key={material.id} value={material.id}>
                              {material.name} ({material.item_code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={ingredient.unit}
                          readOnly
                          className="form-input unit-input"
                          style={{ margin: 0 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={ingredient.quantity}
                          onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                          required
                          placeholder="0.000"
                          step="0.001"
                          min="0.001"
                          className="form-input"
                          style={{ margin: 0 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={ingredient.unit_price}
                          onChange={(e) => handleIngredientChange(index, 'unit_price', e.target.value)}
                          required
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="form-input"
                          style={{ margin: 0 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={ingredient.cost || '0.00'}
                          readOnly
                          className="form-input unit-input"
                          style={{ margin: 0 }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="btn-icon error"
                          title="Remove ingredient"
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
        </section>

        {/* Cost Calculation Section */}
        <section className="cost-section">
          <h3 className="section-title">
            <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '0.5rem' }} />
            Cost Calculation
          </h3>
          
          <div className="cost-grid">
            <div className="cost-item">
              <span className="cost-label">Total Raw Materials:</span>
              <span className="cost-value">{calculateTotalQuantity()}</span>
            </div>
            
            <div className="cost-item">
              <span className="cost-label">Total Cost:</span>
              <span className="cost-value">Rs. {calculateTotalCost()}</span>
            </div>
            
            <div className="cost-item">
              <span className="cost-label">Selling Price:</span>
              <span className="cost-value">Rs. {formData.unit_price || '0.00'}</span>
            </div>
            
            <div className="cost-item highlight">
              <span className="cost-label">Per Unit Cost:</span>
              <span className="cost-value">Rs. {calculatePerUnitCost()}</span>
            </div>
          </div>
        </section>

        {/* Form Actions */}
        <div className="form-actions">
          <button 
            type="button"
            onClick={() => navigate(-1)} 
            className="btn btn-ghost"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isLoading || isLoadingRawMaterials}
          >
            <FontAwesomeIcon icon={faSave} />
            {isLoading ? 'Updating...' : 'Update Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditFinishedGoodsItem;