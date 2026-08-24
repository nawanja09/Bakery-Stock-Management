// src/components/FGProduction/Recipes.jsx
//
// FG - Finished Goods Production (NEW, INDEPENDENT MODULE)
// -----------------------------------------------------------------------
// This page is completely separate from the existing Finished Goods
// "Item Management - FS" pages. FG Item Name / Department entered here
// belong only to this new module's own fg_production table - they are
// never auto-populated from the existing Finished Goods records.
//
// FG Items are no longer created/managed inside BSMS. The Ravon Bakers
// POS system is the source of truth - the "FG Item Name" field below is
// a dropdown loaded from GET /fg-production/items (which the BSMS
// backend proxies from the Ravon POS `/api/items-list` API). Selecting
// an item stores its POS `external_item_id`; `fg_item_name` is kept only
// as a display/cache value. See server/services/ravonPosService.js.
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

// Utility cost is a fixed business rule (70% of Total RM Cost) used to
// approximate overheads like gas/electricity in the per-piece cost. It is
// a formula constant, not a recipe quantity or RM price, so it's fine to
// keep it as a named constant here.
const UTILITY_COST_RATE = 0.7;

// Trims trailing zeros for a clean display value (500 instead of 500.000)
const formatQty = (num) => {
  const rounded = Math.round((Number(num) || 0) * 1000) / 1000;
  return rounded.toString();
};

const formatCurrency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [fgFormItem, setFgFormItem] = useState(null); // { value: external_item_id, label: fg_item_name }
  const [fgFormDepartment, setFgFormDepartment] = useState(null);
  const [fgFormOutputQuantity, setFgFormOutputQuantity] = useState('');
  const [savingFg, setSavingFg] = useState(false);

  // FG Items sourced from the Ravon POS API (external master)
  const [posItems, setPosItems] = useState([]);
  const [posItemsLoading, setPosItemsLoading] = useState(true);
  const [posItemsError, setPosItemsError] = useState(null);
  // True when editing a record whose stored external_item_id can no longer
  // be found in the current Ravon POS list (item removed/deactivated there)
  const [editingItemUnavailable, setEditingItemUnavailable] = useState(false);

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

  // Loads the FG Item list from the BSMS backend, which in turn proxies
  // the Ravon POS `/api/items-list` API (see server/services/ravonPosService.js).
  const fetchPosItems = useCallback(async () => {
    try {
      setPosItemsLoading(true);
      setPosItemsError(null);
      const res = await api.get('/fg-production/items');
      setPosItems(res.data || []);
    } catch (err) {
      console.error(err);
      setPosItems([]);
      setPosItemsError(
        err.response?.data?.error || 'Unable to load FG Items. Please try again.'
      );
    } finally {
      setPosItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFgList();
    fetchPosItems();
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
  }, [fetchFgList, fetchPosItems, showPopup]);

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
  const posItemOptions = posItems.map(i => ({ value: i.external_item_id, label: i.fg_item_name }));
  const fgOptions = fgList
    .filter(f => f.fg_item_name.toLowerCase().includes(fgSearch.toLowerCase()))
    .map(f => ({ value: f.id, label: `${f.fg_item_name}${f.department_name ? ' — ' + f.department_name : ''}` }));

  const openCreateFgForm = () => {
    setFgFormMode('create');
    setFgFormItem(null);
    setFgFormDepartment(null);
    setFgFormOutputQuantity('');
    setEditingItemUnavailable(false);
    setShowFgForm(true);
    if (!posItemsLoading && posItems.length === 0 && !posItemsError) fetchPosItems();
  };

  const openEditFgForm = () => {
    if (!selectedFg) return;
    setFgFormMode('edit');
    setFgFormOutputQuantity(selectedFg.recipe_output_quantity || '');
    setFgFormDepartment(
      selectedFg.department_id
        ? { value: selectedFg.department_id, label: selectedFg.department_name }
        : null
    );

    const matchingPosItem = posItemOptions.find(
      o => String(o.value) === String(selectedFg.external_item_id)
    );
    if (matchingPosItem) {
      setFgFormItem(matchingPosItem);
      setEditingItemUnavailable(false);
    } else {
      // Stored item is either from before the Ravon POS integration
      // (no external_item_id yet) or no longer exists in the current POS
      // list - show its cached name without silently replacing it.
      setFgFormItem(
        selectedFg.external_item_id || selectedFg.fg_item_name
          ? { value: selectedFg.external_item_id || '', label: selectedFg.fg_item_name }
          : null
      );
      setEditingItemUnavailable(true);
    }
    setShowFgForm(true);
  };

  const closeFgForm = () => setShowFgForm(false);

  const handleFgFormItemChange = (opt) => {
    setFgFormItem(opt);
    // Once the user picks a fresh item from the live list, it's no longer
    // the "unavailable" cached one.
    setEditingItemUnavailable(false);
  };

  const submitFgForm = async () => {
    if (!fgFormItem || !fgFormItem.value) {
      showPopup('error', 'Please select an FG Item from the list');
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
      const payload = {
        external_item_id: fgFormItem.value,
        fg_item_name: fgFormItem.label,
        department_id: fgFormDepartment.value,
        recipe_output_quantity: outputQty
      };
      if (fgFormMode === 'create') {
        const res = await api.post('/fg-production', payload);
        showPopup('success', 'FG Production item created successfully');
        await fetchFgList();
        setSelectedFgId(res.data.id);
      } else {
        await api.put(`/fg-production/${selectedFg.id}`, payload);
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
    label: `${rm.name} (${rm.item_code})`
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
      showPopup('error', 'Recipe Quantity must be greater than 0');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showPopup('error', 'Last Price must not be negative');
      return;
    }

    setSavingRecipe(true);
    try {
      const payload = {
        rm_item_id: recipeForm.rm_item_id,
        quantity: qty,
        last_price: price
      };
      if (recipeModalMode === 'add') {
        await api.post(`/fg-production/${selectedFg.id}/recipes`, payload);
        showPopup('success', 'Recipe item added successfully');
      } else {
        await api.put(`/fg-production/recipes/${editingRecipeId}`, payload);
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

  // Recipe Ingredients → Total RM Cost → Utility Cost (70%) →
  // Total Production Cost → RM Cost Per Piece.
  // The recipe endpoint returns the authoritative per-line cost as
  // `line_cost` (quantity * last_price). Normalize database decimal strings
  // here before summing so null/empty values cannot turn the total into NaN.
  const totalRmCost = recipes.reduce((sum, recipe) => {
    const lineCost = Number.parseFloat(recipe.line_cost);
    return sum + (Number.isFinite(lineCost) ? lineCost : 0);
  }, 0);
  const utilityCost = totalRmCost * UTILITY_COST_RATE;
  const totalProductionCost = totalRmCost + utilityCost;

  const recipeOutputQuantity = parseFloat(selectedFg?.recipe_output_quantity) || 0;
  // Prevent division by zero when Recipe Output Quantity is 0 or empty.
  const rmCostPerPiece = recipeOutputQuantity > 0 ? totalProductionCost / recipeOutputQuantity : 0;

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
          <FontAwesomeIcon icon={faPlus} /> New FG Production
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
                      <th>Ingredient</th>
                      <th className="fgprod-num">Unit</th>
                      <th className="fgprod-num">Quantity</th>
                      <th className="fgprod-num">Last Price</th>
                      <th className="fgprod-num">RM Cost</th>
                      <th style={{ width: '80px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map(r => (
                      <tr key={r.id}>
                        <td className="fgprod-bold" style={{ color: 'var(--fgprod-text)' }}>{r.rm_item_name}</td>
                        <td className="fgprod-num">{r.rm_unit}</td>
                        <td className="fgprod-num">{r.quantity}</td>
                        <td className="fgprod-num">Rs. {parseFloat(r.last_price).toFixed(2)}</td>
                        <td className="fgprod-num">Rs. {parseFloat(r.line_cost).toFixed(2)}</td>
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
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', color: 'var(--fgprod-text)' }}>
                    Final RM Costing
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total RM Cost:</span>
                    <span className="fgprod-cost-value">{formatCurrency(totalRmCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Utility Cost (70%):</span>
                    <span className="fgprod-cost-value">{formatCurrency(utilityCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--fgprod-border, #e5e7eb)', paddingTop: '0.5rem' }}>
                    <span style={{ fontWeight: 600 }}>Total Cost Including Utility:</span>
                    <span className="fgprod-cost-value" style={{ fontWeight: 600 }}>{formatCurrency(totalProductionCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Recipe Output Quantity:</span>
                    <span className="fgprod-cost-value">
                      {recipeOutputQuantity > 0 ? `${recipeOutputQuantity.toFixed(0)} Pieces` : 'Not set'}
                    </span>
                  </div>

                  {recipeOutputQuantity > 0 ? (
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: '0.25rem', padding: '0.75rem 1rem', borderRadius: '10px',
                        background: 'var(--fgprod-primary-subtle, #eef2ff)',
                        border: '1px solid var(--fgprod-primary, #4f46e5)'
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>RM Cost Per Piece</span>
                      <span className="fgprod-cost-value" style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--fgprod-primary)' }}>
                        {formatCurrency(rmCostPerPiece)} / Piece
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: '0.25rem', padding: '0.75rem 1rem', borderRadius: '10px',
                        background: '#fff7ed', border: '1px solid #f59e0b'
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>RM Cost Per Piece</span>
                      <span style={{ fontSize: '0.85rem', color: '#b45309', fontWeight: 600, textAlign: 'right' }}>
                        Set a Recipe Output Quantity greater than 0 to calculate this.
                      </span>
                    </div>
                  )}
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
                <Select
                  classNamePrefix="react-select"
                  options={posItemOptions}
                  value={fgFormItem}
                  onChange={handleFgFormItemChange}
                  isLoading={posItemsLoading}
                  isDisabled={posItemsLoading && posItems.length === 0}
                  isClearable
                  isSearchable
                  placeholder={posItemsLoading ? 'Loading FG Items...' : 'Select FG Item...'}
                  noOptionsMessage={() =>
                    posItemsError
                      ? 'Unable to load FG Items. Please try again.'
                      : 'No FG Items are available.'
                  }
                />
                {posItemsError && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#c0392b' }}>{posItemsError}</span>
                    <button
                      type="button"
                      className="fgprod-btn-secondary"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={fetchPosItems}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!posItemsError && editingItemUnavailable && fgFormItem && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#b8860b' }}>
                    This FG Item is no longer available in Ravon POS. Keeping "{fgFormItem.label}" unless you select a different item.
                  </div>
                )}
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
