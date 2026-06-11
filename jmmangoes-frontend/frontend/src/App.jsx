import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css';
import Navbar from './components/Navbar';
import React from 'react';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



import ScrollToHash from './components/ScrollToHash';
import Home from './components/Home';
import ProductList from './components/ProductList';
import ProductDetail from './components/ProductDetail';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import OrderHistory from './components/OrderHistory';
import Login from './components/Login';
import Register from './components/Register';
import Footer from './components/Footer';
import NotFound from './components/NotFound'

import ProductsPage from './components/ProductsPage'
import ManageCities from './components/ManageCities';
import ShippingRatesPage from './components/ShippingRatesPage';
import AdminSites from './components/AdminSites';
import ManageStocks from './components/ManageStocks';
import StockMovement from './components/StockMovement';
import AdminUsers from './components/AdminUsers';
import SalePoint from './components/SalePoint';
import GiftingRecords from './components/GiftingRecords';
import PayLaterRecords from './components/PayLaterRecords';
import GiftSources from './components/GiftSources';
import SalesDashboard from './components/SalesDashboard';
import WarehouseManagement from './components/WarehouseManagement';
import WholesellerManagement from './components/WholesellerManagement';
import StockTransfer from './components/StockTransfer';
import StockWasted from './components/StockWasted';
import CustomerDirectory from './components/CustomerDirectory';
import ManageExpense from './components/ManageExpense';
import AddExpenses from './components/AddExpenses';
import CompanyCashDeposits from './components/CompanyCashDeposits';
import SalesCashTransactions from './components/SalesCashTransactions';
import OrderSuccess from './components/OrderSuccess';
import EmailAlertsManagement from './components/EmailAlertsManagement';
import CourierManagement from './components/CourierManagement';
import OrderManagement from './components/OrderManagement';
import OrderFeedback from './components/OrderFeedback';
import FeedbackReport from './components/FeedbackReport';
import PaymentManager from './components/PaymentManager';
import ContactPage from './components/ContactPage';
import FarmBlocks from './components/FarmBlocks';
import FarmVarieties from './components/FarmVarieties';
import FarmTrees from './components/FarmTrees';
import FarmTreeLogs from './components/FarmTreeLogs';
import FarmDashboard from './components/FarmDashboard';
import FarmMaintenanceTasks from './components/FarmMaintenanceTasks';
import FarmBlockDetails from './components/FarmBlockDetails';
import FarmBlockLogs from './components/FarmBlockLogs';
import FarmManageExpenses from './components/FarmManageExpenses';
import FarmAddExpenses from './components/FarmAddExpenses';
import FarmExpenseDashboard from './components/FarmExpenseDashboard';
import FinancialYears from './components/FinancialYears';
import AdminFinancialDashboard from './components/AdminFinancialDashboard';
import FarmHR from './components/FarmHR';
import FarmHRExpenses from './components/FarmHRExpenses';
import ActionLogs from './components/ActionLogs';
import ResetPassword from './components/ResetPassword';
import TestWhatsApp from './components/TestWhatsApp';
import PrivacyPolicy from './components/PrivacyPolicy';
import WhatsAppLogs from './components/WhatsAppLogs';

function App() {
  return (

      <Router>
        <ScrollToHash />
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-200 to-orange-100 ">
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
             {/* <Route path="/products" element={<ProductList />} />  */}
             <Route path="/productsPage" element={<ProductsPage />} />
             <Route path="/manage-cities" element={<ManageCities />} />
             <Route path="/shipping-rates" element={<ShippingRatesPage />} />
             <Route path="/admin-sites" element={<AdminSites />} />
             <Route path="/manage-stocks" element={<ManageStocks />} />
             <Route path="/stock-movement" element={<StockMovement />} />
             <Route path="/sale-point" element={<SalePoint />} />
             <Route path="/gifting-records" element={<GiftingRecords />} />
             <Route path="/pay-later-records" element={<PayLaterRecords />} />
             <Route path="/gift-sources" element={<GiftSources />} />
             <Route path="/sales-dashboard" element={<SalesDashboard />} />
             <Route path="/warehouse-management" element={<WarehouseManagement />} />
             <Route path="/wholeseller-management" element={<WholesellerManagement />} />
             <Route path="/stock-transfer" element={<StockTransfer />} />
             <Route path="/stock-wasted" element={<StockWasted />} />
             <Route path="/customer-directory" element={<CustomerDirectory />} />
             <Route path="/manage-expense" element={<ManageExpense />} />
             <Route path="/add-expenses" element={<AddExpenses />} />
             <Route path="/company-cash-deposits" element={<CompanyCashDeposits />} />
             <Route path="/sales-cash-transactions" element={<SalesCashTransactions />} />
             <Route path="/admin-users" element={<AdminUsers />} />
             <Route path="/products/:id" element={<ProductDetail />} /> 
             <Route path="/cart" element={<Cart />} /> 
             <Route path="/checkout" element={<Checkout />} />
             <Route path="/order-success" element={<OrderSuccess />} />
             <Route path="/orders" element={<OrderHistory />} /> 
             <Route path="/email-alerts" element={<EmailAlertsManagement />} />
             <Route path="/courier-management" element={<CourierManagement />} />
             <Route path="/payment-manager" element={<PaymentManager />} />
             <Route path="/communications/test-whatsapp" element={<TestWhatsApp />} />
             <Route path="/communications/whatsapp-logs" element={<WhatsAppLogs />} />
             <Route path="/order-management" element={<OrderManagement />} />
             <Route path="/feedback-report" element={<FeedbackReport />} />
             <Route path="/feedback/:orderNumber" element={<OrderFeedback />} />
             <Route path="/contact" element={<ContactPage />} />
             <Route path="/privacy-policy" element={<PrivacyPolicy />} />
             <Route path="/farm-blocks" element={<FarmBlocks />} />
             <Route path="/farm-block-details" element={<FarmBlockDetails />} />
             <Route path="/farm-block-logs" element={<FarmBlockLogs />} />
             <Route path="/farm-varieties" element={<FarmVarieties />} />
             <Route path="/farm-trees" element={<FarmTrees />} />
             <Route path="/farm-logs" element={<FarmTreeLogs />} />
             <Route path="/farm-maintenance-tasks" element={<FarmMaintenanceTasks />} />
             <Route path="/farm-dashboard" element={<FarmDashboard />} />
             <Route path="/farm-manage-expenses" element={<FarmManageExpenses />} />
             <Route path="/farm-add-expenses" element={<FarmAddExpenses />} />
             <Route path="/farm-expense-dashboard" element={<FarmExpenseDashboard />} />
             <Route path="/financial-years" element={<FinancialYears />} />
             <Route path="/admin-financial-dashboard" element={<AdminFinancialDashboard />} />
             <Route path="/farm-hr" element={<FarmHR />} />
             <Route path="/farm-hr-expenses" element={<FarmHRExpenses />} />
             <Route path="/action-logs" element={<ActionLogs />} />
             <Route path="/login" element={<Login />} />
             <Route path="/reset-password" element={<ResetPassword />} />
             <Route path="/register" element={<Register />} /> 
             <Route path="*" element={<NotFound />} />
            {/* Add other routes as needed */}
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>

    
  );
}

export default App;
