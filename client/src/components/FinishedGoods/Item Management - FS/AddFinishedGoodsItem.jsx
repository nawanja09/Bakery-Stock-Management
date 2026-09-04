import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faPlus, faTrash, faArrowLeft, faUtensils, faCalculator, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsManagement.css';

const AddFinishedGoodsItem = () => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Cake',
    unit_price: '',
    output_quantity: ''
  });
  const [ingredients, setIngredients] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [rawMaterialOptions, setRawMaterialOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRawMaterials, setIsLoadingRawMaterials] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  useEffect(() => {
    fetchRawMaterials();
  }, []);

  useEffect(() => {
    if (rawMaterials.length > 0) {
      const options = rawMaterials.map(material => ({
        value: material.id,
        label: `${material.name} (${material.item_code}) - Rs. ${parseFloat(material.latest_unit_price || 0).toFixed(2)}`,
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
      } else {
        showPopup('error', 'Failed to load raw materials');
      }
    } catch (error) {
      console.error('Error fetching raw materials:', error);
      showPopup('error', 'Failed to load raw materials');
    } finally {
      setIsLoadingRawMaterials(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: value 
    }));
  };

  const handleOutputChange = (e) => {
    const value = e.target.value === '' ? '' : parseInt(e.target.value);
    setFormData(prev => ({
      ...prev,
      output_quantity: value
    }));
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...ingredients];

    // WHEN RAW MATERIAL SELECTED
    if (field === 'raw_material_id') {
      const selectedMaterial = rawMaterials.find(
        rm => rm.id === parseInt(value)
      );

      if (selectedMaterial) {
        const latestPrice = parseFloat(selectedMaterial.latest_unit_price) || 0;

        updatedIngredients[index] = {
          ...updatedIngredients[index],
          raw_material_id: value,
          item_name: selectedMaterial.name,
          unit: selectedMaterial.unit,
          unit_price: latestPrice,
          quantity: updatedIngredients[index].quantity || '',
        };

        if (updatedIngredients[index].quantity) {
          const q = parseFloat(updatedIngredients[index].quantity) || 0;
          updatedIngredients[index].cost = (q * latestPrice).toFixed(2);
        }
      } else {
        updatedIngredients[index] = {
          raw_material_id: '',
          item_name: '',
          unit: '',
          quantity: '',
          unit_price: '',
          cost: '0.00'
        };
      }
    }

    // WHEN QUANTITY ENTERED
    else if (field === 'quantity') {
      updatedIngredients[index].quantity = value;

      const qty = parseFloat(value) || 0;
      const price = parseFloat(updatedIngredients[index].unit_price) || 0;

      updatedIngredients[index].cost = (qty * price).toFixed(2);

      // AUTO CREATE NEW INGREDIENT ROW
      const isLastRow = index === updatedIngredients.length - 1;
      if (isLastRow && qty > 0) {
        updatedIngredients.push({
          raw_material_id: '',
          item_name: '',
          unit: '',
          quantity: '',
          unit_price: '',
          cost: '0.00'
        });
      }
    }

    // WHEN UNIT PRICE CHANGED
    else if (field === 'unit_price') {
      updatedIngredients[index].unit_price = value;

      const qty = parseFloat(updatedIngredients[index].quantity) || 0;
      const price = parseFloat(value) || 0;

      updatedIngredients[index].cost = (qty * price).toFixed(2);
    }

    // ANY OTHER FIELD
    else {
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
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const calculateTotalCost = () => {
    return ingredients.reduce((total, ingredient) => {
      return total + (parseFloat(ingredient.cost) || 0);
    }, 0).toFixed(2);
  };

  const calculateUtilityCost = () => {
    const totalCost = parseFloat(calculateTotalCost()) || 0;
    return (totalCost * 0.7).toFixed(2);
  };

  const calculatePerUnitCost = () => {
    const totalCost = parseFloat(calculateTotalCost()) || 0;
    const utilityCost = parseFloat(calculateUtilityCost()) || 0;
    const output = parseInt(formData.output_quantity) || 1;
    
    if (output <= 0) return '0.00';
    
    return ((totalCost + utilityCost) / output).toFixed(2);
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      showPopup('error', 'Product name is required');
      return false;
    }
    
    if (!formData.unit_price || parseFloat(formData.unit_price) <= 0) {
      showPopup('error', 'Valid selling price is required');
      return false;
    }
    
    if (!formData.output_quantity || formData.output_quantity <= 0) {
      showPopup('error', 'Valid output quantity is required');
      return false;
    }
    
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

    const now = Date.now();
    const timeSinceLast = now - lastSubmitTime;

    if (timeSinceLast < 2000) {
      showPopup('warning', '⚠️ Duplicate submission detected! Please wait a moment.');
      return;
    }

    if (isSubmitting) {
      showPopup('warning', 'Submission already in progress...');
      return;
    }

    setIsSubmitting(true);
    setLastSubmitTime(now);

    if (!validateForm()) {
      setIsSubmitting(false);
      return;
    }

    setIsLoading(true);
    try {
      const { name, category, unit_price, output_quantity } = formData;
      
      const itemRes = await api.post('/finished-goods-items', {
        name: name.trim(),
        category,
        unit_price: unit_price || 0,
        output_quantity: output_quantity
      });

      if (itemRes.status === 201) {
        const finished_good_id = itemRes.data.id;

        const validIngredients = ingredients.filter(i =>
          i.raw_material_id && i.quantity && parseFloat(i.quantity) > 0
        );

        if (validIngredients.length > 0) {
          await api.post('/finished-goods-ingredients', {
            finished_good_id,
            ingredients: validIngredients.map(i => ({
              raw_material_id: parseInt(i.raw_material_id),
              quantity: parseFloat(i.quantity)
            }))
          });
        }

        await api.post('/cost-calculations', {
          finished_good_id,
          finished_good_name: name.trim(),
          output_quantity: output_quantity,
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

        showPopup('success', `Product "${name}" created successfully with code: ${itemRes.data.item_code}`);
        setTimeout(() => navigate('/finished-goods/items'), 1500);
      }
    } catch (error) {
      console.error('Error adding item:', error);
      if (error.response?.data?.error) {
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
    }
  };

  const customStyles = {
    control: (base, state) => ({
      ...base,
      width: '350px',      // ← Add this line for wider search bar
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
      width: '350px',      // ← Add this line for wider dropdown menu
      fontSize: '0.875rem',
      zIndex: 9999
    }),

    menuPortal: (base) => ({
      ...base,
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
    })
  };

  return (
    <div className="finished-goods-management-container">
      <div className="header-section">
        <button onClick={() => navigate(-1)} className="back-button">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Products
        </button>
        
        <div className="header-actions">
          <div>
            <h1 className="page-title">Add New Product</h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        <section style={{ marginBottom: '2rem' }}>
          <h3 className="section-title">Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Item Code</label>
              <input 
                type="text" 
                value="Auto-generated (FG0001, FG0002, ...)"
                readOnly
                className="form-input"
                style={{ 
                  backgroundColor: 'var(--background-light)', 
                  color: 'var(--text-muted)',
                  fontStyle: 'italic'
                }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Item code will be automatically generated starting from FG0001
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

        <section className="ingredients-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">Ingredients</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Add raw materials required for this product. Unit prices are auto-filled with latest purchase prices.
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
                    <th style={{ width: '150px' }}>
                      Unit Price (Rs.)
                      <FontAwesomeIcon 
                        icon={faInfoCircle} 
                        title="Auto-filled with latest purchase price" 
                        style={{ marginLeft: '5px', color: '#6b7280', fontSize: '0.75rem' }}
                      />
                    </th>
                    <th style={{ width: '120px' }}>Cost (Rs.)</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ingredient, index) => {
                    const selectedMaterial = rawMaterials.find(rm => rm.id === parseInt(ingredient.raw_material_id));
                    const hasPurchasePrice = parseFloat(selectedMaterial?.latest_unit_price || 0) > 0;
                    
                    return (
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
                            menuPortalTarget={document.body}
                            menuPosition="fixed"
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
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              value={ingredient.unit_price}
                              onChange={(e) => handleIngredientChange(index, 'unit_price', e.target.value)}
                              required
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className="form-input"
                              style={{ 
                                margin: 0,
                                borderColor: hasPurchasePrice ? '#10b981' : '#e5e7eb'
                              }}
                            />
                            {hasPurchasePrice && (
                              <div style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '8px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                fontSize: '0.6rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 'bold'
                              }}>
                                Latest
                              </div>
                            )}
                          </div>
                          {selectedMaterial && (
                            <small style={{ 
                              color: hasPurchasePrice ? '#059669' : '#6b7280', 
                              fontSize: '0.7rem',
                              display: 'block',
                              marginTop: '2px'
                            }}>
                              {hasPurchasePrice 
                                ? `Latest purchase: Rs. ${parseFloat(selectedMaterial.latest_unit_price).toFixed(2)}`
                                : 'No purchase history found'
                              }
                            </small>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={ingredient.cost || '0.00'}
                            readOnly
                            className="form-input unit-input"
                            style={{ margin: 0, fontWeight: '600' }}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cost-section">
          <h3 className="section-title">
            <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '0.5rem' }} />
            Cost Calculation
          </h3>
          
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Total Output (Quantity) *</label>
            <input
              type="number"
              name="output_quantity"
              value={formData.output_quantity}
              onChange={handleOutputChange}
              required
              min="1"
              step="1"
              placeholder="Enter output quantity"
              className="form-input"
              style={{ maxWidth: '200px' }}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {formData.output_quantity ? 
                `Output is ${formData.output_quantity}: Per Unit Cost = Total Production Cost ÷ ${formData.output_quantity}` :
                'Enter the total quantity produced from these ingredients'
              }
            </small>
          </div>
          
          <div className="cost-grid">    
            <div className="cost-item">
              <span className="cost-label">Total Raw Material Cost:</span>
              <span className="cost-value">Rs. {calculateTotalCost()}</span>
            </div>
            
            <div className="cost-item">
              <span className="cost-label">Utility Cost (70%):</span>
              <span className="cost-value">Rs. {calculateUtilityCost()}</span>
            </div>

            <div className="cost-item highlight">
              <span className="cost-label">Total Production Cost:</span>
              <span className="cost-value">Rs. {(parseFloat(calculateTotalCost()) + parseFloat(calculateUtilityCost())).toFixed(2)}</span>
            </div>
            
            <div className="cost-item highlight">
              <span className="cost-label">
                {formData.output_quantity === 1 ? 'Cost per Product:' : 'Per Unit Cost:'}
              </span>
              <span className="cost-value">Rs. {calculatePerUnitCost()}</span>
            </div>
          </div>

          <div className="formula-display" style={{ 
            marginTop: '1rem', 
            padding: '1rem',
            backgroundColor: 'var(--background-light)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)'
          }}>
            <strong>Formula:</strong> {formData.output_quantity ? 
              `Per Unit Cost = (Total Raw Material Cost + Utility Cost) ÷ ${formData.output_quantity}` :
              'Per Unit Cost = (Total Raw Material Cost + Utility Cost) ÷ Output'
            }
            <br />
            <span style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
              Utility Cost = Total Raw Material Cost × 0.7
            </span>
            {formData.output_quantity && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--info-light)', borderRadius: '4px' }}>
                <strong>Calculation:</strong> ({calculateTotalCost()} + {calculateUtilityCost()}) ÷ {formData.output_quantity} = {calculatePerUnitCost()}
              </div>
            )}
          </div>
        </section>

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
            disabled={isLoading || isSubmitting || isLoadingRawMaterials || !formData.output_quantity}
          >
            <FontAwesomeIcon icon={faSave} />
            {isSubmitting ? 'Creating...' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddFinishedGoodsItem;