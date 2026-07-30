import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePopup } from '../context/PopupContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faPlus, faEdit, faTrash, faUser, 
  faChevronLeft, faChevronRight, faTimes, faUserShield 
} from '@fortawesome/free-solid-svg-icons';
import './ManageUsers.css';
import api from '../../api';

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const { showPopup } = usePopup();

  // Form states
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');

  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
      setLoading(false);
    } catch (error) {
      showPopup('error', 'Failed to fetch users');
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Filtering
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        user.username?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter ? user.role === roleFilter : true;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  
  // Reset to first page if filter changes and currentPage becomes invalid
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const currentUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { name, username, password, role });
      showPopup('success', 'User added successfully');
      fetchUsers();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${currentUser.id}`, { name, username, role });
      showPopup('success', 'User updated successfully');
      fetchUsers();
      setShowEditModal(false);
      resetForm();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.delete(`/users/${id}`);
        showPopup('success', 'User deleted successfully');
        fetchUsers();
      } catch (error) {
        showPopup('error', 'Failed to delete user');
      }
    }
  };

  const resetForm = () => {
    setName('');
    setUsername('');
    setPassword('');
    setRole('user');
  };

  const openEditModal = (user) => {
    setCurrentUser(user);
    setName(user.name);
    setUsername(user.username);
    setRole(user.role);
    setShowEditModal(true);
  };
  
  const getRoleClass = (r) => {
    switch (r?.toLowerCase()) {
      case 'admin': return 'role-admin';
      case 'manager': return 'role-manager';
      case 'user': return 'role-user';
      default: return 'role-default';
    }
  };

  const getInitials = (fullName) => {
    if (!fullName) return 'U';
    const parts = fullName.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="page-shell manage-users-container">
        <div className="loading" style={{ margin: 'auto' }}>Loading users...</div>
      </div>
    );
  }

  return (
    <div className="page-shell manage-users-container">
      
      {/* Header & Actions */}
      <div className="manage-users-header">
        <h2>Manage Users</h2>
        
        <div className="manage-users-actions">
          <div className="mu-search-filter">
            <select 
              className="mu-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="user">User</option>
              <option value="inventory_officer">Inventory Officer</option>
              <option value="baker">Production Staff</option>
              <option value="Store Keeper">Store Keeper</option>
            </select>
          </div>
          
          <button className="mu-btn-add" onClick={() => setShowAddModal(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add New User
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="mu-table-container">
        
        {/* Desktop Table View */}
        <div className="mu-table-wrapper">
          <table className="mu-data-table">
            <thead>
              <tr>
                <th>User Details</th>
                <th>Username</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentUsers.length > 0 ? currentUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="mu-user-info">
                      <div className="mu-user-avatar">
                        {getInitials(user.name)}
                      </div>
                      <div className="mu-user-details">
                        <span className="mu-user-name">{user.name}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="mu-user-username">@{user.username}</span>
                  </td>
                  <td>
                    <span className={`mu-role-badge ${getRoleClass(user.role)}`}>
                      {user.role === 'admin' && <FontAwesomeIcon icon={faUserShield} />}
                      {user.role}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="mu-actions" style={{ justifyContent: 'flex-end' }}>
                      <button 
                        className="mu-btn-edit"
                        onClick={() => openEditModal(user)}
                        title="Edit User"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button 
                        className="mu-btn-delete"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={user.role === 'admin'}
                        title={user.role === 'admin' ? "Cannot delete admin" : "Delete User"}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4">
                    <div className="mu-empty-state">No users found matching your search criteria.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="mu-card-grid">
          {currentUsers.length > 0 ? currentUsers.map(user => (
            <div className="mu-user-card" key={user.id}>
              <div className="mu-card-header">
                <div className="mu-user-info">
                  <div className="mu-user-avatar">
                    {getInitials(user.name)}
                  </div>
                  <div className="mu-user-details">
                    <span className="mu-user-name">{user.name}</span>
                    <span className="mu-user-username">@{user.username}</span>
                  </div>
                </div>
              </div>
              <div className="mu-card-footer">
                <span className={`mu-role-badge ${getRoleClass(user.role)}`}>
                  {user.role === 'admin' && <FontAwesomeIcon icon={faUserShield} />}
                  {user.role}
                </span>
                <div className="mu-actions">
                  <button 
                    className="mu-btn-edit"
                    onClick={() => openEditModal(user)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    className="mu-btn-delete"
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={user.role === 'admin'}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="mu-empty-state">No users found.</div>
          )}
        </div>

        {/* Pagination */}
        {filteredUsers.length > 0 && (
          <div className="mu-pagination">
            <span className="mu-pagination-info">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
            </span>
            <div className="mu-pagination-controls">
              <button 
                className="mu-page-btn" 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              
              {[...Array(totalPages)].map((_, idx) => (
                <button 
                  key={idx + 1}
                  className={`mu-page-btn ${currentPage === idx + 1 ? 'active' : ''}`}
                  onClick={() => setCurrentPage(idx + 1)}
                >
                  {idx + 1}
                </button>
              ))}

              <button 
                className="mu-page-btn" 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="mu-modal-overlay">
          <div className="mu-modal-content">
            <div className="mu-modal-header">
              <h3><FontAwesomeIcon icon={faUser} /> Add New User</h3>
              <button className="mu-btn-close" onClick={() => setShowAddModal(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <form onSubmit={handleAddUser}>
              <div className="mu-modal-body">
                <div className="mu-form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="mu-form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="mu-form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="mu-form-group">
                  <label>Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="inventory_officer">Inventory Officer</option>
                    <option value="baker">Production Staff</option>
                    <option value="Store Keeper">Store Keeper</option>
                  </select>
                </div>
              </div>
              <div className="mu-modal-footer">
                <button type="button" className="mu-btn-cancel" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="mu-btn-submit">
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && (
        <div className="mu-modal-overlay">
          <div className="mu-modal-content">
            <div className="mu-modal-header">
              <h3><FontAwesomeIcon icon={faEdit} /> Edit User</h3>
              <button className="mu-btn-close" onClick={() => setShowEditModal(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser}>
              <div className="mu-modal-body">
                <div className="mu-form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="mu-form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="mu-form-group">
                  <label>Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="inventory_officer">Inventory Officer</option>
                    <option value="baker">Production Staff</option>
                    <option value="Store Keeper">Store Keeper</option>
                  </select>
                </div>
              </div>
              <div className="mu-modal-footer">
                <button type="button" className="mu-btn-cancel" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="mu-btn-submit">
                  Update User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;