import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCalculator, faSave} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './CostCalculator.css';

const CalculateCost = () => {
  const navigate = useNavigate();
  const [finishedGoodsItems, setFinishedGoodsItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [selectedFinishedGood, setSelectedFinishedGood] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [outputQuantity, setOutputQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const { showPopup } = usePopup();

  // Fetch finished goods items and raw materials
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [finishedGoodsResponse, rawMaterialsResponse] = await Promise.all([
          api.get('/finished-goods-items'),
          api.get('/items')
        ]);
        
        setFinishedGoodsItems(finishedGoodsResponse.data);
        setRawMaterials(rawMaterialsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        showPopup('error', 'Failed to load items');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [showPopup]);

  // Fetch previous purchase prices for raw materials
  const fetchPreviousPrices = async () => {
    try {
      const response = await api.get('/purchases/previous-prices');
      return response.data;
    } catch (error) {
      console.error('Error fetching previous prices:', error);
      return {};
    }
  };

  const finishedGoodsOptions = finishedGoodsItems.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - ${item.category}`,
    unit_price: item.unit_price
  }));

  const rawMaterialOptions = rawMaterials.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code})`,
    unit: item.unit
  }));

  const handleFinishedGoodChange = (selectedOption) => {
    setSelectedFinishedGood(selectedOption);
    // Clear ingredients when changing finished good
    setIngredients([]);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { 
      item_id: '', 
      item_name: '', 
      quantity: '', 
      unit: '', 
      unit_price: '',
      cost: 0
    }]);
  };

  const removeIngredient = (index) => {
    if (ingredients.length > 1) {
      const newIngredients = [...ingredients];
      newIngredients.splice(index, 1);
      setIngredients(newIngredients);
    }
  };

  const handleIngredientChange = async (index, field, value) => {
    const newIngredients = [...ingredients];
    
    if (field === 'item_id') {
      const selectedMaterial = rawMaterials.find(item => item.id === value);
      if (selectedMaterial) {
        newIngredients[index].item_id = value;
        newIngredients[index].item_name = selectedMaterial.name;
        newIngredients[index].unit = selectedMaterial.unit;
        
        // Fetch and set previous purchase price
        const previousPrices = await fetchPreviousPrices();
        const previousPrice = previousPrices[value] || 0;
        newIngredients[index].unit_price = previousPrice;
        
        // Calculate cost if quantity exists
        if (newIngredients[index].quantity) {
          newIngredients[index].cost = newIngredients[index].quantity * previousPrice;
        }
      }
    } else if (field === 'quantity') {
      newIngredients[index].quantity = parseFloat(value) || 0;
      if (newIngredients[index].unit_price) {
        newIngredients[index].cost = newIngredients[index].quantity * newIngredients[index].unit_price;
      }
    } else if (field === 'unit_price') {
      newIngredients[index].unit_price = parseFloat(value) || 0;
      if (newIngredients[index].quantity) {
        newIngredients[index].cost = newIngredients[index].quantity * newIngredients[index].unit_price;
      }
    }

    setIngredients(newIngredients);
  };

  const calculateTotalQuantity = () => {
    return ingredients.reduce((total, ingredient) => {
      return total + (parseFloat(ingredient.quantity) || 0);
    }, 0);
  };

  const calculateTotalCost = () => {
    return ingredients.reduce((total, ingredient) => {
      return total + (parseFloat(ingredient.cost) || 0);
    }, 0);
  };

  const calculatePerUnitCost = () => {
    const totalCost = calculateTotalCost();
    const outputQty = parseFloat(outputQuantity) || 1;
    return outputQty > 0 ? totalCost / outputQty : 0;
  };

  const handleSaveCosting = async () => {
    if (!selectedFinishedGood) {
      showPopup('error', 'Please select a finished good item');
      return;
    }

    if (ingredients.length === 0) {
      showPopup('error', 'Please add at least one ingredient');
      return;
    }

    try {
      const payload = {
        finished_good_id: selectedFinishedGood.value,
        finished_good_name: selectedFinishedGood.label,
        output_quantity: outputQuantity,
        total_cost: calculateTotalCost(),
        per_unit_cost: calculatePerUnitCost(),
        ingredients: ingredients.map(ingredient => ({
          item_id: ingredient.item_id,
          item_name: ingredient.item_name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          unit_price: ingredient.unit_price,
          cost: ingredient.cost
        }))
      };
      const response = await api.post('/cost-calculations', payload);
      showPopup('success', 'Cost calculation saved successfully!');
      setTimeout(() => {
        navigate('/cost-calculator/saved');
      }, 1500);
    } catch (error) {
      console.error('Error saving cost calculation:', error);
      showPopup('error', 'Failed to save cost calculation');
    }
  };

  // Add a separate function to just view saved calculations without saving
  const handleViewSavedCalculations = () => {
    navigate('/cost-calculator/saved');
  };

  return (
    <div className="cost-calculator-container">
      <h1 className="page-title">
        <FontAwesomeIcon icon={faCalculator} /> Cost Calculator
      </h1>

      <div className="cost-calculator-form">
        {/* Finished Goods Selection */}
        <div className="form-section">
          <h3>Select Finished Good</h3>
          <div className="form-group">
            <label>Finished Good Item *</label>
            <Select
              options={finishedGoodsOptions}
              value={selectedFinishedGood}
              onChange={handleFinishedGoodChange}
              isSearchable
              placeholder="Select finished good item..."
              className="react-select-container"
              classNamePrefix="react-select"
            />
          </div>
        </div>

        {/* Ingredients Table */}
        <div className="form-section">
          <div className="section-header">
            <h3>Ingredients List</h3>
            <button type="button" className="btn-add" onClick={addIngredient}>
              <FontAwesomeIcon icon={faPlus} /> Add Ingredient
            </button>
          </div>

          <table className="ingredients-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Unit of Measurement</th>
                <th>Quantity</th>
                <th>Unit Price (Rs.)</th>
                <th>Cost (Rs.)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ingredient, index) => (
                <tr key={index}>
                  <td>
                    <Select
                      options={rawMaterialOptions}
                      value={rawMaterialOptions.find(opt => opt.value === ingredient.item_id) || null}
                      onChange={(selected) => 
                        handleIngredientChange(index, 'item_id', selected?.value)
                      }
                      isSearchable
                      placeholder="Select raw material..."
                      className="react-select-container"
                      classNamePrefix="react-select"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={ingredient.unit}
                      readOnly
                      className="form-input readonly"
                      placeholder="Auto-filled"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={ingredient.quantity}
                      onChange={(e) => 
                        handleIngredientChange(index, 'quantity', e.target.value)
                      }
                      placeholder="Enter quantity"
                      className="form-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ingredient.unit_price}
                      onChange={(e) => 
                        handleIngredientChange(index, 'unit_price', e.target.value)
                      }
                      placeholder="Unit price"
                      className="form-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={ingredient.cost.toFixed(2)}
                      readOnly
                      className="form-input readonly"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeIngredient(index)}
                      disabled={ingredients.length === 1}
                      title="Remove Ingredient"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cost Summary */}
        <div className="cost-summary">
          <div className="summary-row">
            <div className="summary-item">
              <label>Total Raw Materials Quantity:</label>
              <span>{calculateTotalQuantity().toFixed(3)}</span>
            </div>
            
            <div className="summary-item">
              <label>Total Cost:</label>
              <span>Rs. {calculateTotalCost().toFixed(2)}</span>
            </div>
          </div>

          <div className="form-group">
            <label>Output Quantity *</label>
            <input
              type="number"
              min="1"
              value={outputQuantity}
              onChange={(e) => setOutputQuantity(e.target.value)}
              placeholder="Enter output quantity"
              className="form-input"
            />
          </div>

          <div className="summary-item highlight">
            <label>Per Unit Cost:</label>
            <span>Rs. {calculatePerUnitCost().toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="button-container">
          <button type="submit" className="save-btn">Save Cost Calculation</button>
        </div>
      </div>
    </div>
  );
};

export default CalculateCost;