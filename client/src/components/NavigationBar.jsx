// NavigationBar.js
import React, { useState, useRef, useEffect } from 'react';
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
  faTruck,
  faBars
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [rawMaterialSelected, setRawMaterialSelected] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const toggleDropdown = (name) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const handleRawMaterialClick = () => {
    setRawMaterialSelected(!rawMaterialSelected);
    if (activeDropdown === 'raw') {
      setActiveDropdown(null);
    } else {
      setActiveDropdown('raw');
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      // collapsing: close all dropdowns
      setActiveDropdown(null);
      setRawMaterialSelected(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        if (isCollapsed) {
          setActiveDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCollapsed]);

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} ref={sidebarRef}>
      {/* Top Toggle Button */}
      <div className="toggle-button" onClick={toggleSidebar}>
        <FontAwesomeIcon icon={faBars} />
      </div>

      {/* Logo */}
      <div className="logo-container">
        <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
      </div>

      {/* Nav Menu */}
      <nav className="nav-menu">
        <ul>
          {/* Dashboard Section */}
          <div className="nav-section">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title="Dashboard"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faTachometerAlt} /></span>
                <span>Dashboard</span>
              </NavLink>
            </li>
          </div>

          {/* Raw Material Section */}
          <div className="nav-section">
            <div className="section-separator"></div>
            
            <li>
              <div
                className={`nav-link raw-toggle ${rawMaterialSelected || activeDropdown === 'raw' ? 'active' : ''}`}
                onClick={handleRawMaterialClick}
                title="Raw Material"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                <span>Raw Material</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className="chevron" />}
              </div>
            </li>

            {!isCollapsed && rawMaterialSelected && (
              <>
                {/* Items Management */}
                <li className={`dropdown ${activeDropdown === 'items' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('items')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faBox} className="icon" /></span>
                    <span>Items Management</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/items/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add New Items</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faList} /></span>
                        <span>View Items</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Opening Balances */}
                <li className={`dropdown ${activeDropdown === 'opening' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('opening')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} className="icon" /></span>
                    <span>Opening Balances</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/opening/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add Opening Balance</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/opening/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span>
                        <span>View History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Purchase */}
                <li className={`dropdown ${activeDropdown === 'purchase' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('purchase')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} className="icon" /></span>
                    <span>Purchase</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/purchase/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add New</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/purchase/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span>
                        <span>Purchase History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Suppliers */}
                <li>
                  <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Suppliers">
                    <span className="icon-container"><FontAwesomeIcon icon={faTruck} className="icon" /></span>
                    <span>Suppliers</span>
                  </NavLink>
                </li>

                {/* Issuance */}
                <li className={`dropdown ${activeDropdown === 'issuance' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('issuance')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShareSquare} className="icon" /></span>
                    <span>Issuance</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/issuance/issue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faTruckLoading} /></span>
                        <span>Issue to Department</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/issuance/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span>
                        <span>Issuance History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Wastage */}
                <li>
                  <NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Wastage">
                    <span className="icon-container"><FontAwesomeIcon icon={faTrashAlt} className="icon" /></span>
                    <span>Wastage</span>
                  </NavLink>
                </li>

                {/* Reports */}
                <li className={`dropdown ${activeDropdown === 'reports' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('reports')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faChartBar} className="icon" /></span>
                    <span>Reports</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Stock Reports</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/reports/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
                        <span>Purchasing Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                        <span>Wastage Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span>
                        <span>Issuance Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/reports/stock/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Item Wise Stock Report</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>
              </>
            )}
          </div>

          {/* Settings/Admin Section */}
          <div className="nav-section">
            <div className="section-separator"></div>
            
            <li className={`dropdown ${activeDropdown === 'admin' ? 'active' : ''}`}>
              <div className="dropdown-header" onClick={() => toggleDropdown('admin')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                <span>Settings / Admin</span>
                <FontAwesomeIcon icon={faChevronDown} className="chevron" />
              </div>
              <ul className="dropdown-menu">
                <li>
                  <NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUsers} /></span>
                    <span>Manage Users</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/admin/password" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faKey} /></span>
                    <span>Change Password</span>
                  </NavLink>
                </li>
              </ul>
            </li>
          </div>
        </ul>
      </nav>

      {/* Logout */}
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
