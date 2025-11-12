import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Select from 'react-select';
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
  const [rawMaterialOptions, setRawMaterialOptions] = useState([]);
  const [previousPurchasePrices, setPreviousPurchasePrices] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [isLoadingRawMaterials, setIsLoadingRawMaterials] = useState(false);
  const [outputQuantity, setOutputQuantity] = useState(25); // Changed default to 25
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [rmData, ppData] = await Promise.all([fetchRawMaterials(), fetchPreviousPurchasePrices()]);
        await fetchItem(rmData, ppData);
      } catch (err) {
        console.error('Error preloading data:', err);
        await fetchItem();
      }
    };

    loadAll();
  }, [id]);

  useEffect(() => {
    // Convert raw materials to react-select options
    if (rawMaterials.length > 0) {
      const options = rawMaterials.map(material => ({
        value: material.id,
        label: `${material.name} (${material.item_code})`,
        data: material
      }));
      setRawMaterialOptions(options);
    }
  }, [rawMaterials]);

  const fetchRawMaterials = async () => {
    setIsLoadingRawMaterials(true);
    try {
      const response = await api.get('/finished-goods-ingredients/raw-materials');
      if (response.status === 200) {
        setRawMaterials(response.data);
        return response.data;
      } else {
        showPopup('error', 'Failed to fetch raw materials');
        return [];
      }
    } catch (error) {
      console.error('Error fetching raw materials:', error);
      showPopup('error', 'Network error. Please try again.');
      return [];
    } finally {
      setIsLoadingRawMaterials(false);
    }
  };

  const fetchPreviousPurchasePrices = async () => {
    try {
      const response = await api.get('/purchases/previous-prices');
      setPreviousPurchasePrices(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching previous purchase prices:', error);
      return {};
    }
  };

  const fetchItem = async (rawMaterialsData = null, previousPricesData = null) => {
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
          const rmData = rawMaterialsData || rawMaterials;
          const ppData = previousPricesData || previousPurchasePrices;

          const formattedIngredients = ingredientsData.map(ing => {
            const selectedMaterial = rmData.find(rm => Number(rm.id) === Number(ing.raw_material_id));
            const unitPrice = (ppData && (ppData[ing.raw_material_id] ?? ppData[String(ing.raw_material_id)])) || ing.unit_price || (selectedMaterial ? selectedMaterial.unit_price : 0) || 0;
            const cost = (parseFloat(ing.quantity) * parseFloat(unitPrice) || 0).toFixed(2);

            return {
              id: ing.id,
              raw_material_id: ing.raw_material_id?.toString() || '',
              item_name: ing.item_name || (selectedMaterial ? selectedMaterial.name : ''),
              unit: ing.unit || (selectedMaterial ? selectedMaterial.unit : ''),
              quantity: ing.quantity?.toString() || '',
              unit_price: unitPrice,
              cost: cost
            };
          });
          setIngredients(formattedIngredients);
        }

        // Fetch saved output quantity from cost calculations
        try {
          const costResponse = await api.get(`/cost-calculations/finished-good/${id}`);
          if (costResponse.status === 200 && costResponse.data.length > 0) {
            const latestCalculation = costResponse.data[0];
            setOutputQuantity(latestCalculation.output_quantity || 25);
          }
        } catch (error) {
          console.log('No cost calculations found, using default output quantity');
          setOutputQuantity(25);
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

  const handleOutputChange = (e) => {
    const value = parseInt(e.target.value) || 25;
    setOutputQuantity(Math.max(1, value));
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...ingredients];
    
    if (field === 'raw_material_id') {
      const selectedMaterial = rawMaterials.find(rm => rm.id === parseInt(value));
      if (selectedMaterial) {
        updatedIngredients[index] = {
          ...updatedIngredients[index],
          raw_material_id: value,
          item_name: selectedMaterial.name,
          unit: selectedMaterial.unit,
          unit_price: previousPurchasePrices[selectedMaterial.id] || selectedMaterial.unit_price || 0,
          quantity: updatedIngredients[index].quantity || '',
          cost: '0.00'
        };
        
        // Calculate cost if quantity exists
        if (updatedIngredients[index].quantity) {
          const quantity = parseFloat(updatedIngredients[index].quantity) || 0;
          const unitPrice = parseFloat(updatedIngredients[index].unit_price) || 0;
          updatedIngredients[index].cost = (quantity * unitPrice).toFixed(2);
        }
      } else {
        // Clear fields if no material selected
        updatedIngredients[index] = {
          ...updatedIngredients[index],
          raw_material_id: '',
          item_name: '',
          unit: '',
          unit_price: '',
          cost: '0.00'
        };
      }
    } else if (field === 'quantity') {
      updatedIngredients[index][field] = value;
      const quantity = parseFloat(value) || 0;
      const unitPrice = parseFloat(updatedIngredients[index].unit_price) || 0;
      updatedIngredients[index].cost = (quantity * unitPrice).toFixed(2);
    } else if (field === 'unit_price') {
      updatedIngredients[index][field] = value;
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

  // Calculate utility cost (70% of total cost)
  const calculateUtilityCost = () => {
    const totalCost = parseFloat(calculateTotalCost()) || 0;
    return (totalCost * 0.7).toFixed(2);
  };

  // Calculate per unit cost
  const calculatePerUnitCost = () => {
    const totalCost = parseFloat(calculateTotalCost()) || 0;
    const utilityCost = parseFloat(calculateUtilityCost()) || 0;
    const output = parseInt(outputQuantity) || 25;
    
    if (output <= 0) return '0.00';
    
    return ((totalCost + utilityCost) / output).toFixed(2);
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

    if (!outputQuantity || outputQuantity <= 0) {
      showPopup('error', 'Valid output quantity is required');
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

    // 🛑 Prevent duplicate submits
    if (isSubmitting) {
      showPopup('warning', 'Please wait, your request is already being processed...');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
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

        // Update cost calculation
        await api.post('/cost-calculations', {
          finished_good_id: parseInt(id),
          finished_good_name: formData.name.trim(),
          output_quantity: outputQuantity,
          total_cost: calculateTotalCost(),
          per_unit_cost: calculatePerUnitCost(),
          ingredients: ingredients.map(ing => ({
            item_id: parseInt(ing.raw_material_id),
            item_name: ing.item_name,
            quantity: parseFloat(ing.quantity),
            unit: ing.unit,
            unit_price: parseFloat(ing.unit_price),
            cost: parseFloat(ing.cost)
          }))
        });

        showPopup('success', 'Product updated successfully!');
        setTimeout(() => navigate('/finished-goods/items'), 1500);
      } else {
        showPopup('error', itemResponse.data.error || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      if (error.response?.data?.error) {
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setIsSubmitting(false); // ✅ Allow submitting again only after completion
    }
  };

  // Custom styles for react-select
  const customStyles = {
    control: (base, state) => ({
      ...base,
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '0.875rem',
      minHeight: '42px',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
      borderColor: state.isFocused ? '#3b82f6' : '#e2e8f0',
      '&:hover': {
        borderColor: state.isFocused ? '#3b82f6' : '#cbd5e1'
      }
    }),
    menu: (base) => ({
      ...base,
      fontSize: '0.875rem',
      zIndex: 9999
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#f1f5f9' : '#ffffff',
      color: state.isSelected ? '#ffffff' : '#1e293b',
      '&:active': {
        backgroundColor: '#3b82f6',
        color: '#ffffff'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: '#1e293b'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#94a3b8'
    })
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
            <h1 className="page-title">Edit Item Product</h1>
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
                        <Select
                          options={rawMaterialOptions}
                          value={rawMaterialOptions.find(option => 
                            option.value.toString() === ingredient.raw_material_id.toString()
                          )}
                          onChange={(selectedOption) => 
                            handleIngredientChange(
                              index, 
                              'raw_material_id', 
                              selectedOption ? selectedOption.value : ''
                            )
                          }
                          isSearchable={true}
                          placeholder="Search raw material..."
                          noOptionsMessage={() => "No materials found"}
                          styles={customStyles}
                          required
                        />
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
          
          {/* Output Input Field */}
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Total Output (Quantity) *</label>
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
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Enter the total quantity produced from these ingredients
            </small>
          </div>
          
          <div className="cost-grid">
            <div className="cost-item">
              <span className="cost-label">Total Cost:</span>
              <span className="cost-value">Rs. {calculateTotalCost()}</span>
            </div>
            
            <div className="cost-item">
              <span className="cost-label">Utility Cost (70%):</span>
              <span className="cost-value">Rs. {calculateUtilityCost()}</span>
            </div>
            
            <div className="cost-item highlight">
              <span className="cost-label">Per Unit Cost:</span>
              <span className="cost-value">Rs. {calculatePerUnitCost()}</span>
            </div>
          </div>

          {/* Formula Display */}
          <div className="formula-display" style={{ 
            marginTop: '1rem', 
            padding: '1rem',
            backgroundColor: 'var(--background-light)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)'
          }}>
            <strong>Formula:</strong> Per Unit Cost = (Total Cost + Utility Cost) / Output
            <br />
            <span style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
              Utility Cost = Total Cost × 0.7
            </span>
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
            disabled={isLoading || isLoadingRawMaterials || isSubmitting}
          >
            <FontAwesomeIcon icon={faSave} />
            {isSubmitting ? 'Updating...' : 'Update Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditFinishedGoodsItem;