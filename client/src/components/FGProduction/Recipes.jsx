// src/components/FGProduction/Recipes.jsx
//
// FG - Finished Goods Production (NEW, INDEPENDENT MODULE)
// -----------------------------------------------------------------------
// This page is completely separate from the existing Finished Goods
// "Item Management - FS" pages. FG Item Name / Department entered here
// belong only to this new module's own fg_production table - they are
// never auto-populated from the existing Finished Goods records.
// -----------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faEdit, faTrash, faFlask, faSave, faTimes, faBoxOpen
} from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './FGProduction.css';

const ALLOWED_FG_DEPARTMENTS = ['Bakery', 'Cake', 'Pastry', 'Restaurant', 'Savoury', 'Savory'];

const emptyRecipeForm = { rm_item_id: '', quantity: '', last_price: '' };

const Recipes = () => {
  const { showPopup } = usePopup();

  // Master / reference data
  const [departments, setDepartments] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [previousPrices, setPreviousPrices] = useState({});

  // FG Production items (this module's own records)
  const [fgList, setFgList] = useState([]);
  const [fgLoading, setFgLoading] = useState(true);
  const [selectedFgId, setSelectedFgId] = useState('');
  const [fgSearch, setFgSearch] = useState('');

  // New / edit FG details form
  const [showFgForm, setShowFgForm] = useState(false);
  const [fgFormMode, setFgFormMode] = useState('create'); // 'create' | 'edit'
  const [fgFormName, setFgFormName] = useState('');
  const [fgFormDepartment, setFgFormDepartment] = useState(null);
  const [fgFormOutputQuantity, setFgFormOutputQuantity] = useState('');
  const [savingFg, setSavingFg] = useState(false);

  // Recipes belonging to the selected FG Production item
  const [recipes, setRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // Recipe add/edit modal
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeModalMode, setRecipeModalMode] = useState('add'); // 'add' | 'edit'
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm);
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const selectedFg = fgList.find(f => String(f.id) === String(selectedFgId)) || null;

  // ---------------------------------------------------------------------
  // Initial data load
  // ---------------------------------------------------------------------
  const fetchFgList = useCallback(async () => {
    try {
      setFgLoading(true);
      const res = await api.get('/fg-production');
      setFgList(res.data || []);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load FG Production items');
    } finally {
      setFgLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchFgList();
    (async () => {
      try {
        const [deptRes, itemsRes] = await Promise.all([
          api.get('/departments'),
          api.get('/items')
        ]);
        setDepartments((deptRes.data || []).filter(d => ALLOWED_FG_DEPARTMENTS.includes(d.name)));
        setRawMaterials(itemsRes.data || []);
      } catch (err) {
        console.error(err);
        showPopup('error', 'Failed to load departments / raw materials');
      }
      try {
        const priceRes = await api.get('/purchases/previous-prices');
        setPreviousPrices(priceRes.data || {});
      } catch (err) {
        // Non-critical - last price can still be entered manually
        console.warn('Could not preload previous prices', err);
      }
    })();
  }, [fetchFgList, showPopup]);

  const fetchRecipes = useCallback(async (fgId) => {
    if (!fgId) {
      setRecipes([]);
      return;
    }
    try {
      setRecipesLoading(true);
      const res = await api.get(`/fg-production/${fgId}/recipes`);
      setRecipes(res.data || []);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load recipe items');
    } finally {
      setRecipesLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchRecipes(selectedFgId);
  }, [selectedFgId, fetchRecipes]);

  // ---------------------------------------------------------------------
  // FG Details (create / edit)
  // ---------------------------------------------------------------------
  const departmentOptions = departments.map(d => ({ value: d.id, label: d.name }));
  const fgOptions = fgList
    .filter(f => f.fg_item_name.toLowerCase().includes(fgSearch.toLowerCase()))
    .map(f => ({ value: f.id, label: `${f.fg_item_name}${f.department_name ? ' — ' + f.department_name : ''}` }));

  const openCreateFgForm = () => {
    setFgFormMode('create');
    setFgFormName('');
    setFgFormDepartment(null);
    setFgFormOutputQuantity('');
    setShowFgForm(true);
  };

  const openEditFgForm = () => {
    if (!selectedFg) return;
    setFgFormMode('edit');
    setFgFormName(selectedFg.fg_item_name);
    setFgFormOutputQuantity(selectedFg.recipe_output_quantity || '');
    setFgFormDepartment(
      selectedFg.department_id
        ? { value: selectedFg.department_id, label: selectedFg.department_name }
        : null
    );
    setShowFgForm(true);
  };

  const closeFgForm = () => setShowFgForm(false);

  const submitFgForm = async () => {
    if (!fgFormName.trim()) {
      showPopup('error', 'FG Item Name is required');
      return;
    }
    if (!fgFormDepartment) {
      showPopup('error', 'Department is required');
      return;
    }
    const outputQty = parseFloat(fgFormOutputQuantity);
    if (!Number.isFinite(outputQty) || outputQty <= 0) {
      showPopup('error', 'Recipe Output Quantity must be greater than 0');
      return;
    }

    setSavingFg(true);
    try {
      if (fgFormMode === 'create') {
        const res = await api.post('/fg-production', {
          fg_item_name: fgFormName.trim(),
          department_id: fgFormDepartment.value,
          recipe_output_quantity: outputQty
        });
        showPopup('success', 'FG Production item created successfully');
        await fetchFgList();
        setSelectedFgId(res.data.id);
      } else {
        await api.put(`/fg-production/${selectedFg.id}`, {
          fg_item_name: fgFormName.trim(),
          department_id: fgFormDepartment.value,
          recipe_output_quantity: outputQty
        });
        showPopup('success', 'FG Production item updated successfully');
        await fetchFgList();
      }
      setShowFgForm(false);
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Failed to save FG Production item');
    } finally {
      setSavingFg(false);
    }
  };

  const handleDeleteFg = async () => {
    if (!selectedFg) return;
    if (!window.confirm(`Delete "${selectedFg.fg_item_name}" and all its recipe items?`)) return;
    try {
      await api.delete(`/fg-production/${selectedFg.id}`);
      showPopup('success', 'FG Production item deleted successfully');
      setSelectedFgId('');
      setRecipes([]);
      fetchFgList();
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to delete FG Production item');
    }
  };

  // ---------------------------------------------------------------------
  // Recipe CRUD
  // ---------------------------------------------------------------------
  const rawMaterialOptions = rawMaterials.map(rm => ({
    value: rm.id,
    label: `${rm.name} (${rm.item_code})`,
    unit: rm.unit
  }));

  const openAddRecipeModal = () => {
    setRecipeModalMode('add');
    setRecipeForm(emptyRecipeForm);
    setEditingRecipeId(null);
    setRecipeModalOpen(true);
  };

  const openEditRecipeModal = (recipe) => {
    setRecipeModalMode('edit');
    setRecipeForm({
      rm_item_id: recipe.rm_item_id,
      quantity: recipe.quantity,
      last_price: recipe.last_price
    });
    setEditingRecipeId(recipe.id);
    setRecipeModalOpen(true);
  };

  const closeRecipeModal = () => setRecipeModalOpen(false);

  const handleRecipeRmChange = (selected) => {
    const rmId = selected?.value || '';
    const suggestedPrice = previousPrices[rmId];
    setRecipeForm(prev => ({
      ...prev,
      rm_item_id: rmId,
      last_price: prev.last_price || (suggestedPrice != null ? suggestedPrice : prev.last_price)
    }));
  };

  const submitRecipeForm = async () => {
    const qty = parseFloat(recipeForm.quantity);
    const price = parseFloat(recipeForm.last_price);

    if (!recipeForm.rm_item_id) {
      showPopup('error', 'Please select a Raw Material item');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showPopup('error', 'Quantity must be greater than 0');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showPopup('error', 'Last Price must not be negative');
      return;
    }

    setSavingRecipe(true);
    try {
      if (recipeModalMode === 'add') {
        await api.post(`/fg-production/${selectedFg.id}/recipes`, {
          rm_item_id: recipeForm.rm_item_id,
          quantity: qty,
          last_price: price
        });
        showPopup('success', 'Recipe item added successfully');
      } else {
        await api.put(`/fg-production/recipes/${editingRecipeId}`, {
          rm_item_id: recipeForm.rm_item_id,
          quantity: qty,
          last_price: price
        });
        showPopup('success', 'Recipe item updated successfully');
      }
      setRecipeModalOpen(false);
      fetchRecipes(selectedFg.id);
      fetchFgList();
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Failed to save recipe item');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async (recipe) => {
    if (!window.confirm(`Remove "${recipe.rm_item_name}" from this recipe?`)) return;
    try {
      await api.delete(`/fg-production/recipes/${recipe.id}`);
      showPopup('success', 'Recipe item deleted successfully');
      fetchRecipes(selectedFg.id);
      fetchFgList();
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to delete recipe item');
    }
  };

  const totalRmCost = recipes.reduce(
    (sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.last_price) || 0),
    0
  );

  const recipeOutputQuantity = parseFloat(selectedFg?.recipe_output_quantity) || 0;
  const rmCostPerPiece = recipeOutputQuantity > 0 ? totalRmCost / recipeOutputQuantity : 0;

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="fgprod-container">
      <div className="fgprod-header">
        <div>
          <h1 className="fgprod-title">
            <FontAwesomeIcon icon={faFlask} /> Finished Goods Production — Recipes
          </h1>
        </div>
        <button className="fgprod-btn-primary" onClick={openCreateFgForm}>
          <FontAwesomeIcon icon={faPlus} /> New FG Item
        </button>
      </div>

      {/* FG Details / picker */}
      <div className="fgprod-card">
        <h3 className="fgprod-card-title">FG Production Details</h3>

        <div className="fgprod-picker-row">
          <div className="fgprod-select-wrap">
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem', color: 'var(--fgprod-text)' }}>
              FG Item Name
            </label>
            <Select
              className="fgprod-item-name-dropdown"
              classNamePrefix="react-select"
              options={fgOptions}
              value={fgOptions.find(o => String(o.value) === String(selectedFgId)) || null}
              onChange={(opt) => setSelectedFgId(opt ? opt.value : '')}
              onInputChange={(val) => setFgSearch(val)}
              isClearable
              isLoading={fgLoading}
              placeholder="Select an FG Production item..."
              noOptionsMessage={() => 'No FG Production items yet'}
            />
          </div>

          {selectedFg && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="fgprod-btn-secondary" onClick={openEditFgForm}>
                <FontAwesomeIcon icon={faEdit} /> Edit
              </button>
              <button className="fgprod-icon-btn danger" onClick={handleDeleteFg} title="Delete FG Item">
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          )}
        </div>

        {selectedFg && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="fgprod-dept-tag">{selectedFg.department_name || 'No Department'}</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--fgprod-text)' }}>
              Recipe Output: {parseFloat(selectedFg.recipe_output_quantity || 1).toFixed(0)} Pieces
            </span>
          </div>
        )}
      </div>

      {/* Recipes table */}
      {selectedFg && (
        <div className="fgprod-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 className="fgprod-card-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
              Recipe Items for "{selectedFg.fg_item_name}"
            </h3>
            <button className="fgprod-btn-primary" onClick={openAddRecipeModal}>
              <FontAwesomeIcon icon={faPlus} /> Add RM Recipe
            </button>
          </div>

          {recipesLoading ? (
            <div className="fgprod-loading">
              <div className="fgprod-spinner"></div>
              <span>Loading recipe items...</span>
            </div>
          ) : recipes.length === 0 ? (
            <div className="fgprod-empty">
              <FontAwesomeIcon icon={faBoxOpen} size="3x" />
              <button className="fgprod-btn-primary" style={{ marginTop: '0.5rem' }} onClick={openAddRecipeModal}>
                <FontAwesomeIcon icon={faPlus} /> Add RM Recipe
              </button>
            </div>
          ) : (
            <>
              <div className="fgprod-table-wrapper">
                <table className="fgprod-table">
                  <thead>
                    <tr>
                      <th>RM Item Name</th>
                      <th className="fgprod-num">Quantity</th>
                      <th className="fgprod-num">Last Price</th>
                      <th className="fgprod-num">Line Cost</th>
                      <th style={{ width: '80px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map(r => (
                      <tr key={r.id}>
                        <td className="fgprod-bold" style={{ color: 'var(--fgprod-text)' }}>{r.rm_item_name}</td>
                        <td className="fgprod-num" style={{ fontWeight: 500 }}>{parseFloat(r.quantity).toFixed(3)}</td>
                        <td className="fgprod-num">Rs. {parseFloat(r.last_price).toFixed(2)}</td>
                        <td className="fgprod-num fgprod-bold" style={{ color: 'var(--fgprod-primary)' }}>
                          Rs. {(parseFloat(r.quantity) * parseFloat(r.last_price)).toFixed(2)}
                        </td>
                        <td>
                          <div className="fgprod-actions">
                            <button className="fgprod-icon-btn" onClick={() => openEditRecipeModal(r)} title="Edit">
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button className="fgprod-icon-btn danger" onClick={() => handleDeleteRecipe(r)} title="Delete">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="fgprod-cost-summary" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total RM Cost ({parseFloat(selectedFg.recipe_output_quantity || 0).toFixed(0)} Pieces):</span>
                    <span className="fgprod-cost-value">Rs. {totalRmCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>RM Cost Per Piece:</span>
                    <span className="fgprod-cost-value">
                      {recipeOutputQuantity > 0 ? `Rs. ${rmCostPerPiece.toFixed(2)}` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* FG Create / Edit Modal */}
      {showFgForm && (
        <div className="fgprod-modal-overlay" onClick={closeFgForm}>
          <div className="fgprod-modal-content" onClick={e => e.stopPropagation()}>
            <div className="fgprod-modal-header">
              <h3>{fgFormMode === 'create' ? 'New FG Production Item' : 'Edit FG Production Item'}</h3>
              <button className="fgprod-modal-close" onClick={closeFgForm}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="fgprod-modal-body">
              <div className="fgprod-form-group">
                <label>FG Item Name *</label>
                <input
                  type="text"
                  className="fgprod-input"
                  value={fgFormName}
                  onChange={(e) => setFgFormName(e.target.value)}
                  placeholder="e.g. Chocolate Cake"
                />
              </div>
              <div className="fgprod-form-group">
                <label>Department *</label>
                <Select
                  classNamePrefix="react-select"
                  options={departmentOptions}
                  value={fgFormDepartment}
                  onChange={setFgFormDepartment}
                  placeholder="Select department..."
                />
              </div>
              <div className="fgprod-form-group" style={{ marginTop: '1rem' }}>
                <label>Recipe Output Quantity (Pieces) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="fgprod-input"
                  value={fgFormOutputQuantity}
                  onChange={(e) => setFgFormOutputQuantity(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            </div>
            <div className="fgprod-modal-footer">
              <button className="fgprod-btn-secondary" onClick={closeFgForm}>Cancel</button>
              <button className="fgprod-btn-primary" onClick={submitFgForm} disabled={savingFg}>
                <FontAwesomeIcon icon={faSave} /> {savingFg ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Add / Edit Modal */}
      {recipeModalOpen && (
        <div className="fgprod-modal-overlay" onClick={closeRecipeModal}>
          <div className="fgprod-modal-content" onClick={e => e.stopPropagation()}>
            <div className="fgprod-modal-header">
              <h3>{recipeModalMode === 'add' ? 'Add RM Recipe' : 'Edit RM Recipe'}</h3>
              <button className="fgprod-modal-close" onClick={closeRecipeModal}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="fgprod-modal-body">
              <div className="fgprod-form-group">
                <label>RM Item Name *</label>
                <Select
                  classNamePrefix="react-select"
                  options={rawMaterialOptions}
                  value={rawMaterialOptions.find(o => String(o.value) === String(recipeForm.rm_item_id)) || null}
                  onChange={handleRecipeRmChange}
                  isSearchable
                  placeholder="Select raw material..."
                />
              </div>
              <div className="fgprod-form-grid">
                <div className="fgprod-form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className="fgprod-input"
                    value={recipeForm.quantity}
                    onChange={(e) => setRecipeForm(prev => ({ ...prev, quantity: e.target.value }))}
                    placeholder="0.000"
                  />
                </div>
                <div className="fgprod-form-group">
                  <label>Last Price *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="fgprod-input"
                    value={recipeForm.last_price}
                    onChange={(e) => setRecipeForm(prev => ({ ...prev, last_price: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="fgprod-modal-footer">
              <button className="fgprod-btn-secondary" onClick={closeRecipeModal}>Cancel</button>
              <button className="fgprod-btn-primary" onClick={submitRecipeForm} disabled={savingRecipe}>
                <FontAwesomeIcon icon={faSave} /> {savingRecipe ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;
