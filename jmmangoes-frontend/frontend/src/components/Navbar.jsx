import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../lib/api';

const Navbar = () => {
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canView = (key) => isAdmin || !!user?.permissions?.[key]?.view;
  const adminLinks = [
    { to: '/productspage', label: 'Products', key: 'productsPage' },
    { to: '/shipping-rates', label: 'Shipping Rates', key: 'shippingRates' },
    { to: '/manage-cities', label: 'Manage Cities', key: 'manageCities' },
    { to: '/admin-sites', label: 'Sites', key: 'adminSites' },
    { to: '/manage-stocks', label: 'Manage Stocks', key: 'manageStocks' },
    { to: '/sale-point', label: 'Sale Point', key: 'salePoint' },
    { to: '/stock-wasted', label: 'Stock Wasted', key: 'stockWasted' },
    { to: '/customer-directory', label: 'Customer Directory', key: 'customerDirectory' },
    { to: '/manage-expense', label: 'Manage Expense', key: 'manageExpense' },
    { to: '/add-expenses', label: 'Add Expenses', key: 'addExpense' },
    { to: '/email-alerts', label: 'Email Alerts', key: 'emailAlerts' },
    { to: '/courier-management', label: 'Courier Management', key: 'courierManagement' },
    { to: '/order-management', label: 'Order Management', key: 'orderManagement' },
    { to: '/feedback-report', label: 'Feedback Report', key: 'feedbackReport' },
    { to: '/admin-users', label: 'User Management', key: 'userManagement' },
  ];
  const visibleAdminLinks = adminLinks.filter((link) => canView(link.key));

  const handleLogout = async () => {
    try {
      await api.post('/logout', {});
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      clearUser();
      navigate('/');
      setMenuOpen(false);
    }
  };

  const handleNavClick = (sectionId) => {
    if (location.pathname === '/') {
      const section = document.getElementById(sectionId);
      if (section) section.scrollIntoView({ behavior: 'smooth' });
      setMenuOpen(false);
    } else {
      navigate('/', { state: { scrollTo: sectionId } });
      setMenuOpen(false);
    }
  };

  return (
    <nav className="bg-white shadow">
      <div className="w-full pl-0 pr-4 py-3 md:py-4 flex flex-wrap justify-between items-center">
        <Link to="/" className="flex items-center ml-2 md:ml-3" onClick={() => setMenuOpen(false)}>
          <img src="/images/favicons_jm_mangoes-removebg-preview.png" alt="JM Mangoes Logo" className="h-16 md:h-28 w-auto object-contain cursor-pointer" />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="md:hidden flex items-center gap-2 text-green-700 font-bold px-3 py-2 border border-green-700 rounded"
          aria-label="Toggle menu"
        >
          <span className="text-xl leading-none" aria-hidden="true">☰</span>
          <span>{menuOpen ? 'Close' : 'Menu'}</span>
        </button>

        <div className={`${menuOpen ? 'flex' : 'hidden'} md:flex w-full md:w-auto flex-col md:flex-row md:items-center gap-3 md:gap-6 mt-3 md:mt-0`}>
          <ul className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <li><a href="#features" onClick={() => handleNavClick('features')} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Features</a></li>
            <li><a href="#pricing" onClick={() => handleNavClick('pricing')} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Pricing</a></li>
            <li><a href="#contact" onClick={() => handleNavClick('contact')} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Contact</a></li>
            <li><Link to="/checkout" onClick={() => setMenuOpen(false)} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Checkout</Link></li>

            {visibleAdminLinks.length > 0 && (
              <li className="relative group">
                <span className="text-gray-700 hover:text-green-600 cursor-pointer inline-flex items-center gap-1">
                  Admin <span aria-hidden="true">▾</span>
                </span>
                <ul className="mt-1 md:mt-0 md:absolute md:left-0 block md:hidden group-hover:block bg-white shadow-md z-50">
                  {visibleAdminLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {user ? (
              <li><a onClick={handleLogout} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Logout</a></li>
            ) : (
              <li><Link to="/login" onClick={() => setMenuOpen(false)} className="text-green-600 font-bold hover:text-yellow-400 cursor-pointer">Login</Link></li>
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
