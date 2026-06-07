import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useCartStore from '../store/cartStore';
import api from '../lib/api';

const Navbar = () => {
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [farmOpen, setFarmOpen] = useState(false);
  const [communicationsOpen, setCommunicationsOpen] = useState(false);
  const cartCount = useCartStore((state) => state.totalItems());

  const isAdmin = user?.role === 'admin';
  const canView = (key) => {
    if (isAdmin) return true;
    if (user?.permissions?.[key]?.view) return true;
    const farmFallback = {
      farmDashboard: 'farmLogs',
      farmTreeLogs: 'farmLogs',
      farmMaintenanceTasks: 'farmLogs',
      farmBlockDetails: 'farmBlocks',
      farmBlockLogs: 'farmBlocks',
    };
    const fallbackKey = farmFallback[key];
    return fallbackKey ? !!user?.permissions?.[fallbackKey]?.view : false;
  };
  const adminLinks = [
    { to: '/productspage', label: 'Products', key: 'productsPage' },
    { to: '/shipping-rates', label: 'Shipping Rates', key: 'shippingRates' },
    { to: '/manage-cities', label: 'Manage Cities', key: 'manageCities' },
    { to: '/admin-sites', label: 'Sites', key: 'adminSites' },
    { to: '/warehouse-management', label: 'Warehouse Management', key: 'warehouseManagement' },
    { to: '/wholeseller-management', label: 'Wholeseller Management', key: 'wholesellerManagement' },
    { to: '/manage-expense', label: 'Manage Expense', key: 'manageExpense' },
    { to: '/email-alerts', label: 'Email Alerts', key: 'emailAlerts' },
    { to: '/payment-manager', label: 'Payment Manager', key: 'paymentManager' },
    { to: '/courier-management', label: 'Courier Management', key: 'courierManagement' },
    { to: '/feedback-report', label: 'Feedback Report', key: 'feedbackReport' },
    { to: '/admin-users', label: 'User Management', key: 'userManagement' },
  ];
  const visibleAdminLinks = adminLinks.filter((link) => canView(link.key));
  const salesLinks = [
    { to: '/sales-dashboard', label: 'Sales Dashboard', key: 'salesDashboard' },
    { to: '/manage-stocks', label: 'Manage Stocks', key: 'manageStocks' },
    { to: '/stock-transfer', label: 'Stock Transfer & Receiving', key: 'stockTransfer' },
    { to: '/sale-point', label: 'Sale Point', key: 'salePoint' },
    { to: '/stock-wasted', label: 'Stock Wasted', key: 'stockWasted' },
    { to: '/add-expenses', label: 'Add Expenses', key: 'addExpense' },
    { to: '/order-management', label: 'Order Management', key: 'orderManagement' },
    { to: '/customer-directory', label: 'Customer Directory', key: 'customerDirectory' },
  ];
  const visibleSalesLinks = salesLinks.filter((link) => canView(link.key));
  const showSalesMenu = visibleSalesLinks.length > 0;
  const farmLinks = [
    { to: '/farm-dashboard', label: 'Dashboard', key: 'farmDashboard' },
    { to: '/farm-blocks', label: 'Manage Land Blocks', key: 'farmBlocks' },
    { to: '/farm-block-details', label: 'Block Details', key: 'farmBlockDetails' },
    { to: '/farm-block-logs', label: 'Block Logs', key: 'farmBlockLogs' },
    { to: '/farm-varieties', label: 'Mango Varieties', key: 'farmVarieties' },
    { to: '/farm-trees', label: 'Manage Trees', key: 'farmTrees' },
    { to: '/farm-maintenance-tasks', label: 'Maintenance Tasks', key: 'farmMaintenanceTasks' },
    { to: '/farm-logs', label: 'Tree Logs', key: 'farmTreeLogs' },
  ];
  const visibleFarmLinks = farmLinks.filter((link) => canView(link.key));
  const showFarmMenu = visibleFarmLinks.length > 0;
  const communicationsLinks = [
    { to: '/communications/test-whatsapp', label: 'Test WhatsApp', key: 'communications' },
    { to: '/communications/whatsapp-logs', label: 'WhatsApp Logs', key: 'communications' },
  ];
  const visibleCommunicationsLinks = communicationsLinks.filter((link) => canView(link.key));
  const showCommunicationsMenu = visibleCommunicationsLinks.length > 0;

  const handleLogout = async () => {
    try {
      await api.post('/logout', {});
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      clearUser();
      navigate('/');
      setMenuOpen(false);
      setAdminOpen(false);
      setSalesOpen(false);
      setFarmOpen(false);
      setCommunicationsOpen(false);
    }
  };

  const handleNavClick = (sectionId) => {
    if (location.pathname === '/') {
      const section = document.getElementById(sectionId);
      if (section) section.scrollIntoView({ behavior: 'smooth' });
      setMenuOpen(false);
      setAdminOpen(false);
      setSalesOpen(false);
      setFarmOpen(false);
      setCommunicationsOpen(false);
    } else {
      navigate('/', { state: { scrollTo: sectionId } });
      setMenuOpen(false);
      setAdminOpen(false);
      setSalesOpen(false);
      setFarmOpen(false);
      setCommunicationsOpen(false);
    }
  };

  const LinkIcon = () => (
    <span className="inline-flex items-center text-green-700 mr-2" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M10.788 3.212a.75.75 0 0 1 0 1.06L5.56 9.5h9.69a.75.75 0 0 1 0 1.5H5.56l5.228 5.228a.75.75 0 1 1-1.06 1.06l-6.5-6.5a.75.75 0 0 1 0-1.06l6.5-6.5a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
      </svg>
    </span>
  );

  return (
    <nav className="bg-white shadow">
      <div className="w-full pl-0 pr-4 py-3 md:py-4 flex flex-wrap justify-between items-center">
        <Link to="/" className="flex items-center ml-2 md:ml-3" onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }}>
          <img src="/images/JM_Mangoes_Logo.png?v=20260523" alt="JM Mangoes Logo" className="h-20 md:h-36 w-auto object-contain cursor-pointer" />
        </Link>

        <div className="md:hidden flex items-center gap-2">
          <Link
            to="/checkout"
            onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }}
            className="relative inline-flex items-center gap-2 text-green-700 font-bold px-3 py-2 border border-green-700 rounded"
            aria-label="Open cart and checkout"
          >
            <span className="text-sm leading-none">Cart</span>
            <span
              className="min-w-[1.25rem] h-5 px-1 rounded-full bg-green-700 text-white text-xs inline-flex items-center justify-center"
              aria-label={`${cartCount} items in cart`}
            >
              {cartCount}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setAdminOpen(false);
              setSalesOpen(false);
              setFarmOpen(false);
              setCommunicationsOpen(false);
            }}
            className="inline-flex items-center gap-2 text-green-700 font-bold px-3 py-2 border border-green-700 rounded"
            aria-label="Toggle menu"
          >
            <span className="inline-flex items-center" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm.75 4.5a.75.75 0 0 0 0 1.5h16.5a.75.75 0 0 0 0-1.5H3.75Z" />
              </svg>
            </span>
            <span>{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        <div className={`${menuOpen ? 'flex' : 'hidden'} md:flex w-full md:w-auto flex-col md:flex-row md:items-center gap-3 md:gap-6 mt-3 md:mt-0`}>
          <ul className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <li><a href="#features" onClick={() => handleNavClick('features')} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Features</a></li>
            <li><a href="#pricing" onClick={() => handleNavClick('pricing')} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Pricing</a></li>
            <li><Link to="/contact" onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Contact</Link></li>
            <li><Link to="/checkout" onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Checkout</Link></li>

            {visibleAdminLinks.length > 0 && (
              <li className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setAdminOpen((prev) => !prev);
                    setSalesOpen(false);
                    setFarmOpen(false);
                    setCommunicationsOpen(false);
                  }}
                  className="text-gray-700 hover:text-green-600 cursor-pointer inline-flex items-center gap-1"
                >
                  Admin
                  <span className="inline-flex items-center" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </span>
                </button>
                <ul className={`mt-1 md:mt-0 md:absolute md:left-0 ${adminOpen ? 'block' : 'hidden'} bg-white shadow-md z-50 min-w-[220px]`}>
                  {visibleAdminLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <LinkIcon />{link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {showSalesMenu && (
              <li className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setSalesOpen((prev) => !prev);
                    setAdminOpen(false);
                    setFarmOpen(false);
                    setCommunicationsOpen(false);
                  }}
                  className="text-gray-700 hover:text-green-600 cursor-pointer inline-flex items-center gap-1"
                >
                  Sales
                  <span className="inline-flex items-center" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </span>
                </button>
                <ul className={`mt-1 md:mt-0 md:absolute md:left-0 ${salesOpen ? 'block' : 'hidden'} bg-white shadow-md z-50 min-w-[220px]`}>
                  {visibleSalesLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <LinkIcon />{link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {showFarmMenu && (
              <li className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setFarmOpen((prev) => !prev);
                    setAdminOpen(false);
                    setSalesOpen(false);
                    setCommunicationsOpen(false);
                  }}
                  className="text-gray-700 hover:text-green-600 cursor-pointer inline-flex items-center gap-1"
                >
                  Farm
                  <span className="inline-flex items-center" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </span>
                </button>
                <ul className={`mt-1 md:mt-0 md:absolute md:left-0 ${farmOpen ? 'block' : 'hidden'} bg-white shadow-md z-50 min-w-[220px]`}>
                  {visibleFarmLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <LinkIcon />{link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {showCommunicationsMenu && (
              <li className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    setCommunicationsOpen((prev) => !prev);
                    setAdminOpen(false);
                    setSalesOpen(false);
                    setFarmOpen(false);
                  }}
                  className="text-gray-700 hover:text-green-600 cursor-pointer inline-flex items-center gap-1"
                >
                  Communications
                  <span className="inline-flex items-center" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </span>
                </button>
                <ul className={`mt-1 md:mt-0 md:absolute md:left-0 ${communicationsOpen ? 'block' : 'hidden'} bg-white shadow-md z-50 min-w-[220px]`}>
                  {visibleCommunicationsLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <LinkIcon />{link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {user ? (
              <li><a onClick={handleLogout} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Logout</a></li>
            ) : (
              <li><Link to="/login" onClick={() => { setMenuOpen(false); setAdminOpen(false); setSalesOpen(false); setFarmOpen(false); setCommunicationsOpen(false); }} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Login</Link></li>
            )}
          </ul>

          <div className="text-green-600 font-bold hover:text-yellow-400 md:ml-2">
            {user ? <span>{user.name}</span> : null}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
