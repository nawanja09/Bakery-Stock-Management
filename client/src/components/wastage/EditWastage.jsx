import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faSave,
  faPlus,
  faTrash,
  faSearch,
  faEdit,
  faExclamationTriangle,
  faInfoCircle,
  faSpinner,
  faCalculator,
  faChevronRight,
  faBoxOpen,
  faClipboardList,
  faFileAlt,
  faCalendarAlt,
  faUserCircle,
  faQuestionCircle
} from '@fortawesome/free-solid-svg-icons';
import './EditWastage.css';

// props.embeddedId / props.onSaved / props.onCancel are optional.
// When absent (standalone route usage via /wastage/edit/:id), behavior is unchanged.
const EditWastage = ({ embeddedId, onSaved, onCancel, isRmAdjustment = false } = {}) => {
  const params = useParams();
  const id = embeddedId || params.id;
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  const goBack = () => (onCancel ? onCancel() : navigate('/wastage/history'));
  const goAfterSave = () => (onSaved ? onSaved() : navigate('/wastage/history'));

  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemPrices, setItemPrices] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRefs = useRef({});
  const [authChecked, setAuthChecked] = useState(false);

  const [formData, setFormData] = useState({
    wastage_note_number: '',
    date: new Date().toISOString().split('T')[0],
    approved_by: '',
    reason: 'Expired',
    remarks: '',
    items: [{ item_id: '', quantity: 1, estimated_loss: 0, unit: '', unit_price: 0 }]
  });

  // Check authentication first
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      showPopup('error', 'Please login to continue');
      navigate('/login');
      return;
    }
    setAuthChecked(true);
  }, [navigate, showPopup]);

  // Fetch data on component mount
  useEffect(() => {
    if (!authChecked) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const token = localStorage.getItem('token');

        const [wastageRes, itemsRes, pricesRes] = await Promise.all([
          api.get(`/wastages/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          api.get('/items', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          api.get('/purchases/items/latest-prices', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        const wastageData = wastageRes.data;
        setItems(itemsRes.data);
        setFilteredItems(itemsRes.data);
        setItemPrices(pricesRes.data);

        const preparedItems = wastageData.items && wastageData.items.length > 0
          ? wastageData.items.map(item => {
            const priceData = pricesRes.data[item.item_id];
            const unitPrice = priceData?.unit_price || 0;
            const quantity = Number(item.quantity) || 1;
            return {
              item_id: item.item_id,
              quantity: quantity,
              estimated_loss: quantity * unitPrice, // Auto-calculate
              unit: item.unit || '',
              unit_price: unitPrice
            };
          })
          : [{
            item_id: '',
            quantity: 1,
            estimated_loss: 0,
            unit: '',
            unit_price: 0
          }];

        setFormData({
          wastage_note_number: wastageData.wastage_note_number || '',
          date: wastageData.date ? new Date(wastageData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          approved_by: wastageData.approved_by || '',
          reason: wastageData.reason || 'Expired',
          remarks: wastageData.remarks || '',
          items: preparedItems
        });

      } catch (error) {
        console.error('Error fetching wastage data:', error);

        if (error.response?.status === 401) {
          showPopup('error', 'Session expired. Please login again.');
          localStorage.removeItem('token');
          navigate('/login');
        } else if (error.response?.status === 404) {
          showPopup('error', 'Wastage record not found');
          goBack();
        } else {
          showPopup('error', 'Failed to load wastage data');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, navigate, showPopup, authChecked]);

  // Filter items based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(items);
    } else {
      const filtered = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, items]);

  const calculateEstimatedLoss = (quantity, unitPrice) => {
    return Number((quantity || 0) * (unitPrice || 0));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];

    if (field === 'quantity' || field === 'estimated_loss' || field === 'unit_price') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    if (field === 'item_id') {
      const selectedItem = items.find(item => String(item.id) === String(value));
      if (selectedItem) {
        newItems[index].unit = selectedItem.unit || '';
        const priceData = itemPrices[selectedItem.id];
        newItems[index].unit_price = priceData?.unit_price || 0;
      }
    }

    if (field === 'quantity' || field === 'unit_price' || field === 'item_id') {
      const quantity = Number(newItems[index].quantity) || 0;
      const unitPrice = Number(newItems[index].unit_price) || 0;
      newItems[index].estimated_loss = calculateEstimatedLoss(quantity, unitPrice);
    }

    setFormData({ ...formData, items: newItems });
  };

  const handleItemSelect = (index, itemId) => {
    handleItemChange(index, 'item_id', itemId);
    setSearchTerm('');
    setActiveSearchIndex(null);
    if (searchInputRefs.current[index]) {
      searchInputRefs.current[index].focus();
    }
  };

  const handleSearchChange = (index, value) => {
    if (formData.items[index].item_id) {
      const newItems = [...formData.items];
      newItems[index].item_id = '';
      newItems[index].unit = '';
      newItems[index].unit_price = 0;
      newItems[index].estimated_loss = 0;
      setFormData({ ...formData, items: newItems });
    }
    setSearchTerm(value);
    setActiveSearchIndex(index);
  };

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      const loss = Number(item.estimated_loss) || 0;
      return total + loss;
    }, 0).toFixed(2);
  };

  const calculateTotalItems = () => {
    return formData.items.reduce((total, item) => {
      return total + (Number(item.quantity) || 0);
    }, 0);
  };

  const calculateAverageLoss = () => {
    const totalItems = calculateTotalItems();
    if (totalItems === 0) return "0.00";
    return (Number(calculateTotalLoss()) / totalItems).toFixed(2);
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        item_id: '',
        quantity: 1,
        estimated_loss: 0,
        unit: '',
        unit_price: 0
      }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) {
      showPopup('warning', 'At least one item is required');
      return;
    }
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const getSelectedItemName = (itemId) => {
    if (!itemId) return '';
    const item = items.find(i => String(i.id) === String(itemId));
    return item ? `${item.name} (${item.item_code})` : '';
  };

  const getUnitPriceDisplay = (itemId) => {
    if (!itemId) return '0.00';
    const priceData = itemPrices[itemId];
    return priceData ? priceData.unit_price.toFixed(2) : '0.00';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!formData.date) {
      showPopup('error', 'Please select a date');
      return;
    }

    if (!formData.approved_by.trim()) {
      showPopup('error', 'Please enter the approver name');
      return;
    }

    const hasEmptyItem = formData.items.some(item => !item.item_id);
    if (hasEmptyItem) {
      showPopup('error', 'Please select an item for all rows');
      return;
    }

    const hasInvalidQuantity = formData.items.some(item => item.quantity <= 0);
    if (hasInvalidQuantity) {
      showPopup('error', 'Quantity must be greater than 0 for all items');
      return;
    }

    setIsSubmitting(true);

    const submitData = {
      ...formData,
      items: formData.items.map(({ unit_price, ...item }) => ({
        ...item,
        estimated_loss: Number(item.estimated_loss) || 0,
        quantity: Number(item.quantity) || 0
      }))
    };

    try {
      const token = localStorage.getItem('token');
      const response = await api.put(`/wastages/${id}`, submitData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(isRmAdjustment ? { 'X-RM-Adjustment': 'true' } : {})
        }
      });

      if (response.status === 200) {
        showPopup('success', `Wastage updated successfully! Note #: ${response.data.wastage_note_number || formData.wastage_note_number}`);
        goAfterSave();
      }
    } catch (error) {
      console.error('Error updating wastage:', error);

      if (error.response?.status === 401) {
        showPopup('error', 'Session expired. Please login again.');
        localStorage.removeItem('token');
        navigate('/login');
      } else if (error.response?.status === 404) {
        showPopup('error', 'Wastage record not found');
        goBack();
      } else {
        const errorMessage = error.response?.data?.error || 'Server error';
        showPopup('error', `Error: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="erp-wastage-container erp-skeleton-container">
        <div className="erp-skeleton-header">
           <div className="erp-skeleton-title"></div>
           <div className="erp-skeleton-breadcrumb"></div>
        </div>
        <div className="erp-skeleton-card">
           <div className="erp-skeleton-row"></div>
           <div className="erp-skeleton-row"></div>
        </div>
        <div className="erp-skeleton-card erp-skeleton-tall"></div>
      </div>
    );
  }

  return (
    <div className="erp-wastage-container">
      {/* Header Section */}
      <div className="erp-page-header">
        <div className="erp-header-left">
          {!embeddedId && (
            <button type="button" onClick={goBack} className="btn btn-secondary erp-back-btn" aria-label="Back to wastage history">
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
          )}
          <div className="erp-title-group">
            <div className="erp-breadcrumbs">
              <span>Inventory</span>
              <FontAwesomeIcon icon={faChevronRight} className="erp-breadcrumb-separator" />
              <span>Wastage</span>
              <FontAwesomeIcon icon={faChevronRight} className="erp-breadcrumb-separator" />
              <span className="erp-breadcrumb-active">Edit</span>
            </div>
            <h1>Edit Wastage</h1>
          </div>
          <div className="erp-status-badge">
             <FontAwesomeIcon icon={faEdit} />
             Editing Record
          </div>
        </div>
        {formData.wastage_note_number && (
           <div className="erp-note-number">
             <span className="erp-note-label">Note #</span>
             <span className="erp-note-value">{formData.wastage_note_number}</span>
           </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="erp-form-layout">
        
        {/* Main Content Area */}
        <div className="erp-main-content">
          
          {/* Basic Information Card */}
          <div className="erp-card">
            <div className="erp-card-header">
              <h2>
                <FontAwesomeIcon icon={faClipboardList} className="erp-card-icon" />
                Basic Information
              </h2>
            </div>
            <div className="erp-card-body">
              <div className="erp-form-grid-3">
                <div className="erp-input-group">
                  <label>
                    <FontAwesomeIcon icon={faCalendarAlt} className="erp-label-icon" />
                    Date <span className="erp-required">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="erp-input"
                  />
                </div>

                <div className="erp-input-group">
                  <label>
                    <FontAwesomeIcon icon={faUserCircle} className="erp-label-icon" />
                    Approved By <span className="erp-required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.approved_by}
                    onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
                    required
                    placeholder="Enter approver name"
                    className="erp-input"
                  />
                </div>

                <div className="erp-input-group">
                  <label>
                    <FontAwesomeIcon icon={faQuestionCircle} className="erp-label-icon" />
                    Reason <span className="erp-required">*</span>
                  </label>
                  <select
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    required
                    className="erp-select"
                  >
                    <option value="Expired">Expired</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Overproduction">Overproduction</option>
                    <option value="Poor Storage">Poor Storage</option>
                    <option value="Forecasting errors">Forecasting errors</option>
                    <option value="Human error">Human error</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table Card */}
          <div className="erp-card erp-items-card">
            <div className="erp-card-header erp-flex-between">
              <h2>
                <FontAwesomeIcon icon={faBoxOpen} className="erp-card-icon" />
                Wasted Items
              </h2>
            </div>
            
            <div className="erp-table-container">
              <table className="erp-data-table">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Item Details</th>
                    <th style={{ width: '15%' }}>Quantity</th>
                    <th style={{ width: '10%' }}>Unit</th>
                    <th style={{ width: '15%' }}>Unit Price</th>
                    <th style={{ width: '15%' }}>Est. Loss</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={index} className="erp-table-row">
                      <td>
                        <div className="erp-search-widget">
                          <FontAwesomeIcon icon={faSearch} className="erp-search-icon" />
                          <input
                            ref={el => searchInputRefs.current[index] = el}
                            type="text"
                            placeholder="Search item..."
                            value={item.item_id ? getSelectedItemName(item.item_id) : searchTerm}
                            onChange={(e) => handleSearchChange(index, e.target.value)}
                            onFocus={() => {
                              if (item.item_id) {
                                setSearchTerm('');
                                const newItems = [...formData.items];
                                newItems[index].item_id = '';
                                newItems[index].unit = '';
                                newItems[index].unit_price = 0;
                                newItems[index].estimated_loss = 0;
                                setFormData({ ...formData, items: newItems });
                              }
                              setActiveSearchIndex(index);
                            }}
                            onBlur={() => {
                              setTimeout(() => setActiveSearchIndex(null), 200);
                            }}
                            className="erp-search-input"
                          />
                          {activeSearchIndex === index && searchTerm && !item.item_id && (
                            <div className="erp-dropdown-menu">
                              {filteredItems.length === 0 ? (
                                <div className="erp-dropdown-empty">
                                  <FontAwesomeIcon icon={faExclamationTriangle} /> No items found
                                </div>
                              ) : (
                                filteredItems.map((itm) => {
                                  const priceData = itemPrices[itm.id];
                                  const price = priceData?.unit_price || 0;
                                  return (
                                    <div
                                      key={itm.id}
                                      className="erp-dropdown-item"
                                      onClick={() => handleItemSelect(index, itm.id)}
                                      onMouseDown={(e) => e.preventDefault()}
                                    >
                                      <div className="erp-item-info">
                                        <span className="erp-item-code">{itm.item_code}</span>
                                        <span className="erp-item-name">{itm.name}</span>
                                      </div>
                                      <div className="erp-item-meta">
                                        <span className="erp-item-unit">{itm.unit}</span>
                                        <span className="erp-item-price">Rs. {price.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          required
                          className="erp-number-input"
                        />
                      </td>
                      <td>
                        <div className="erp-readonly-badge">{item.unit || '-'}</div>
                      </td>
                      <td>
                        <div className="erp-price-input-group">
                          <span className="erp-currency">Rs.</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                            className="erp-number-input erp-price-input"
                          />
                        </div>
                        {item.item_id && (
                          <div className="erp-latest-price-hint">
                            Latest: Rs. {getUnitPriceDisplay(item.item_id)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="erp-loss-highlight">
                          Rs. {(item.estimated_loss || 0).toFixed(2)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="erp-icon-btn erp-btn-danger"
                          aria-label="Remove item"
                          onClick={() => removeItemRow(index)}
                          disabled={formData.items.length <= 1}
                          title={formData.items.length <= 1 ? "At least one item required" : "Remove item"}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="erp-table-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addItemRow}
              >
                <FontAwesomeIcon icon={faPlus} />
                Add Another Item
              </button>
            </div>
          </div>

          {/* Remarks Card */}
          <div className="erp-card">
            <div className="erp-card-header">
              <h2>
                <FontAwesomeIcon icon={faFileAlt} className="erp-card-icon" />
                Remarks
              </h2>
              {formData.remarks.length > 0 && (
                <span className="erp-status-badge" style={{ margin: 0, background: '#EFF6FF' }}>Has Notes</span>
              )}
            </div>
            <div className="erp-card-body">
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows="4"
                className="erp-textarea"
                placeholder="Enter any additional context, investigation details, or preventive measures..."
              />
              <div className="erp-char-count">
                {formData.remarks.length} characters
              </div>
            </div>
          </div>
          
        </div>

        {/* Sidebar / Summary Panel */}
        <div className="erp-sidebar">
          <div className="erp-summary-panel">
            <div className="erp-summary-header">
              <div className="erp-summary-icon-wrapper">
                <FontAwesomeIcon icon={faCalculator} className="erp-summary-header-icon" />
              </div>
              <h3>Financial Summary</h3>
            </div>
            
            <div className="erp-summary-body">
              <div className="erp-stat-card">
                <span className="erp-stat-label">Total Items Count</span>
                <span className="erp-stat-value">{calculateTotalItems()}</span>
              </div>
              
              <div className="erp-stat-card">
                <span className="erp-stat-label">Average Loss / Item</span>
                <span className="erp-stat-value">Rs. {calculateAverageLoss()}</span>
              </div>

              <div className="erp-stat-card erp-stat-primary">
                <span className="erp-stat-label">Total Estimated Loss</span>
                <span className="erp-stat-value erp-text-danger">Rs. {calculateTotalLoss()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer Action Bar */}
        <div className="erp-action-bar">
          <div className="erp-action-bar-content">
            <button
              type="button"
              onClick={goBack}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Updating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} />
                  Update Wastage
                </>
              )}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};

export default EditWastage;
