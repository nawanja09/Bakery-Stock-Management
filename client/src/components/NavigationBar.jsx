//client/src/components/NavigationBar.jsx

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faTachometerAlt, 
  faBox,
  faBalanceScale,
  faShoppingCart,
  faShareSquare,
  faTrashAlt,
  faChartBar,
  faCog,
  faSignOutAlt,
  faChevronDown,
  faList,
  faHistory,
  faPlusCircle,
  faFileInvoice,
  faTruckLoading,
  faTrash,
  faUsers,
  faKey,
  faTruck
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const toggleDropdown = (name) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  return (
    <div className="sidebar">
      <div className="logo-container">     
        <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
      </div>
      
      <nav className="nav-menu">
        <ul>
          <li>
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faTachometerAlt} className="icon" />
              </span>
              <span>Dashboard</span>
            </NavLink>
          </li>
          
          {/* Items Management */}
          <li className={`dropdown ${activeDropdown === 'items' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('items')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faBox} className="icon" />
              </span>
              <span>Items Management</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/items/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faPlusCircle} className="icon" />
                  </span>
                  <span>Add New Items</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faList} className="icon" />
                  </span>
                  <span>View Items</span>
                </NavLink>
              </li>
            </ul>
          </li>          
          {/* Opening Balances */}
          <li className={`dropdown ${activeDropdown === 'opening' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('opening')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faBalanceScale} className="icon" />
              </span>
              <span>Opening Balances</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/opening/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faPlusCircle} className="icon" />
                  </span>
                  <span>Add Opening Balance</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/opening/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faHistory} className="icon" />
                  </span>
                  <span>View History</span>
                </NavLink>
              </li>
            </ul>
          </li>
          
          {/* Purchase */}
          <li className={`dropdown ${activeDropdown === 'purchase' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('purchase')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faShoppingCart} className="icon" />
              </span>
              <span>Purchase</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/purchase/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faPlusCircle} className="icon" />
                  </span>
                  <span>Add New</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/purchase/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faFileInvoice} className="icon" />
                  </span>
                  <span>Purchase History</span>
                </NavLink>
              </li>
            </ul>
          </li>
          
          {/* Suppliers */}
          <li className={`dropdown ${activeDropdown === 'suppliers' ? 'active' : ''}`}>
            <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faTruck} className="icon" />
              </span>
              <span>Suppliers</span>
            </NavLink>
          </li>

          {/* Issuance */}
          <li className={`dropdown ${activeDropdown === 'issuance' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('issuance')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faShareSquare} className="icon" />
              </span>
              <span>Issuance</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/issuance/issue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faTruckLoading} className="icon" />
                  </span>
                  <span>Issue to Department</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/issuance/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faHistory} className="icon" />
                  </span>
                  <span>Issuance History</span>
                </NavLink>
              </li>
            </ul>
          </li>
          
          {/* Wastage */}
          <li className={`dropdown ${activeDropdown === 'wastage' ? 'active' : ''}`}>
            <NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faTrashAlt} className="icon" />
              </span>
              <span>Wastage</span>
            </NavLink>
          </li>
          
          {/* Reports */}
          <li className={`dropdown ${activeDropdown === 'reports' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('reports')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faChartBar} className="icon" />
              </span>
              <span>Reports</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faBox} className="icon" />
                  </span>
                  <span>Stock Reports</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/reports/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faShoppingCart} className="icon" />
                  </span>
                  <span>Purchasing Report</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faTrash} className="icon" />
                  </span>
                  <span>Wastage Report</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faShareSquare} className="icon" />
                  </span>
                  <span>Issuance Report</span>
                </NavLink>
              </li>
            </ul>
          </li>
          
          {/* Settings/Admin */}
          <li className={`dropdown ${activeDropdown === 'admin' ? 'active' : ''}`}>
            <div className="dropdown-header" onClick={() => toggleDropdown('admin')}>
              <span className="icon-container">
                <FontAwesomeIcon icon={faCog} className="icon" />
              </span>
              <span>Settings / Admin</span>
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className="chevron"
              />
            </div>
            <ul className="dropdown-menu">
              <li>
                <NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faUsers} className="icon" />
                  </span>
                  <span>Manage Users</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/password" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon-container">
                    <FontAwesomeIcon icon={faKey} className="icon" />
                  </span>
                  <span>Change Password</span>
                </NavLink>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
      
      <div className="logout-container">
        <button onClick={handleLogout} className="logout-btn">
          <FontAwesomeIcon icon={faSignOutAlt} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

export default NavigationBar;