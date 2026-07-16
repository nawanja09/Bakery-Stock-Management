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
  faBars,
  faCalculator,
  faClipboardList,
  faUndo,
  faCutlery,
  faMapMarkerAlt,
  faExchangeAlt,
  faReply,
  faDollarSign,
  faFileInvoiceDollar,
  faMoneyBill1Wave,
  faCashRegister,
  faMoneyCheck,
  faUniversity,
  faWifi,
  faBuildingColumns,
  faSave,
  faAdjust,
  faWarehouse,
  faTools,
  faBuilding,
  faCreditCard
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const toggleDropdown = (name) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const handleSectionClick = (sectionName) => {
    setActiveDropdown(null);
    setActiveSection(activeSection === sectionName ? null : sectionName);
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setActiveSection(null);
      setActiveDropdown(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        if (isCollapsed) {
          setActiveSection(null);
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
      <div className="toggle-button" onClick={toggleSidebar}>
        <FontAwesomeIcon icon={faBars} />
      </div>

      <div className="logo-container">
        <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
      </div>

      <nav className="nav-menu">
        <ul>
          {/* Dashboard */}
          <div className="nav-section">
            <li>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Dashboard">
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
                className={`nav-link section-toggle ${activeSection === 'raw' ? 'active' : ''}`}
                onClick={() => handleSectionClick('raw')}
                title="Raw Material"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                <span>Raw Material</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeSection === 'raw' ? 'rotated' : ''}`} />}
              </div>
            </li>

            {!isCollapsed && activeSection === 'raw' && (
              <>
                <li className={`dropdown ${activeDropdown === 'raw-opening' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('raw-opening')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span>
                    <span>Management</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    {/* RM Item Management */}
                    <li>
                      <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>RM Item</span>
                      </NavLink>
                    </li>
                    {/* RM Item Type*/}
                    <li>
                      <NavLink to="/item-types" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
                        <span>RM Item Types</span>
                      </NavLink>
                    </li>
                    {/* Supplier Management */}
                    <li>
                      <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span>
                        <span>Suppliers</span>
                      </NavLink>
                    </li>
                    {/* Department */}
                    <li>
                      <NavLink to="/departments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span>
                        <span>Departments</span>
                      </NavLink>
                    </li>
                    {/* Company */}
                    <li>
                      <NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span>
                        <span>Companies</span>
                      </NavLink>
                    </li>
                    {/* Payment Methods */}
                    <li>
                      <NavLink to="/payment-methods" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faCreditCard} /></span>
                        <span>Payment Methods</span>
                      </NavLink>
                    </li>
                    {/* Bank Management */}
                    <li>
                      <NavLink to="/expenses/bank-details" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBuildingColumns} /></span>
                        <span>Bank Details</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Purchasing */}
                <li className={`dropdown ${activeDropdown === 'purchase' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('purchase')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
                    <span>Purchasing</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/purchase/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add new purchase</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/purchase-returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faReply} /></span>
                        <span>Purchase Return</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* VAT */}
                <li className={`dropdown ${activeDropdown === 'vat' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('vat')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                    <span>VAT</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    {/* VAT Report*/}
                    <li>
                      <NavLink to="/reports/vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                        <span>VAT Purchasing Report</span>
                      </NavLink>
                    </li>

                    {/* Bill Return VAT Report */}
                    <li>
                      <NavLink to="/reports/purchase-vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                        <span>VAT Purchasing Return Report</span>
                      </NavLink>
                    </li> 
                  </ul>
                </li>

                {/* RM Issue */}
                <li>
                  <NavLink to="/issuance/issue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTruckLoading} /></span>
                    <span>RM Issue</span>
                  </NavLink>
                </li>

                {/* RM Wastage */}
                <li>
                  <NavLink to="/wastage/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>  
                    <span className="icon-container"><FontAwesomeIcon icon={faTrashAlt} /></span>
                    <span>RM Wastage</span>
                  </NavLink>
                </li>

                {/* Department Returns */}
                <li>
                  <NavLink to="/returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span>
                    <span>Department Return</span>
                  </NavLink>
                </li>

                {/* Adjustments*/}
                <li className={`dropdown ${activeDropdown === 'adjustments' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('adjustments')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faAdjust} /></span> 
                    <span>Adjustments</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    {/* Stores Balance */}
                    <li>
                      <NavLink to="/adjustments/stores-balance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faWarehouse} /></span>
                        <span>Stores Balance</span>
                      </NavLink>
                    </li>

                    {/* Stores Adjustments */}
                    <li>
                          <NavLink to="/adjustments/stores-adjustments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <span className="icon-container"><FontAwesomeIcon icon={faTools} /></span>
                            <span>Stores Adjustments</span>
                          </NavLink>
                        </li>
                  </ul>
                </li>

                {/* Reports */}
                <li className={`dropdown ${activeDropdown === 'reports' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('reports')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
                    <span>Reports</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li><NavLink to="/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Stock Reports</span></NavLink></li>
                    <li><NavLink to="/reports/stock/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Item Wise Stock Report</span></NavLink></li>
                    <li><NavLink to="/purchase/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span><span>Purchasing Summary</span></NavLink></li>
                    <li><NavLink to="/reports/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span><span>Purchasing Item Detail</span></NavLink></li>
                    <li><NavLink to="/issuance/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Issue Summary</span></NavLink></li>
                    <li><NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>RM Issue Item Detail</span></NavLink></li>
                    <li><NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Wastage Summary</span></NavLink></li>
                    <li><NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>RM Wastage Item Detail</span></NavLink></li>
                    <li><NavLink to="/returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span><span>Department Return Summary</span></NavLink></li>
                    <li><NavLink to="/reports/department-return-item-wise" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>Department Return Item Detail</span></NavLink></li>
                    {/* <li><NavLink to="/purchase-returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>Purchase Return Summary</span></NavLink></li> */}
                  </ul>
                </li>
              </>
            )}
          </div>

          {/* Finished Goods Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li>
              <div
                className={`nav-link section-toggle ${activeSection === 'finished' ? 'active' : ''}`}
                onClick={() => handleSectionClick('finished')}
                title="Finished Goods"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                <span>Finished Goods</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeSection === 'finished' ? 'rotated' : ''}`} />}
              </div>
            </li>

            {!isCollapsed && activeSection === 'finished' && (
              <>
                <li>
                  <NavLink to="/finished-goods/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faList} /></span>
                    <span>Item Management - FS</span>
                  </NavLink>
                </li>

                <li className={`dropdown ${activeDropdown === 'finished-opening' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('finished-opening')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span>
                    <span>Opening Balances - FS</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li><NavLink to="/finished-goods/opening/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span><span>Add Opening Balance</span></NavLink></li>
                    <li><NavLink to="/finished-goods/opening/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>View History</span></NavLink></li>
                  </ul>
                </li>

                <li><NavLink to="/finished-goods/production" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCog} /></span><span>Production Management</span></NavLink></li>
                <li><NavLink to="/finished-goods/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span><span>Transfers</span></NavLink></li>

                <li className={`dropdown ${activeDropdown === 'finished-wastage' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('finished-wastage')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                    <span>Wastage</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/finished-goods/wastage/kitchen" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add New Wastage</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faList} /></span>
                        <span>Wastage History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Finished Goods Reports Dropdown */}
                <li className={`dropdown ${activeDropdown === 'finished-reports' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('finished-reports')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
                    <span>Reports</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/finished-goods/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Item Wise Stock Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/reports/stock/summary" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Stock Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/reports/production" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                        <span>Production Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                        <span>Wastage Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/reports/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span>
                        <span>Transfer Report</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/reports/bakery-stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                        <span>Bakery Stock Report</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Sales Section under Finished Goods */}
                <li className={`dropdown ${activeDropdown === 'sales' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('sales')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
                    <span>Sales</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/finished-goods/sales/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span>
                        <span>Add New Sale</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/finished-goods/sales/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span>
                        <span>Sales History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>
              </>
            )}
          </div>

          

          {/* Cutlery Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li>
              <div
                className={`nav-link section-toggle ${activeSection === 'cutlery' ? 'active' : ''}`}
                onClick={() => handleSectionClick('cutlery')}
                title="Cutlery"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faCutlery} /></span>
                <span>Cutlery</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeSection === 'cutlery' ? 'rotated' : ''}`} />}
              </div>
            </li>

            {!isCollapsed && activeSection === 'cutlery' && (
              <>
                <li className={`dropdown ${activeDropdown === 'cutlery-management' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('cutlery-management')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                    <span>Management</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/cutlery/locations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faMapMarkerAlt} /></span>
                        <span>Locations</span>
                      </NavLink>
                    </li>
                    <li>
                      <NavLink to="/cutlery/assets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Assets</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                <li>
                  <NavLink to="/cutlery/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faExchangeAlt} /></span>
                    <span>Transfer</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/cutlery/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
                    <span>Purchasing</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/cutlery/damage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                    <span>Damage</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/cutlery/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
                    <span>Stock Report</span>
                  </NavLink>
                </li>
              </>
            )}
          </div>

          {/* Expenses Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li className={`dropdown ${activeDropdown === 'expenses' ? 'active' : ''}`}>
              <div className="dropdown-header" onClick={() => toggleDropdown('expenses')}>
                <span className="icon-container"><FontAwesomeIcon icon={faDollarSign} /></span>
                <span>Expenses</span>
                <FontAwesomeIcon icon={faChevronDown} className="chevron" />
              </div>
              <ul className="dropdown-menu">
                <li>
                  <NavLink to="/expenses/petty-cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span>
                    <span>Petty Cash</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/expenses/cheque" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faMoneyCheck} /></span>
                    <span>Cheque Expenses</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/expenses/bank-charges" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span>
                    <span>Bank Charges</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/expenses/online" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faWifi} /></span>
                    <span>Online Expenses</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/expenses/payees" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUsers} /></span>
                    <span>Payees</span>
                  </NavLink>
                </li>
              </ul>
            </li>
          </div>

          {/* Admin Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li className={`dropdown ${activeDropdown === 'admin' ? 'active' : ''}`}>
              <div className="dropdown-header" onClick={() => toggleDropdown('admin')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                <span>Settings / Admin</span>
                <FontAwesomeIcon icon={faChevronDown} className="chevron" />
              </div>
              <ul className="dropdown-menu">
                <li><NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUsers} /></span><span>Manage Users</span></NavLink></li>
                <li><NavLink to="/admin/password" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faKey} /></span><span>Change Password</span></NavLink></li>
              </ul>
            </li>
          </div>
        </ul>
      </nav>

      {/* Logout Button */}
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