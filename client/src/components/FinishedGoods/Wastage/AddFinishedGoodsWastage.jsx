import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faPlus, faTrash, faIndustry, faWarehouse, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './FinishedGoodsWastage.css';

const AddFinishedGoodsWastage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [productions, setProductions] = useState([]);
  const { showPopup } = usePopup();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    approved_by: '',
    reason: 'Expired',
    remarks: '',
    wastage_type: 'General',
    department_id: '',
    production_id: '',
    items: [{ item_id: '', quantity: 1, estimated_loss: 0, production_id: '' }]
  });
  const [loading, setLoading] = useState(false);
  const [fetchingProductions, setFetchingProductions] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsResponse, deptResponse] = await Promise.all([
          api.get('/finished-goods-items'),
          api.get('/departments')
        ]);
        setItems(itemsResponse.data);
        setDepartments(deptResponse.data);
      } catch (error) {
        showPopup('error', 'Failed to fetch data');
      }
    };
    fetchData();
  }, [showPopup]);

  useEffect(() => {
    if (formData.wastage_type === 'Production') {
      fetchProductions();
    }
  }, [formData.wastage_type]);

  const fetchProductions = async () => {
    setFetchingProductions(true);
    try {
      const url = formData.department_id 
        ? `/productions?status=Completed&department_id=${formData.department_id}`
        : '/productions?status=Completed';
      const response = await api.get(url);
      setProductions(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch production batches');
    } finally {
      setFetchingProductions(false);
    }
  };

  const handleWastageTypeChange = async (type) => {
    const newFormData = {
      ...formData,
      wastage_type: type,
      production_id: type === 'Production' ? '' : '',
      department_id: type === 'General' ? formData.department_id : '',
      items: formData.items.map(item => ({
        ...item,
        production_id: type === 'Production' ? formData.production_id : ''
      }))
    };
    setFormData(newFormData);
  };

  const handleDepartmentChange = async (deptId) => {
    const newFormData = { ...formData, department_id: deptId };
    setFormData(newFormData);

    if (formData.wastage_type === 'Production') {
      setFetchingProductions(true);
      try {
        const url = deptId 
          ? `/productions?status=Completed&department_id=${deptId}`
          : '/productions?status=Completed';
        const response = await api.get(url);
        setProductions(response.data);
        
        if (formData.production_id) {
          setFormData(prev => ({
            ...prev,
            production_id: '',
            items: prev.items.map(item => ({ ...item, production_id: '' }))
          }));
        }
      } catch (error) {
        showPopup('error', 'Failed to fetch production batches');
      } finally {
        setFetchingProductions(false);
      }
    }
  };

  const handleProductionChange = (productionId) => {
    const selectedProduction = productions.find(p => p.id == productionId);
    setFormData(prev => ({
      ...prev,
      production_id: productionId,
      items: prev.items.map(item => ({ ...item, production_id: productionId })),
      remarks: prev.remarks || `Wastage from production batch #${productionId}`
    }));
  };

  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { 
        item_id: '', 
        quantity: 1, 
        estimated_loss: 0,
        production_id: formData.wastage_type === 'Production' ? formData.production_id : ''
      }]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length <= 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    
    if (field === 'quantity' || field === 'estimated_loss') {
      value = Number(value) || 0;
    }

    newItems[index][field] = value;

    if (field === 'quantity' || field === 'item_id') {
      const selectedItem = items.find(item => String(item.id) === String(newItems[index].item_id));
      if (selectedItem) {
        const quantity = field === 'quantity' ? value : newItems[index].quantity;
        newItems[index].estimated_loss = (quantity * selectedItem.unit_price).toFixed(2);
      }
    }

    if (formData.wastage_type === 'Production') {
      newItems[index].production_id = formData.production_id;
    }

    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (formData.wastage_type === 'General' && !formData.department_id) {
      showPopup('error', 'Please select a department for General wastage');
      setLoading(false);
      return;
    }

    if (formData.wastage_type === 'Production' && !formData.production_id) {
      showPopup('error', 'Please select a production batch');
      setLoading(false);
      return;
    }

    const hasInvalidItems = formData.items.some(item => !item.item_id || item.quantity <= 0);
    if (hasInvalidItems) {
      showPopup('error', 'Please select valid items and quantities');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        items: formData.items.map(item => ({
          ...item,
          production_id: formData.wastage_type === 'Production' ? formData.production_id : null
        }))
      };

      const response = await api.post('/finished-goods-wastages', payload);
      
      if (response.status === 201) {
        showPopup('success', `Wastage recorded successfully! Note #: ${response.data.wastage_number}`);
        navigate('/finished-goods/wastage/history');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Server error';
      showPopup('error', `Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const departmentOptions = departments.map(dept => ({
    value: dept.id,
    label: dept.name
  }));

  const productionOptions = productions.map(prod => ({
    value: prod.id,
    label: `#${prod.id} - ${new Date(prod.production_date).toLocaleDateString()} - ${prod.prepared_by}`
  }));

  const itemOptions = items.map(item => ({
    value: item.id,
    label: `${item.name} (${item.item_code}) - LKR ${item.unit_price}`
  }));

  const calculateTotalLoss = () => {
    return formData.items.reduce((total, item) => {
      return total + (Number(item.estimated_loss) || 0);
    }, 0).toFixed(2);
  };

  const selectedProduction = productions.find(p => p.id == formData.production_id);

  return (
    <div className="minimal-container">
      <div className="minimal-header">
        <button onClick={() => navigate('/finished-goods/wastage/history')} className="minimal-back-btn">
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to History
        </button>
      </div>

      <h1 className="minimal-title">
        <FontAwesomeIcon icon={faIndustry} className="title-icon" />
        Add Finished Goods Wastage
      </h1>

      <form onSubmit={handleSubmit} className="minimal-form">
        {/* Wastage Type */}
        <div className="minimal-card">
          <h3 className="card-title">Wastage Type</h3>
          <div className="type-selector">
            <button
              type="button"
              className={`type-btn ${formData.wastage_type === 'General' ? 'active' : ''}`}
              onClick={() => handleWastageTypeChange('General')}
            >
              <FontAwesomeIcon icon={faWarehouse} />
              <span>General</span>
              <small>Expired, damaged, or storage-related</small>
            </button>
            <button
              type="button"
              className={`type-btn ${formData.wastage_type === 'Production' ? 'active' : ''}`}
              onClick={() => handleWastageTypeChange('Production')}
            >
              <FontAwesomeIcon icon={faIndustry} />
              <span>Production</span>
              <small>Wastage during production process</small>
            </button>
          </div>
        </div>

        {/* Basic Information */}
        <div className="minimal-card">
          <h3 className="card-title">Basic Information</h3>
          <div className="form-grid">
            <div className="input-group">
              <label>Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Approved By</label>
              <input
                type="text"
                value={formData.approved_by}
                onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
                required
                placeholder="Enter approver name"
              />
            </div>
            <div className="input-group">
              <label>Reason</label>
              <select
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                required
              >
                <option value="Expired">Expired</option>
                <option value="Damaged">Damaged</option>
                <option value="Overproduction">Overproduction</option>
                <option value="Poor Storage">Poor Storage</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Wastage Details */}
        <div className="minimal-card">
          <h3 className="card-title">
            {formData.wastage_type === 'General' ? 'General Details' : 'Production Details'}
          </h3>
          
          {formData.wastage_type === 'General' ? (
            <div className="form-grid">
              <div className="input-group">
                <label>Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  required
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group full-width">
                <label>Remarks</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Additional notes..."
                  rows="2"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="form-grid">
                <div className="input-group">
                  <label>Department Filter</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                  >
                    <option value="">All Departments</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Production Batch *</label>
                  <select
                    value={formData.production_id}
                    onChange={(e) => handleProductionChange(e.target.value)}
                    required
                    disabled={fetchingProductions}
                  >
                    <option value="">Select Batch</option>
                    {productionOptions.map(prod => (
                      <option key={prod.value} value={prod.value}>{prod.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {formData.production_id && selectedProduction && (
                <div className="info-banner">
                  <h4>Selected Production</h4>
                  <div className="info-grid">
                    <span>Date: {new Date(selectedProduction.production_date).toLocaleDateString()}</span>
                    <span>Prepared By: {selectedProduction.prepared_by}</span>
                    <span>Department: {selectedProduction.department_name || 'N/A'}</span>
                  </div>
                </div>
              )}
              
              <div className="input-group">
                <label>Remarks</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Production wastage notes..."
                  rows="2"
                />
              </div>
            </>
          )}
        </div>

        {/* Wastage Items */}
        <div className="minimal-card">
          <div className="card-header">
            <h3 className="card-title">Wasted Items</h3>
            <button 
              type="button" 
              className="add-item-btn"
              onClick={addItemRow}
              disabled={formData.wastage_type === 'Production' && !formData.production_id}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Item
            </button>
          </div>

          {formData.wastage_type === 'Production' && !formData.production_id && (
            <div className="warning-banner">
              Please select a production batch to add items
            </div>
          )}

          <div className="items-table">
            {formData.items.map((item, index) => (
              <div key={index} className="item-row">
                <div className="item-field">
                  <label>Item</label>
                  <Select
                    options={itemOptions}
                    value={itemOptions.find(opt => opt.value == item.item_id) || null}
                    onChange={(selected) => handleItemChange(index, 'item_id', selected?.value || '')}
                    isSearchable
                    placeholder="Select item..."
                    isDisabled={formData.wastage_type === 'Production' && !formData.production_id}
                    className="minimal-select"
                    classNamePrefix="select"
                  />
                </div>
                
                <div className="item-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    required
                    disabled={formData.wastage_type === 'Production' && !formData.production_id}
                  />
                </div>
                
                <div className="item-field">
                  <label>Loss (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.estimated_loss}
                    onChange={(e) => handleItemChange(index, 'estimated_loss', e.target.value)}
                    required
                    readOnly={!!item.item_id}
                    disabled={formData.wastage_type === 'Production' && !formData.production_id}
                  />
                </div>

                <button
                  type="button"
                  className="remove-item-btn"
                  onClick={() => removeItemRow(index)}
                  disabled={formData.items.length === 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>

          <div className="total-loss">
            <span>Total Estimated Loss:</span>
            <span className="loss-amount">LKR {calculateTotalLoss()}</span>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button 
            type="button" 
            className="cancel-btn"
            onClick={() => navigate('/finished-goods/wastage/history')}
          >
            Cancel
          </button>
          <button type="submit" className="submit-btn" disabled={loading}>
            <FontAwesomeIcon icon={faSave} />
            {loading ? 'Saving...' : `Save ${formData.wastage_type} Wastage`}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddFinishedGoodsWastage;