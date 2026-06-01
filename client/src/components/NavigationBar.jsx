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
  faBuildingColumns
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [rawMaterialSelected, setRawMaterialSelected] = useState(false);
  const [finishedGoodsSelected, setFinishedGoodsSelected] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [cutlerySelected, setCutlerySelected] = useState(false);
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

  const handleFinishedGoodsClick = () => {
    setFinishedGoodsSelected(!finishedGoodsSelected);
    if (activeDropdown === 'finished') {
      setActiveDropdown(null);
    } else {
      setActiveDropdown('finished');
    }
  };

  const handleCutleryClick = () => {
    setCutlerySelected(!cutlerySelected);
    if (activeDropdown === 'cutlery') {
      setActiveDropdown(null);
    } else {
      setActiveDropdown('cutlery');
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setActiveDropdown(null);
      setRawMaterialSelected(false);
      setFinishedGoodsSelected(false);
    }
  };

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
                    <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
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
                    <span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span>
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
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
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
                  </ul>
                </li>

                {/* Purchase Returns */}
                <li className={`dropdown ${activeDropdown === 'purchase-returns' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('purchase-returns')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faReply} /></span>
                    <span>Purchase Returns</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/purchase-returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faReply} /></span>
                        <span>Add New Purchase Return</span>
                      </NavLink>
                    </li>
                  </ul>
                  <ul className="dropdown-menu">
                    <li>
                      <NavLink to="/purchase-returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span>
                        <span>Purchase Return View History</span>
                      </NavLink>
                    </li>
                  </ul>
                </li>

                {/* Suppliers */}
                <li>
                  <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Suppliers">
                    <span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span>
                    <span>Suppliers</span>
                  </NavLink>
                </li>

                {/* Issuance */}
                <li className={`dropdown ${activeDropdown === 'issuance' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('issuance')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span>
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
                  <NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTrashAlt} /></span>
                    <span>Wastage</span>
                  </NavLink>
                </li>

                {/* Returns */ }
                <li>
                  <NavLink to="/returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span>
                    <span>Department Returns</span>
                  </NavLink>
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
                    <li><NavLink to="/reports/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span><span>Purchasing Report</span></NavLink></li>
                    <li>
                      <NavLink to="/purchase/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span>
                        <span>Purchase History</span>
                      </NavLink>
                    </li>
                    <li><NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>Wastage Report</span></NavLink></li>
                    <li><NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>Issuance Report</span></NavLink></li>
                    <li><NavLink to="/reports/stock/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Item Wise Stock Report</span></NavLink></li>
                  </ul>
                </li>

                {/* VAT Report*/}
                <li>
                  <NavLink to="/reports/vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                    <span>Purchase VAT Report</span>
                  </NavLink>
                </li>

                {/* Bill Return VAT Report */ }
                <li>
                  <NavLink to="/reports/purchase-vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                    <span>Bill Return VAT Report</span>
                  </NavLink>
                </li>

                {/* Non-paid payment - Outstanding Bill*/}
                <li>
                  <NavLink to="/purchase/non-paid" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faMoneyBill1Wave} /></span>
                    <span>Non-Paid Payments</span>
                  </NavLink>
                </li>

              </>
            )}
          </div>

          {/* Finished Goods Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li>
              <div
                className={`nav-link raw-toggle ${finishedGoodsSelected || activeDropdown === 'finished' ? 'active' : ''}`}
                onClick={handleFinishedGoodsClick}
                title="Finished Goods"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                <span>Finished Goods</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className="chevron" />}
              </div>
            </li>

            {!isCollapsed && finishedGoodsSelected && (
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

                <li className={`dropdown ${activeDropdown === 'items' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('items')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                    <span> Wastage</span>
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

                {/* ✅ Finished Goods Reports Dropdown */}
                <li className={`dropdown ${activeDropdown === 'finished-reports' ? 'active' : ''}`}>
                  <div className="dropdown-header" onClick={() => toggleDropdown('finished-reports')}>
                    <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
                    <span>Reports</span>
                    <FontAwesomeIcon icon={faChevronDown} className="chevron" />
                  </div>
                  <ul className="dropdown-menu">
                    {/* ✅ Item Wise Stock Report (renamed) */}
                    <li>
                      <NavLink to="/finished-goods/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Item Wise Stock Report</span>
                      </NavLink>
                    </li>

                    {/* ✅ New Stock Report */}
                    <li>
                      <NavLink to="/finished-goods/reports/stock/summary" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                        <span>Stock Report</span>
                      </NavLink>
                    </li>

                    {/* Existing Reports */}
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

          {/* Cost Calculator }
          <div className="nav-section">
            <div className="section-separator"></div>

            <li className={`dropdown ${activeDropdown === 'cost' ? 'active' : ''}`}>
              <div className="dropdown-header" onClick={() => toggleDropdown('cost')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                <span> Cost Calculator </span>
                <FontAwesomeIcon icon={faChevronDown} className="chevron" />
              </div>
              <ul className="dropdown-menu">
                <li>
                  <NavLink to="/cost-calculator/calculate" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                    <span>Calculate Cost</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/cost-calculator/saved" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faSave} /></span>
                    <span>Saved Costing</span>
                  </NavLink>
                </li>
              </ul>
            </li>
          </div>
          */}

          {/* Cutlery Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            {/* Main Cutlery Button */}
            <li>
              <div
                className={`nav-link raw-toggle ${cutlerySelected || activeDropdown === 'cutlery' ? 'active' : ''}`}
                onClick={handleCutleryClick}
                title="Cutlery"
              >
                <span className="icon-container"><FontAwesomeIcon icon={faCutlery} /></span>
                <span>Cutlery</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className="chevron" />}
              </div>
            </li>

            {/* Submenu - Only when expanded */}
            {!isCollapsed && cutlerySelected && (
              <>
                {/* 1. Management */}
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

                {/* 2. Transfer */}
                <li>
                  <NavLink to="/cutlery/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faExchangeAlt} /></span>
                    <span>Transfer</span>
                  </NavLink>
                </li>

                {/* 3. Purchasing */}
                <li>
                  <NavLink to="/cutlery/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
                    <span>Purchasing</span>
                  </NavLink>
                </li>

                {/* 4. Damage */}
                <li>
                  <NavLink to="/cutlery/damage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
                    <span>Damage</span>
                  </NavLink>
                </li>

                {/* 5. Stock Report */}
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
                {/* Petty Cash */}
                <li>
                  <NavLink to="/expenses/petty-cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span>
                    <span>Petty Cash</span>
                  </NavLink>
                </li>
                {/* Cheque Expenses */}
                <li>
                  <NavLink to="/expenses/cheque" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faMoneyCheck} /></span>
                    <span>Cheque Expenses</span>
                  </NavLink>
                </li>
                {/* Bank Charges */}
                <li>
                  <NavLink to="/expenses/bank-charges" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span>
                    <span>Bank Charges</span>
                  </NavLink>
                </li>
                {/* Online Expenses */}
                <li>
                  <NavLink to="/expenses/online" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faWifi} /></span>
                    <span>Online Expenses</span>
                  </NavLink>
                </li>
                {/* Bank Details */}
                <li>
                  <NavLink to="/expenses/bank-details" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faBuildingColumns} /></span>
                    <span>Bank Details</span>
                  </NavLink>
                </li>
                {/* Payees */}
                <li>
                  <NavLink to="/expenses/payees" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faUsers} /></span>
                    <span>Payees</span>
                  </NavLink>
                </li>
              </ul>
            </li>
          </div>

          {/* Department Section */}
          <div className="nav-section">
            <div className="section-separator"></div>

            <li className={`dropdown ${activeDropdown === 'departments' ? 'active' : ''}`}>
              <div className="dropdown-header" onClick={() => toggleDropdown('departments')}>
                <span className="icon-container"><FontAwesomeIcon icon={faUsers} /></span>
                <span> Departments </span>
                <FontAwesomeIcon icon={faChevronDown} className="chevron" />
              </div>
              <ul className="dropdown-menu">
                <li>
                  <NavLink to="/reports/department-usage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
                    <span>Usage Report</span>
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
