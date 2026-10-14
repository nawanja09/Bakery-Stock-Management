// src/components/Employees/EmployeeManagement.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePopup } from '../context/PopupContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faPlus, faEdit, faEye, faTimes, faIdBadge,
  faChevronLeft, faChevronRight, faToggleOn, faToggleOff,
  faCheck, faBan
} from '@fortawesome/free-solid-svg-icons';
import './EmployeeManagement.css';
import api from '../../api';

import { useConfirm } from '../common/ui';
const EMPTY_FORM = {
  employee_name: '',
  employee_code: '',
  nic: '',
  contact_number: '',
  department_id: '',
  designation: '',
  company: '',
  joining_date: ''
};

// Sri Lankan NIC: old format = 9 digits + V/X, new format = 12 digits.
// Kept identical to the backend regex in employeeController.js so the
// person sees the same validation message before submitting.
const NIC_REGEX = /^([0-9]{9}[vVxX]|[0-9]{12})$/;

const EmployeeManagement = () => {
  const confirm = useConfirm();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debounceRef = useRef(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { showPopup } = usePopup();

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = useCallback(async (search, status) => {
    try {
      const response = await api.get('/employees', {
        params: {
          ...(search ? { search } : {}),
          ...(status ? { status } : {})
        }
      });
      setEmployees(response.data);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data);
    } catch (error) {
      // Non-fatal: the page still works, the department dropdown is just empty.
      console.error('Error fetching departments:', error);
    }
  }, []);

  // Same master list the Companies management page and other modules
  // (Expenses, Bank Details) already use (GET /api/companies -> the
  // `company` table, e.g. JH/RR/RD).
  const fetchCompanies = useCallback(async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data);
    } catch (error) {
      // Non-fatal: the page still works, the company dropdown is just empty.
      console.error('Error fetching companies:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced server-side search / status filter (Employee Name, Employee
  // Code, NIC, Contact Number - handled together in one search box, per the
  // "one clean search field" requirement).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchEmployees(searchQuery, statusFilter);
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(employees.length / itemsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const currentEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return employees.slice(start, start + itemsPerPage);
  }, [employees, currentPage]);

  // ─── Validation (mirrors employeeController.js validateEmployeeInput) ───
  const validateForm = () => {
    const errors = {};

    if (!form.employee_name.trim()) errors.employee_name = 'Employee Name is required';
    if (!form.employee_code.trim()) errors.employee_code = 'Employee Code is required';

    if (form.nic.trim() && !NIC_REGEX.test(form.nic.trim())) {
      errors.nic = 'Enter a valid NIC (9 digits + V/X, or 12 digits)';
    }

    if (form.contact_number.trim() && !/^\d{10}$/.test(form.contact_number.trim())) {
      errors.contact_number = 'Contact Number must be exactly 10 digits';
    }

    if (!form.company) errors.company = 'Company is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'contact_number') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
      setForm(prev => ({ ...prev, contact_number: digitsOnly }));
      return;
    }

    if (name === 'nic') {
      // Allow digits and a single trailing V/X (old-format NIC), max 12 chars.
      const cleaned = value.replace(/[^0-9vVxX]/g, '').slice(0, 12);
      setForm(prev => ({ ...prev, nic: cleaned }));
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCurrentEmployee(null);
  };

  const closeAllModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowViewModal(false);
    resetForm();
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (employee) => {
    setCurrentEmployee(employee);
    setForm({
      employee_name: employee.employee_name || '',
      employee_code: employee.employee_code || '',
      nic: employee.nic || '',
      contact_number: employee.contact_number || '',
      department_id: employee.department_id ? String(employee.department_id) : '',
      designation: employee.designation || '',
      company: employee.company || '',
      joining_date: employee.joining_date ? String(employee.joining_date).slice(0, 10) : ''
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const openViewModal = (employee) => {
    setCurrentEmployee(employee);
    setShowViewModal(true);
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showPopup('error', 'Please fix the errors in the form');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/employees', form);
      showPopup('success', 'Employee added successfully!');
      closeAllModals();
      fetchEmployees(searchQuery, statusFilter);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showPopup('error', 'Please fix the errors in the form');
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/employees/${currentEmployee.id}`, form);
      showPopup('success', 'Employee updated successfully!');
      closeAllModals();
      fetchEmployees(searchQuery, statusFilter);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (employee) => {
    const newStatus = employee.status === 'Active' ? 'Inactive' : 'Active';
    const confirmMessage = newStatus === 'Inactive'
      ? `Deactivate "${employee.employee_name}"? Their record is kept, only the status changes.`
      : `Reactivate "${employee.employee_name}"?`;

    if (!await confirm(confirmMessage)) return;

    try {
      await api.patch(`/employees/${employee.id}/status`, { status: newStatus });
      showPopup('success', `Employee ${newStatus === 'Active' ? 'activated' : 'deactivated'} successfully!`);
      fetchEmployees(searchQuery, statusFilter);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to update employee status');
    }
  };

  const departmentName = (employee) =>
    employee.department_name || (departments.find(d => String(d.id) === String(employee.department_id))?.name) || 'N/A';

  if (loading) {
    return (
      <div className="page-shell employee-management-container">
        <div className="loading" style={{ margin: 'auto' }}>Loading employees...</div>
      </div>
    );
  }

  return (
    <div className="page-shell employee-management-container">

      {/* Header & Actions */}
      <div className="employee-management-header">
        <h2>Employee Management</h2>

        <div className="employee-management-actions">
          <div className="em-search-box">
            <FontAwesomeIcon icon={faSearch} className="em-search-icon" />
            <input
              type="text"
              placeholder="Search by name, code, NIC, or contact number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="em-search-input"
            />
          </div>

          <button className="em-btn-add" onClick={openAddModal}>
            <FontAwesomeIcon icon={faPlus} /> Add Employee
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="em-table-container">

        {/* Desktop Table View */}
        <div className="em-table-wrapper">
          <table className="em-data-table">
            <thead>
              <tr>
                <th>Employee Code</th>
                <th>Employee Name</th>
                <th>NIC</th>
                <th>Contact Number</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Company</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentEmployees.length > 0 ? currentEmployees.map(employee => (
                <tr key={employee.id}>
                  <td><span className="em-employee-code">{employee.employee_code}</span></td>
                  <td>{employee.employee_name}</td>
                  <td>{employee.nic}</td>
                  <td>{employee.contact_number}</td>
                  <td>{departmentName(employee)}</td>
                  <td>{employee.designation}</td>
                  <td>{employee.company || 'N/A'}</td>
                  <td>{employee.joining_date ? String(employee.joining_date).slice(0, 10) : 'N/A'}</td>
                  <td>
                    <span className={`badge ${employee.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                      <FontAwesomeIcon icon={employee.status === 'Active' ? faCheck : faBan} />
                      {employee.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="em-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="em-btn-view" onClick={() => openViewModal(employee)} title="View Employee">
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button className="em-btn-edit" onClick={() => openEditModal(employee)} title="Edit Employee">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        className={`btn btn-sm ${employee.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggleStatus(employee)}
                        title={employee.status === 'Active' ? 'Deactivate employee' : 'Activate employee'}
                      >
                        <FontAwesomeIcon icon={employee.status === 'Active' ? faToggleOff : faToggleOn} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="10">
                    <div className="em-empty-state">No employees found matching your search criteria.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="em-card-grid">
          {currentEmployees.length > 0 ? currentEmployees.map(employee => (
            <div className="em-employee-card" key={employee.id}>
              <div className="em-card-header">
                <div className="em-card-title">
                  <span className="em-employee-name">{employee.employee_name}</span>
                  <span className="em-employee-code">{employee.employee_code}</span>
                </div>
                <span className={`badge ${employee.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                  <FontAwesomeIcon icon={employee.status === 'Active' ? faCheck : faBan} />
                  {employee.status}
                </span>
              </div>
              <div className="em-card-body">
                <div className="em-card-row"><span>NIC</span><strong>{employee.nic}</strong></div>
                <div className="em-card-row"><span>Contact</span><strong>{employee.contact_number}</strong></div>
                <div className="em-card-row"><span>Department</span><strong>{departmentName(employee)}</strong></div>
                <div className="em-card-row"><span>Designation</span><strong>{employee.designation}</strong></div>
                <div className="em-card-row"><span>Company</span><strong>{employee.company || 'N/A'}</strong></div>
                <div className="em-card-row"><span>Joined</span><strong>{employee.joining_date ? String(employee.joining_date).slice(0, 10) : 'N/A'}</strong></div>
              </div>
              <div className="em-card-footer">
                <button className="em-btn-view" onClick={() => openViewModal(employee)}>
                  <FontAwesomeIcon icon={faEye} />
                </button>
                <button className="em-btn-edit" onClick={() => openEditModal(employee)}>
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button
                  className={`btn btn-sm ${employee.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                  onClick={() => handleToggleStatus(employee)}
                >
                  <FontAwesomeIcon icon={employee.status === 'Active' ? faToggleOff : faToggleOn} />
                </button>
              </div>
            </div>
          )) : (
            <div className="em-empty-state">No employees found.</div>
          )}
        </div>

        {/* Pagination */}
        {employees.length > 0 && (
          <div className="em-pagination">
            <span className="em-pagination-info">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, employees.length)} of {employees.length} employee(s)
            </span>
            <div className="em-pagination-controls">
              <button
                className="em-page-btn"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>

              {[...Array(totalPages)].map((_, idx) => (
                <button
                  key={idx + 1}
                  className={`em-page-btn ${currentPage === idx + 1 ? 'active' : ''}`}
                  onClick={() => setCurrentPage(idx + 1)}
                >
                  {idx + 1}
                </button>
              ))}

              <button
                className="em-page-btn"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="em-modal-overlay">
          <div className="em-modal-content">
            <div className="em-modal-header">
              <h3><FontAwesomeIcon icon={faIdBadge} /> Add Employee</h3>
              <button className="em-btn-close" onClick={closeAllModals}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handleAddEmployee}>
              <div className="em-modal-body">
                <div className="em-form-group">
                  <label>Employee Name *</label>
                  <input
                    type="text"
                    name="employee_name"
                    value={form.employee_name}
                    onChange={handleInputChange}
                    className={formErrors.employee_name ? 'error' : ''}
                    placeholder="e.g. Nimal Perera"
                  />
                  {formErrors.employee_name && <span className="error-message">{formErrors.employee_name}</span>}
                </div>

                <div className="em-form-group">
                  <label>Employee Code *</label>
                  <input
                    type="text"
                    name="employee_code"
                    value={form.employee_code}
                    onChange={handleInputChange}
                    className={formErrors.employee_code ? 'error' : ''}
                    placeholder="e.g. EMP-001"
                  />
                  {formErrors.employee_code && <span className="error-message">{formErrors.employee_code}</span>}
                </div>

                <div className="em-form-group">
                  <label>NIC</label>
                  <input
                    type="text"
                    name="nic"
                    value={form.nic}
                    onChange={handleInputChange}
                    className={formErrors.nic ? 'error' : ''}
                    placeholder="e.g. 200012345678 or 123456789V"
                    maxLength="12"
                  />
                  {formErrors.nic && <span className="error-message">{formErrors.nic}</span>}
                </div>

                <div className="em-form-group">
                  <label>Contact Number</label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={handleInputChange}
                    className={formErrors.contact_number ? 'error' : ''}
                    placeholder="Enter 10-digit phone number"
                    maxLength="10"
                  />
                  {formErrors.contact_number && <span className="error-message">{formErrors.contact_number}</span>}
                </div>

                <div className="em-form-group">
                  <label>Department</label>
                  <select
                    name="department_id"
                    value={form.department_id}
                    onChange={handleInputChange}
                    className={formErrors.department_id ? 'error' : ''}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {formErrors.department_id && <span className="error-message">{formErrors.department_id}</span>}
                </div>

                <div className="em-form-group">
                  <label>Designation</label>
                  <input
                    type="text"
                    name="designation"
                    value={form.designation}
                    onChange={handleInputChange}
                    className={formErrors.designation ? 'error' : ''}
                    placeholder="e.g. Baker, Supervisor"
                  />
                  {formErrors.designation && <span className="error-message">{formErrors.designation}</span>}
                </div>

                <div className="em-form-group">
                  <label>Company *</label>
                  <select
                    name="company"
                    value={form.company}
                    onChange={handleInputChange}
                    className={formErrors.company ? 'error' : ''}
                  >
                    <option value="">Select Company</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.name}>{comp.name}</option>
                    ))}
                  </select>
                  {formErrors.company && <span className="error-message">{formErrors.company}</span>}
                </div>

                <div className="em-form-group">
                  <label>Joining Date</label>
                  <input
                    type="date"
                    name="joining_date"
                    value={form.joining_date}
                    onChange={handleInputChange}
                    className={formErrors.joining_date ? 'error' : ''}
                  />
                  {formErrors.joining_date && <span className="error-message">{formErrors.joining_date}</span>}
                </div>

                <div className="em-form-group">
                  <label>Status</label>
                  <input type="text" value="Active" disabled />
                  <small className="input-hint">New employees are created as Active by default</small>
                </div>
              </div>
              <div className="em-modal-footer">
                <button type="button" className="em-btn-cancel" onClick={closeAllModals}>
                  Cancel
                </button>
                <button type="submit" className="em-btn-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && currentEmployee && (
        <div className="em-modal-overlay">
          <div className="em-modal-content">
            <div className="em-modal-header">
              <h3><FontAwesomeIcon icon={faEdit} /> Edit Employee</h3>
              <button className="em-btn-close" onClick={closeAllModals}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee}>
              <div className="em-modal-body">
                <div className="em-form-group">
                  <label>Employee Name *</label>
                  <input
                    type="text"
                    name="employee_name"
                    value={form.employee_name}
                    onChange={handleInputChange}
                    className={formErrors.employee_name ? 'error' : ''}
                  />
                  {formErrors.employee_name && <span className="error-message">{formErrors.employee_name}</span>}
                </div>

                <div className="em-form-group">
                  <label>Employee Code *</label>
                  <input
                    type="text"
                    name="employee_code"
                    value={form.employee_code}
                    onChange={handleInputChange}
                    className={formErrors.employee_code ? 'error' : ''}
                  />
                  {formErrors.employee_code && <span className="error-message">{formErrors.employee_code}</span>}
                </div>

                <div className="em-form-group">
                  <label>NIC</label>
                  <input
                    type="text"
                    name="nic"
                    value={form.nic}
                    onChange={handleInputChange}
                    className={formErrors.nic ? 'error' : ''}
                    maxLength="12"
                  />
                  {formErrors.nic && <span className="error-message">{formErrors.nic}</span>}
                </div>

                <div className="em-form-group">
                  <label>Contact Number</label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={handleInputChange}
                    className={formErrors.contact_number ? 'error' : ''}
                    maxLength="10"
                  />
                  {formErrors.contact_number && <span className="error-message">{formErrors.contact_number}</span>}
                </div>

                <div className="em-form-group">
                  <label>Department</label>
                  <select
                    name="department_id"
                    value={form.department_id}
                    onChange={handleInputChange}
                    className={formErrors.department_id ? 'error' : ''}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {formErrors.department_id && <span className="error-message">{formErrors.department_id}</span>}
                </div>

                <div className="em-form-group">
                  <label>Designation</label>
                  <input
                    type="text"
                    name="designation"
                    value={form.designation}
                    onChange={handleInputChange}
                    className={formErrors.designation ? 'error' : ''}
                  />
                  {formErrors.designation && <span className="error-message">{formErrors.designation}</span>}
                </div>

                <div className="em-form-group">
                  <label>Company *</label>
                  <select
                    name="company"
                    value={form.company}
                    onChange={handleInputChange}
                    className={formErrors.company ? 'error' : ''}
                  >
                    <option value="">Select Company</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.name}>{comp.name}</option>
                    ))}
                  </select>
                  {formErrors.company && <span className="error-message">{formErrors.company}</span>}
                </div>

                <div className="em-form-group">
                  <label>Joining Date</label>
                  <input
                    type="date"
                    name="joining_date"
                    value={form.joining_date}
                    onChange={handleInputChange}
                    className={formErrors.joining_date ? 'error' : ''}
                  />
                  {formErrors.joining_date && <span className="error-message">{formErrors.joining_date}</span>}
                </div>

                <div className="em-form-group">
                  <label>Status</label>
                  <input type="text" value={currentEmployee.status} disabled />
                  <small className="input-hint">Use the Activate/Deactivate action in the table to change status</small>
                </div>
              </div>
              <div className="em-modal-footer">
                <button type="button" className="em-btn-cancel" onClick={closeAllModals}>
                  Cancel
                </button>
                <button type="submit" className="em-btn-submit" disabled={submitting}>
                  {submitting ? 'Updating...' : 'Update Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Employee Modal (read-only) */}
      {showViewModal && currentEmployee && (
        <div className="em-modal-overlay">
          <div className="em-modal-content">
            <div className="em-modal-header">
              <h3><FontAwesomeIcon icon={faEye} /> Employee Details</h3>
              <button className="em-btn-close" onClick={closeAllModals}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="em-view-body">
              <div className="em-view-row">
                <span className="em-view-label">Employee Name</span>
                <span className="em-view-value">{currentEmployee.employee_name}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Employee Code</span>
                <span className="em-view-value">{currentEmployee.employee_code}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">NIC</span>
                <span className="em-view-value">{currentEmployee.nic}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Contact Number</span>
                <span className="em-view-value">{currentEmployee.contact_number}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Department</span>
                <span className="em-view-value">{departmentName(currentEmployee)}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Designation</span>
                <span className="em-view-value">{currentEmployee.designation}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Company</span>
                <span className="em-view-value">{currentEmployee.company || 'N/A'}</span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Joining Date</span>
                <span className="em-view-value">
                  {currentEmployee.joining_date ? String(currentEmployee.joining_date).slice(0, 10) : 'N/A'}
                </span>
              </div>
              <div className="em-view-row">
                <span className="em-view-label">Status</span>
                <span className={`badge ${currentEmployee.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                  <FontAwesomeIcon icon={currentEmployee.status === 'Active' ? faCheck : faBan} />
                  {currentEmployee.status}
                </span>
              </div>
            </div>

            <div className="em-modal-footer">
              <button type="button" className="em-btn-cancel" onClick={closeAllModals}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;
