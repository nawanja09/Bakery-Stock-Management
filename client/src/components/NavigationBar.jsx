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
  faUsers,
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
  faSackDollar
} from '@fortawesome/free-solid-svg-icons';
import bakeryLogo from '../images/icon.jpeg';
import './NavigationBar.css';

const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeModule, setActiveModule] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sidebarRef = useRef(null);

  // Store Keeper accounts don't get the Adjustments module in the menu.
  const getUserRole = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const role = JSON.parse(storedUser).role;
        return role === 'QB' ? 'View Only' : role;
      } catch (e) { return null; }
    }
    return null;
  };
  const userRole = getUserRole();
  const isStoreKeeper = userRole === 'Store Keeper' || userRole === 'Stores';
  const isViewOnly = userRole === 'View Only';
  const canAccessFinance = userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'Accountant' || isViewOnly;
  const canAccessAnalyst = userRole === 'Super Admin';
  const canAccessRawMaterial = ['Admin', 'Super Admin', 'Store Keeper', 'Stores', 'View Only'].includes(userRole);
  const canAccessFgProduction = ['Admin', 'Super Admin', 'Accountant', 'Store Keeper', 'Stores', 'View Only'].includes(userRole);

  // Determine active module based on current path
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) {
      setActiveModule(null);
    } else if (path.startsWith('/items') || path.startsWith('/item-types') ||
               path.startsWith('/suppliers') || path.startsWith('/departments') ||
               path.startsWith('/companies') || path.startsWith('/adjustments/payment-methods') ||
               path.startsWith('/expenses/bank-details') ||
               path.startsWith('/expense-types-management') ||
               path.startsWith('/expense-payees-management') ||
               path.startsWith('/bank-charges-type-management') ||
               path.startsWith('/finance/receive-types')) {
      setActiveModule('management');
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

  const toggleDropdown = (name) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const handleModuleClick = (moduleName) => {
    setActiveModule(moduleName);
    setActiveDropdown(null);
    
    // Navigate to the module's main page
    switch(moduleName) {
      case 'management':
        navigate('/items');
        break;
      case 'raw':
        navigate('/purchase/new');
        break;
      case 'finished':
        navigate('/finished-goods/items');
        break;
      case 'expenses':
        navigate('/expenses/petty-cash');
        break;
      case 'finance':
        navigate('/finance/cash');
        break;
      case 'cutlery':
        navigate('/cutlery/locations');
        break;
      case 'fg-production':
        navigate('/fg-production/recipes');
        break;
      case 'adjustments':
        navigate('/adjustments/stores-balance');
        break;
      case 'analyst':
        navigate('/analyst/income');
        break;
      case 'vat':
        navigate('/reports/vat');
        break;
      default:
        break;
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 640) {
      setIsMobileOpen((isOpen) => !isOpen);
      return;
    }

    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setActiveDropdown(null);
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

  // Render module content based on active module
  const renderModuleContent = () => {
    if (!activeModule || isCollapsed) return null;

    switch(activeModule) {
      case 'raw':
        return renderRawMaterialContent();
      case 'management':
        return renderManagementContent();
      case 'finished':
        return renderFinishedGoodsContent();
      case 'expenses':
        return renderExpensesContent();
      case 'cutlery':
        return renderCutleryContent();
      case 'finance':
        return renderFinanceContent();
      case 'fg-production':
        return renderFGProductionContent();
      case 'adjustments':
        return renderAdjustmentsContent();
      case 'vat':
        return renderVATContent();
      case 'analyst':
        return renderAnalystContent();
      default:
        return null;
    }
  };

  const renderManagementContent = () => (
    <>
      <li>
        <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
          <span>RM Item</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/item-types" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
          <span>RM Item Types</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faTruck} /></span>
          <span>Suppliers</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/departments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span>
          <span>Departments</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faBuilding} /></span>
          <span>Companies</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/adjustments/payment-methods" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCreditCard} /></span>
          <span>Payment Methods</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expenses/bank-details" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faBuildingColumns} /></span>
          <span>Bank Details</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expense-types-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faFileInvoiceDollar} /></span>
          <span>Expenses Type Management</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expense-payees-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faIdCard} /></span>
          <span>Expenses Payee Management</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/bank-charges-type-management" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span>
          <span>Bank Charges Type Management</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/receive-types" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span>
          <span>Receive Types</span>
        </NavLink>
      </li>
    </>
  );

  const renderRawMaterialContent = () => (
    <>
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

      <li>
        <NavLink to="/purchase/orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
          <span>Orders</span>
        </NavLink>
      </li>

      <li>
        <NavLink to="/issuance/issue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faTruckLoading} /></span>
          <span>RM Issue</span>
        </NavLink>
      </li>

      <li>
        <NavLink to="/wastage/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faTrashAlt} /></span>
          <span>RM Wastage</span>
        </NavLink>
      </li>

      <li>
        <NavLink to="/returns/add" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span>
          <span>Department Return</span>
        </NavLink>
      </li>




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
          <li><NavLink to="/reports/purchase-report" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faFileInvoice} /></span><span>Purchase Report</span></NavLink></li>
          <li><NavLink to="/issuance/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Issue Summary</span></NavLink></li>
          <li><NavLink to="/reports/department" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>RM Issue Item Detail</span></NavLink></li>
          <li><NavLink to="/wastage/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faHistory} /></span><span>RM Wastage Summary</span></NavLink></li>
          <li><NavLink to="/reports/wastage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faTrash} /></span><span>RM Wastage Item Detail</span></NavLink></li>
          <li><NavLink to="/returns/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faUndo} /></span><span>Department Return Summary</span></NavLink></li>
          <li><NavLink to="/reports/department-return-item-wise" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faShareSquare} /></span><span>Department Return Item Detail</span></NavLink></li>
        </ul>
      </li>

      <li className={`dropdown ${activeDropdown === 'analysis' ? 'active' : ''}`}>
        <div className="dropdown-header" onClick={() => toggleDropdown('analysis')}>
          <span className="icon-container"><FontAwesomeIcon icon={faMagnifyingGlassChart} /></span>
          <span>Analysis</span>
          <FontAwesomeIcon icon={faChevronDown} className="chevron" />
        </div>
        <ul className="dropdown-menu"> 
          <li>
            <NavLink to="/analysis/last-issued-date" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container"><FontAwesomeIcon icon={faClock} /></span>
              <span>Last Issued Date</span>
            </NavLink>
          </li>
        </ul>
      </li>
    </>
  );

  const renderFinishedGoodsContent = () => (
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
  );

  const renderExpensesContent = () => (
    <>
      <li>
        <NavLink to="/expenses/petty-cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span>
          <span>Petty Cash</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expenses/bank-charges" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span>
          <span>Bank Charges</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expenses/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faMoneyCheck} /></span>
          <span>New Expenses</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/expenses/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
          <span>Expenses Reports</span>
        </NavLink>
      </li>
    </>
  );

  const renderFinanceContent = () => (
    <>
      <li>
        <NavLink to="/finance/cash" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCashRegister} /></span>
          <span>Cash Ledger</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/cash-receive" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faHandHoldingDollar} /></span>
          <span>Cash Receive</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/bank" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faUniversity} /></span>
          <span>Bank Ledger</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/bank-receive" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faLandmark} /></span>
          <span>Bank Receive</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faRightLeft} /></span>
          <span>Cash / Bank Transfer</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/finance/bank-transfer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faRightLeft} /></span>
          <span>Bank to Bank Transfer</span>
        </NavLink>
      </li>
    </>
  );

  const renderCutleryContent = () => (
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
  );

  const renderFGProductionContent = () => (
    <>
          <li>
            <NavLink to="/fg-production/recipes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
              <span>Recipes</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/fg-production/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="icon-container"><FontAwesomeIcon icon={faChartBar} /></span>
              <span>FG Recipes Reports</span>
            </NavLink>
          </li>
    </>
  );

  const renderAdjustmentsContent = () => (
    <>
      <li>
        <NavLink to="/adjustments/stores-balance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faWarehouse} /></span>
          <span>RM Adjustments</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/adjustments/stores-adjustments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faTools} /></span>
          <span>Stores Adjustment Summary</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/adjustments/inhand" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faHandHoldingDollar} /></span>
          <span>Inhand (Cash / Cheque)</span>
        </NavLink>
      </li>
    </>
  );

  const renderVATContent = () => (
    <>
      <li>
        <NavLink to="/reports/vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
          <span>VAT Purchasing Report</span>
        </NavLink>
      </li>
      <li>
        <NavLink to="/reports/purchase-vat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
          <span>VAT Purchasing Return Report</span>
        </NavLink>
      </li>
    </>
  );

  const renderAnalystContent = () => (
    <>
      <li><NavLink to="/analyst/income" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faSackDollar} /></span><span>Income</span></NavLink></li>
      <li><NavLink to="/analyst/expenses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faDollarSign} /></span><span>Expenses</span></NavLink></li>
      <li><NavLink to="/analyst/balance-sheet" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><span className="icon-container"><FontAwesomeIcon icon={faBalanceScale} /></span><span>Balance Sheet</span></NavLink></li>
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

          {/* Management Module */}
          {canAccessRawMaterial && <li>
            <div 
              className={`nav-link module-item ${activeModule === 'management' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('management')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faCog} /></span>
              <span>Management</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'management' ? 'rotated' : ''}`} />}
            </div>
          </li>}

          {canAccessRawMaterial && !isCollapsed && activeModule === 'management' && (
            <div className="module-content">
              {renderManagementContent()}
            </div>
          )}

          {/* Raw Material Module */}
          {canAccessRawMaterial && <li>
            <div
              className={`nav-link module-item ${activeModule === 'raw' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('raw')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
              <span>Raw Material</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'raw' ? 'rotated' : ''}`} />}
            </div>
          </li>}

          {/* Module content - shown only when module is active */}
          {canAccessRawMaterial && !isCollapsed && activeModule === 'raw' && (
            <div className="module-content">
              {renderRawMaterialContent()}
            </div>
          )}

          {/* Finished Goods Module */}
          <li>
            <div 
              className={`nav-link module-item ${activeModule === 'finished' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('finished')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faBox} /></span>
              <span>Finished Goods</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'finished' ? 'rotated' : ''}`} />}
            </div>
          </li>

          {!isCollapsed && activeModule === 'finished' && (
            <div className="module-content">
              {renderFinishedGoodsContent()}
            </div>
          )}

          {/* Expenses Module */}
          {!isStoreKeeper && (
            <>
              <li>
                <div 
                  className={`nav-link module-item ${activeModule === 'expenses' ? 'active-module' : ''}`}
                  onClick={() => handleModuleClick('expenses')}
                >
                  <span className="icon-container"><FontAwesomeIcon icon={faDollarSign} /></span>
                  <span>Expenses</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'expenses' ? 'rotated' : ''}`} />}
                </div>
              </li>

              {!isCollapsed && activeModule === 'expenses' && (
                <div className="module-content">
                  {renderExpensesContent()}
                </div>
              )}
            </>
          )}

          {/* Finance Module */}
          {canAccessFinance && (
            <>
              <li>
                <div 
                  className={`nav-link module-item ${activeModule === 'finance' ? 'active-module' : ''}`}
                  onClick={() => handleModuleClick('finance')}
                >
                  <span className="icon-container"><FontAwesomeIcon icon={faWallet} /></span>
                  <span>Finance</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'finance' ? 'rotated' : ''}`} />}
                </div>
              </li>

              {!isCollapsed && activeModule === 'finance' && (
                <div className="module-content">
                  {renderFinanceContent()}
                </div>
              )}
            </>
          )}

          {/* Cutlery Module */}
          <li>
            <div 
              className={`nav-link module-item ${activeModule === 'cutlery' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('cutlery')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faCutlery} /></span>
              <span>Cutlery</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'cutlery' ? 'rotated' : ''}`} />}
            </div>
          </li>

          {!isCollapsed && activeModule === 'cutlery' && (
            <div className="module-content">
              {renderCutleryContent()}
            </div>
          )}

          {/*FG Production Module */}
          {canAccessFgProduction && <li>
            <div 
              className={`nav-link module-item ${activeModule === 'fg-production' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('fg-production')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faClipboardList} /></span>
              <span>FG Production</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'fg-production' ? 'rotated' : ''}`} />}
            </div>
          </li>}

          {canAccessFgProduction && !isCollapsed && activeModule === 'fg-production' && (
            <div className="module-content">
              {renderFGProductionContent()}
            </div>
          )}

          {/* Adjustments Module */}
          {(userRole === 'Admin' || userRole === 'Super Admin') && (
            <>
              <li>
                <div 
                  className={`nav-link module-item ${activeModule === 'adjustments' ? 'active-module' : ''}`}
                  onClick={() => handleModuleClick('adjustments')}
                >
                  <span className="icon-container"><FontAwesomeIcon icon={faAdjust} /></span>
                  <span>Adjustments</span>
                  {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'adjustments' ? 'rotated' : ''}`} />}
                </div>
              </li>

              {!isCollapsed && activeModule === 'adjustments' && (
                <div className="module-content">
                  {renderAdjustmentsContent()}
                </div>
              )}
            </>
          )}

          {/* VAT Module */}
          <li>
            <div 
              className={`nav-link module-item ${activeModule === 'vat' ? 'active-module' : ''}`}
              onClick={() => handleModuleClick('vat')}
            >
              <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
              <span>VAT</span>
              {!isCollapsed && <FontAwesomeIcon icon={faChevronDown} className={`chevron ${activeModule === 'vat' ? 'rotated' : ''}`} />}
            </div>
          </li>

          {!isCollapsed && activeModule === 'vat' && (
            <div className="module-content">
              {renderVATContent()}
            </div>
          )}

          {/* Analyst Module */}
          {canAccessAnalyst && (
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