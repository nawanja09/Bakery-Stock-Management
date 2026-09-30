// NavigationBar.js
import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTachometerAlt,
  faBox,
  faDollarSign,
  faCutlery,
  faSignOutAlt,
  faChevronDown,
  faList,
  faHistory,
  faPlusCircle,
  faFileInvoice,
  faTruckLoading,
  faTrash,
  faKey,
  faTruck,
  faBars,
  faCalculator,
  faClipboardList,
  faUndo,
  faMapMarkerAlt,
  faExchangeAlt,
  faReply,
  faCashRegister,
  faMoneyCheck,
  faUniversity,
  faBuildingColumns,
  faAdjust,
  faWarehouse,
  faTools,
  faBuilding,
  faCreditCard,
  faCog,
  faBalanceScale,
  faShoppingCart,
  faChartBar,
  faTrashAlt,
  faShareSquare,
  faMagnifyingGlassChart,
  faClock,
  faWallet,
  faHandHoldingDollar,
  faLandmark,
  faRightLeft,
  faFileInvoiceDollar,
  faIdCard,
  faSackDollar,
  faUserSecret
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import usePermissions from '../hooks/usePermissions';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeModule, setActiveModule] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sidebarRef = useRef(null);

  // Which modules / pages this user sees is decided by the central RBAC config
  // (config/rolePermissions.js) - no role names are hard-coded in this file.
  const { canAccessPath, canAccessAnyPath, canSeeNavModule, getModuleLanding } = usePermissions();
  const can = (path) => canAccessPath(path);
  const canAny = (paths) => canAccessAnyPath(paths);

  // Sync activeModule with current route
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/items') || path.startsWith('/item-types') ||
        path.startsWith('/suppliers') || path.startsWith('/departments') ||
        path.startsWith('/companies') || path.startsWith('/adjustments/payment-methods') ||
        path.startsWith('/expenses/bank-details') ||
        path.startsWith('/expense-types-management') ||
        path.startsWith('/sub-expense-types-management') ||
        path.startsWith('/expense-payees-management') ||
        path.startsWith('/bank-charges-type-management') ||
        path.startsWith('/finance/receive-types') ||
        path.startsWith('/admin/employees')) {
      setActiveModule('management');
    } else if (path.startsWith('/admin/password')) {
      setActiveModule('admin');
    } else if (path.startsWith('/adjustments')) {
      setActiveModule('adjustments');
    } else if (path.startsWith('/reports/vat') || path.startsWith('/reports/purchase-vat')) {
      setActiveModule('vat');
    } else if (path.startsWith('/purchase') || path.startsWith('/issuance') ||
               path.startsWith('/wastage') || path.startsWith('/returns') ||
               path.startsWith('/reports/stock') ||
               path.startsWith('/reports/department') || path.startsWith('/reports/purchasing') ||
               path.startsWith('/reports/purchase-report') ||
               path.startsWith('/reports/wastage') ||
               path.startsWith('/purchase-returns') || path.startsWith('/opening')) {
      setActiveModule('raw');
    } else if (path.startsWith('/finished-goods') || path.startsWith('/cost-calculator')) {
      setActiveModule('finished');
    } else if (path.startsWith('/expenses')) {
      setActiveModule('expenses');
    } else if (path.startsWith('/finance')) {
      setActiveModule('finance');
    } else if (path.startsWith('/cutlery')) {
      setActiveModule('cutlery');
    } else if (path.startsWith('/fg-production')) {
      setActiveModule('fg-production');
    } else if (path.startsWith('/analyst')) {
      setActiveModule('analyst');
    }
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Toggle a nested heading inside the currently open main module
  const toggleDropdown = (name) => {
    setActiveDropdown(prev => (prev === name ? null : name));
  };

  // Main module accordion — single open at a time
  const handleModuleClick = (moduleName) => {
    if (activeModule === moduleName) {
      setActiveModule(null);
      setActiveDropdown(null);
      return;
    }
    setActiveModule(moduleName);
    setActiveDropdown(null);

    // Open the first page of the module this role is actually allowed to use
    // (e.g. QB is view-only, so it lands on a list page instead of an entry form).
    const landing = getModuleLanding(moduleName);
    if (landing) navigate(landing);
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 640) {
      setIsMobileOpen((isOpen) => !isOpen);
      return;
    }
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) setActiveDropdown(null);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        if (isCollapsed) setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCollapsed]);

  // ============================================================
  // MANAGEMENT MODULE — all plain links (no nested dropdowns)
  // ============================================================
  const renderManagementContent = () => (
    <>
      {can('/items') && <li><NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>RM Item</span></NavLink></li>}
      {can('/item-types') && <li><NavLink to="/item-types" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span><span>RM Item Types</span></NavLink></li>}
      {can('/suppliers') && <li><NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span><span>Suppliers</span></NavLink></li>}
      {can('/departments') && <li><NavLink to="/departments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span><span>Departments</span></NavLink></li>}
      {can('/companies') && <li><NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span><span>Companies</span></NavLink></li>}
      {can('/adjustments/payment-methods') && <li><NavLink to="/adjustments/payment-methods" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCreditCard} /></span><span>Payment Methods</span></NavLink></li>}
      {can('/expenses/bank-details') && <li><NavLink to="/expenses/bank-details" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBuildingColumns} /></span><span>Bank Details</span></NavLink></li>}
      {can('/expense-types-management') && <li><NavLink to="/expense-types-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoiceDollar} /></span><span>Expenses Type Management</span></NavLink></li>}
      {can('/sub-expense-types-management') && <li><NavLink to="/sub-expense-types-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoiceDollar} /></span><span>Sub Expenses Type Management</span></NavLink></li>}
      {can('/expense-payees-management') && <li><NavLink to="/expense-payees-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faIdCard} /></span><span>Expenses Payee Management</span></NavLink></li>}
      {can('/bank-charges-type-management') && <li><NavLink to="/bank-charges-type-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span><span>Bank Charges Type Management</span></NavLink></li>}
      {can('/finance/receive-types') && <li><NavLink to="/finance/receive-types" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span><span>Receive Types</span></NavLink></li>}
      {can('/admin/employees') && <li><NavLink to="/admin/employees" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faIdCard} /></span><span>Employee Management</span></NavLink></li>}
    </>
  );

  // ============================================================
  // RAW MATERIAL MODULE — headings only, sub-items on click
  // ============================================================
  const renderRawMaterialContent = () => (
    <>
      {/* Purchasing (heading) */}
      {canAny(['/purchase/new', '/purchase-returns/add']) && (
        <li className={`dropdown ${activeDropdown === 'purchase' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('purchase')}>
            <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
            <span>Purchasing</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'purchase' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'purchase' && (
            <ul className="dropdown-menu">
              {can('/purchase/new') && <li><NavLink to="/purchase/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span><span>Add new purchase</span></NavLink></li>}
              {can('/purchase-returns/add') && <li><NavLink to="/purchase-returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faReply} /></span><span>Purchase Return</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {/* Orders (plain link) */}
      {can('/purchase/orders') && <li><NavLink to="/purchase/orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span><span>Orders</span></NavLink></li>}

      {/* RM Issue (plain link) */}
      {can('/issuance/issue') && <li><NavLink to="/issuance/issue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTruckLoading} /></span><span>RM Issue</span></NavLink></li>}

      {/* RM Wastage (plain link) */}
      {can('/wastage/add') && <li><NavLink to="/wastage/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrashAlt} /></span><span>RM Wastage</span></NavLink></li>}

      {/* Department Return (plain link) */}
      {can('/returns/add') && <li><NavLink to="/returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span><span>Department Return</span></NavLink></li>}

      {/* Reports (heading) */}
      {canAny(['/reports/stock', '/reports/stock/items', '/purchase/history', '/reports/purchasing', '/reports/purchase-report', '/issuance/history', '/reports/department', '/wastage/history', '/reports/wastage', '/returns/history', '/reports/department-return-item-wise']) && (
        <li className={`dropdown ${activeDropdown === 'reports' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('reports')}>
            <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
            <span>Reports</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'reports' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'reports' && (
            <ul className="dropdown-menu">
              {can('/reports/stock') && <li><NavLink to="/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Stock Reports</span></NavLink></li>}
              {can('/reports/stock/items') && <li><NavLink to="/reports/stock/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Item Wise Stock Report</span></NavLink></li>}
              {can('/purchase/history') && <li><NavLink to="/purchase/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span><span>Purchasing Summary</span></NavLink></li>}
              {can('/reports/purchasing') && <li><NavLink to="/reports/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span><span>Purchasing Item Detail</span></NavLink></li>}
              {can('/reports/purchase-report') && <li><NavLink to="/reports/purchase-report" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span><span>Purchase Report</span></NavLink></li>}
              {can('/issuance/history') && <li><NavLink to="/issuance/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Issue Summary</span></NavLink></li>}
              {can('/reports/department') && <li><NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>RM Issue Item Detail</span></NavLink></li>}
              {can('/wastage/history') && <li><NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Wastage Summary</span></NavLink></li>}
              {can('/reports/wastage') && <li><NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>RM Wastage Item Detail</span></NavLink></li>}
              {can('/returns/history') && <li><NavLink to="/returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span><span>Department Return Summary</span></NavLink></li>}
              {can('/reports/department-return-item-wise') && <li><NavLink to="/reports/department-return-item-wise" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>Department Return Item Detail</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {/* Analysis (heading) */}
      {canAny(['/analysis/last-issued-date']) && (
        <li className={`dropdown ${activeDropdown === 'analysis' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('analysis')}>
            <span className="icon-container"><FontAwesomeIcon icon={faMagnifyingGlassChart} /></span>
            <span>Analysis</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'analysis' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'analysis' && (
            <ul className="dropdown-menu">
              {can('/analysis/last-issued-date') && <li><NavLink to="/analysis/last-issued-date" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faClock} /></span><span>Last Issued Date</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}
    </>
  );

  // ============================================================
  // FINISHED GOODS MODULE — headings only, sub-items on click
  // ============================================================
  const renderFinishedGoodsContent = () => (
    <>
      {can('/finished-goods/items') && <li><NavLink to="/finished-goods/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faList} /></span><span>Item Management - FS</span></NavLink></li>}

      {/* Opening Balances (heading) */}
      {canAny(['/finished-goods/opening/add', '/finished-goods/opening/history']) && (
        <li className={`dropdown ${activeDropdown === 'finished-opening' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('finished-opening')}>
            <span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span>
            <span>Opening Balances - FS</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'finished-opening' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'finished-opening' && (
            <ul className="dropdown-menu">
              {can('/finished-goods/opening/add') && <li><NavLink to="/finished-goods/opening/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span><span>Add Opening Balance</span></NavLink></li>}
              {can('/finished-goods/opening/history') && <li><NavLink to="/finished-goods/opening/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>View History</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {can('/finished-goods/production') && <li><NavLink to="/finished-goods/production" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCog} /></span><span>Production Management</span></NavLink></li>}
      {can('/finished-goods/transfer') && <li><NavLink to="/finished-goods/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span><span>Transfers</span></NavLink></li>}

      {/* Wastage (heading) */}
      {canAny(['/finished-goods/wastage/kitchen', '/finished-goods/wastage/history']) && (
        <li className={`dropdown ${activeDropdown === 'finished-wastage' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('finished-wastage')}>
            <span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span>
            <span>Wastage</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'finished-wastage' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'finished-wastage' && (
            <ul className="dropdown-menu">
              {can('/finished-goods/wastage/kitchen') && <li><NavLink to="/finished-goods/wastage/kitchen" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span><span>Add New Wastage</span></NavLink></li>}
              {can('/finished-goods/wastage/history') && <li><NavLink to="/finished-goods/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faList} /></span><span>Wastage History</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {/* Reports (heading) */}
      {canAny(['/finished-goods/reports/stock', '/finished-goods/reports/stock/summary', '/finished-goods/reports/production', '/finished-goods/reports/wastage', '/finished-goods/reports/transfer', '/finished-goods/reports/bakery-stock']) && (
        <li className={`dropdown ${activeDropdown === 'finished-reports' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('finished-reports')}>
            <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
            <span>Reports</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'finished-reports' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'finished-reports' && (
            <ul className="dropdown-menu">
              {can('/finished-goods/reports/stock') && <li><NavLink to="/finished-goods/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Item Wise Stock Report</span></NavLink></li>}
              {can('/finished-goods/reports/stock/summary') && <li><NavLink to="/finished-goods/reports/stock/summary" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Stock Report</span></NavLink></li>}
              {can('/finished-goods/reports/production') && <li><NavLink to="/finished-goods/reports/production" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCog} /></span><span>Production Report</span></NavLink></li>}
              {can('/finished-goods/reports/wastage') && <li><NavLink to="/finished-goods/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>Wastage Report</span></NavLink></li>}
              {can('/finished-goods/reports/transfer') && <li><NavLink to="/finished-goods/reports/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span><span>Transfer Report</span></NavLink></li>}
              {can('/finished-goods/reports/bakery-stock') && <li><NavLink to="/finished-goods/reports/bakery-stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span><span>Bakery Stock Report</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {/* Sales (heading) */}
      {canAny(['/finished-goods/sales/new', '/finished-goods/sales/history']) && (
        <li className={`dropdown ${activeDropdown === 'sales' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('sales')}>
            <span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span>
            <span>Sales</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'sales' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'sales' && (
            <ul className="dropdown-menu">
              {can('/finished-goods/sales/new') && <li><NavLink to="/finished-goods/sales/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faPlusCircle} /></span><span>Add New Sale</span></NavLink></li>}
              {can('/finished-goods/sales/history') && <li><NavLink to="/finished-goods/sales/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>Sales History</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}
    </>
  );

  // ============================================================
  // EXPENSES MODULE — all plain links
  // ============================================================
  const renderExpensesContent = () => (
    <>
      {can('/expenses/petty-cash') && <li><NavLink to="/expenses/petty-cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span><span>Petty Cash</span></NavLink></li>}
      {can('/expenses/bank-charges') && <li><NavLink to="/expenses/bank-charges" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span><span>Bank Charges</span></NavLink></li>}
      {can('/expenses/new') && <li><NavLink to="/expenses/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faMoneyCheck} /></span><span>New Expenses</span></NavLink></li>}
      {can('/expenses/cash-expenses') && <li><NavLink to="/expenses/cash-expenses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faWallet} /></span><span>Cash Expenses</span></NavLink></li>}
      {can('/expenses/hidden') && <li><NavLink to="/expenses/hidden" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUserSecret} /></span><span>Hidden Expenses</span></NavLink></li>}
      {can('/expenses/reports') && <li><NavLink to="/expenses/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span><span>Expenses Reports</span></NavLink></li>}
    </>
  );

  // ============================================================
  // FINANCE MODULE — all plain links
  // ============================================================
  const renderFinanceContent = () => (
    <>
      {can('/finance/cash') && <li><NavLink to="/finance/cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span><span>Cash Ledger</span></NavLink></li>}
      {can('/finance/cash-receive') && <li><NavLink to="/finance/cash-receive" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHandHoldingDollar} /></span><span>Cash Receive</span></NavLink></li>}
      {can('/finance/bank') && <li><NavLink to="/finance/bank" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span><span>Bank Ledger</span></NavLink></li>}
      {can('/finance/bank-receive') && <li><NavLink to="/finance/bank-receive" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faLandmark} /></span><span>Bank Receive</span></NavLink></li>}
      {can('/finance/transfer') && <li><NavLink to="/finance/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faRightLeft} /></span><span>Cash / Bank Transfer</span></NavLink></li>}
      {can('/finance/bank-transfer') && <li><NavLink to="/finance/bank-transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faRightLeft} /></span><span>Bank to Bank Transfer</span></NavLink></li>}
      {can('/finance/cheque-registry') && <li><NavLink to="/finance/cheque-registry" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faMoneyCheck} /></span><span>Expenses Cheque Registry</span></NavLink></li>}
      {can('/finance/staff-loans') && <li><NavLink to="/finance/staff-loans" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faSackDollar} /></span><span>Staff Loans</span></NavLink></li>}
      {can('/finance/intercompany') && (
        <li>
          <NavLink to="/finance/intercompany" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon-container"><FontAwesomeIcon icon={faExchangeAlt} /></span>
            <span>Intercompany Transaction</span>
          </NavLink>
        </li>
      )}
    </>
  );

  // ============================================================
  // CUTLERY MODULE — Management heading + plain links
  // ============================================================
  const renderCutleryContent = () => (
    <>
      {/* Management (heading) */}
      {canAny(['/cutlery/locations', '/cutlery/assets']) && (
        <li className={`dropdown ${activeDropdown === 'cutlery-management' ? 'active' : ''}`}>
          <div className="dropdown-header" onClick={() => toggleDropdown('cutlery-management')}>
            <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
            <span>Management</span>
            <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeDropdown === 'cutlery-management' ? 'rotated' : ''}`} />
          </div>
          {activeDropdown === 'cutlery-management' && (
            <ul className="dropdown-menu">
              {can('/cutlery/locations') && <li><NavLink to="/cutlery/locations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faMapMarkerAlt} /></span><span>Locations</span></NavLink></li>}
              {can('/cutlery/assets') && <li><NavLink to="/cutlery/assets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBox} /></span><span>Assets</span></NavLink></li>}
            </ul>
          )}
        </li>
      )}

      {can('/cutlery/transfer') && <li><NavLink to="/cutlery/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faExchangeAlt} /></span><span>Transfer</span></NavLink></li>}
      {can('/cutlery/purchasing') && <li><NavLink to="/cutlery/purchasing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShoppingCart} /></span><span>Purchasing</span></NavLink></li>}
      {can('/cutlery/damage') && <li><NavLink to="/cutlery/damage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>Damage</span></NavLink></li>}
      {can('/cutlery/reports/stock') && <li><NavLink to="/cutlery/reports/stock" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span><span>Stock Report</span></NavLink></li>}
    </>
  );

  // ============================================================
  // FG PRODUCTION MODULE — all plain links
  // ============================================================
  const renderFGProductionContent = () => (
    <>
      {can('/fg-production/recipes') && <li><NavLink to="/fg-production/recipes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span><span>Recipes</span></NavLink></li>}
      {can('/fg-production/reports') && <li><NavLink to="/fg-production/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span><span>FG Recipes Reports</span></NavLink></li>}
    </>
  );

  // ============================================================
  // ADJUSTMENTS MODULE — all plain links
  // ============================================================
  const renderAdjustmentsContent = () => (
    <>
      {can('/adjustments/stores-balance') && <li><NavLink to="/adjustments/stores-balance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faWarehouse} /></span><span>Adjustments</span></NavLink></li>}
      {can('/adjustments/stores-adjustments') && <li><NavLink to="/adjustments/stores-adjustments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTools} /></span><span>Adjustment Summary Report</span></NavLink></li>}
      {can('/adjustments/inhand') && <li><NavLink to="/adjustments/inhand" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHandHoldingDollar} /></span><span>Inhand (Cash / Cheque)</span></NavLink></li>}
    </>
  );

  // ============================================================
  // VAT MODULE — all plain links
  // ============================================================
  const renderVATContent = () => (
    <>
      {can('/reports/vat') && <li><NavLink to="/reports/vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span><span>VAT Purchasing Report</span></NavLink></li>}
      {can('/reports/purchase-vat') && <li><NavLink to="/reports/purchase-vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span><span>Return VAT Report</span></NavLink></li>}
    </>
  );

  // ============================================================
  // ANALYST MODULE — all plain links
  // ============================================================
  const renderAnalystContent = () => (
    <>
      {can('/analyst/income') && <li><NavLink to="/analyst/income" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faSackDollar} /></span><span>Income</span></NavLink></li>}
      {can('/analyst/expenses') && <li><NavLink to="/analyst/expenses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faDollarSign} /></span><span>Expenses</span></NavLink></li>}
      {can('/analyst/balance-sheet') && <li><NavLink to="/analyst/balance-sheet" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span><span>Balance Sheet</span></NavLink></li>}
    </>
  );

  // ============================================================
  // ADMIN / SETTINGS — plain links inside
  // ============================================================
  const renderAdminContent = () => (
    <>
      {can('/admin/password') && <li><NavLink to="/admin/password" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faKey} /></span><span>Change Password</span></NavLink></li>}
    </>
  );

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`} ref={sidebarRef}>
      <button className="toggle-button" onClick={toggleSidebar} aria-label="Toggle navigation">
        <FontAwesomeIcon icon={faBars} />
      </button>

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

          <div className="section-separator"></div>

          {/* Management */}
          {canSeeNavModule('management') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'management' ? 'active-module' : ''}`} onClick={() => handleModuleClick('management')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                  <span>Management</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'management' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'management' && <div className="module-content">{renderManagementContent()}</div>}
            </>
          )}

          {/* Raw Material */}
          {canSeeNavModule('raw') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'raw' ? 'active-module' : ''}`} onClick={() => handleModuleClick('raw')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                  <span>Raw Material</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'raw' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'raw' && <div className="module-content">{renderRawMaterialContent()}</div>}
            </>
          )}

          {/* Finished Goods */}
          {canSeeNavModule('finished') && (
            <>
            <li>
              <div className={`nav-link module-item ${activeModule === 'finished' ? 'active-module' : ''}`} onClick={() => handleModuleClick('finished')}>
                <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
                <span>Finished Goods</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'finished' ? 'rotated' : ''}`} />}
              </div>
            </li>
            {!isCollapsed && activeModule === 'finished' && <div className="module-content">{renderFinishedGoodsContent()}</div>}
            </>
          )}

          {/* Expenses */}
          {canSeeNavModule('expenses') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'expenses' ? 'active-module' : ''}`} onClick={() => handleModuleClick('expenses')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faDollarSign} /></span>
                  <span>Expenses</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'expenses' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'expenses' && <div className="module-content">{renderExpensesContent()}</div>}
            </>
          )}

          {/* Finance */}
          {canSeeNavModule('finance') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'finance' ? 'active-module' : ''}`} onClick={() => handleModuleClick('finance')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faWallet} /></span>
                  <span>Finance</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'finance' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'finance' && <div className="module-content">{renderFinanceContent()}</div>}
            </>
          )}

          {/* Cutlery */}
          {canSeeNavModule('cutlery') && (
            <>
            <li>
              <div className={`nav-link module-item ${activeModule === 'cutlery' ? 'active-module' : ''}`} onClick={() => handleModuleClick('cutlery')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCutlery} /></span>
                <span>Cutlery</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'cutlery' ? 'rotated' : ''}`} />}
              </div>
            </li>
            {!isCollapsed && activeModule === 'cutlery' && <div className="module-content">{renderCutleryContent()}</div>}
            </>
          )}

          {/* FG Production */}
          {canSeeNavModule('fg-production') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'fg-production' ? 'active-module' : ''}`} onClick={() => handleModuleClick('fg-production')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
                  <span>FG Production</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'fg-production' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'fg-production' && <div className="module-content">{renderFGProductionContent()}</div>}
            </>
          )}

          {/* Adjustments */}
          {canSeeNavModule('adjustments') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'adjustments' ? 'active-module' : ''}`} onClick={() => handleModuleClick('adjustments')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faAdjust} /></span>
                  <span>Adjustments</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'adjustments' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'adjustments' && <div className="module-content">{renderAdjustmentsContent()}</div>}
            </>
          )}

          {/* VAT */}
          {canSeeNavModule('vat') && (
            <>
            <li>
              <div className={`nav-link module-item ${activeModule === 'vat' ? 'active-module' : ''}`} onClick={() => handleModuleClick('vat')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
                <span>VAT</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'vat' ? 'rotated' : ''}`} />}
              </div>
            </li>
            {!isCollapsed && activeModule === 'vat' && <div className="module-content">{renderVATContent()}</div>}
            </>
          )}

          {/* Analyst */}
          {canSeeNavModule('analyst') && (
            <>
              <li>
                <div className={`nav-link module-item ${activeModule === 'analyst' ? 'active-module' : ''}`} onClick={() => handleModuleClick('analyst')}>
                  <span className="icon-container"><FontAwesomeIcon icon={faMagnifyingGlassChart} /></span>
                  <span>Analyst</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'analyst' ? 'rotated' : ''}`} />}
                </div>
              </li>
              {!isCollapsed && activeModule === 'analyst' && <div className="module-content">{renderAnalystContent()}</div>}
            </>
          )}

          <div className="section-separator"></div>

          {/* Settings / Admin */}
          {canSeeNavModule('admin') && (
            <>
            <li>
              <div className={`nav-link module-item ${activeModule === 'admin' ? 'active-module' : ''}`} onClick={() => handleModuleClick('admin')}>
                <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
                <span>Settings / Admin</span>
                {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'admin' ? 'rotated' : ''}`} />}
              </div>
            </li>
            {!isCollapsed && activeModule === 'admin' && <div className="module-content">{renderAdminContent()}</div>}
            </>
          )}
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