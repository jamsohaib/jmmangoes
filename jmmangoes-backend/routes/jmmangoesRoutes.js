const express = require("express");
const jmm_controller = require("../controller/jmmController.js");

const authMiddleware = require('../middleware/auth.js');

const { authenticateUser, authorizeAdmin, authorizePage } = require('../middleware/authMiddleware.js');


const jmm_route = express.Router();
var cookieParser = require('cookie-parser')



jmm_route.use(cookieParser());

//const ejs = require('ejs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

jmm_route.use(bodyParser.urlencoded({ extended: true }));

const uploadDir = path.join(process.cwd(), 'public', 'images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});


// app.get('/api/admin/products', authMiddleware, (req, res) => {
//   // Handle request
//    res.status(200).json({ message: ' token validated' });
// });


// // Create a new product
// app.post('/api/products', authMiddleware, async (req, res) => {
//   // Handle product creation
// });

// // Update a product
// app.put('/api/products/:id', authMiddleware, async (req, res) => {
//   // Handle product update
// });

// // Delete a product
// app.delete('/api/products/:id', authMiddleware, async (req, res) => {
//   // Handle product deletion
// });

// // Add item to cart
// app.post('/api/cart', authMiddleware, async (req, res) => {
//   // Handle adding item to cart
// });

// // Get user's cart
// app.get('/api/cart', authMiddleware, async (req, res) => {
//   // Retrieve cart items
// });

// // Update cart item quantity
// app.put('/api/cart/:itemId', authMiddleware, async (req, res) => {
//   // Update item quantity
// });

// // Remove item from cart
// app.delete('/api/cart/:itemId', authMiddleware, async (req, res) => {
//   // Remove item from cart
// });




jmm_route.get('/checkout', jmm_controller.handleCheckout);
jmm_route.post('/register',jmm_controller.handleRegister );

jmm_route.post('/login',jmm_controller.handleLogin );
jmm_route.post('/logout',jmm_controller.handleLogout );


jmm_route.post('/addProducts', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleAddProducts);
jmm_route.post('/addproducts', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleAddProducts);
jmm_route.post('/upload-product-image', authenticateUser, authorizePage('productsPage', 'manage'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });
  return res.status(201).json({
    success: true,
    imageUrl: `/images/${req.file.filename}`,
    filename: req.file.filename,
  });
});
jmm_route.post('/upload-payment-image', authenticateUser, authorizePage('paymentManager', 'manage'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });
  return res.status(201).json({
    success: true,
    imageUrl: `/images/${req.file.filename}`,
    filename: req.file.filename,
  });
});
jmm_route.post('/upload-payment-receipt', upload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No receipt file uploaded' });
  return res.status(201).json({
    success: true,
    receiptUrl: `/images/${req.file.filename}`,
    filename: req.file.filename,
  });
});
jmm_route.get('/getProducts', authenticateUser, authorizePage('productsPage', 'view'), jmm_controller.handleGetProducts);
jmm_route.get('/products/sites', authenticateUser, authorizePage('productsPage', 'view'), jmm_controller.handleGetProductSites);
jmm_route.put('/products/:id', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleUpdateProduct);
jmm_route.delete('/products/:id', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleDeleteProduct);
jmm_route.put('/products/:id/toggle-active', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleToggleProductActive);
jmm_route.put('/products/:id/toggle-availability', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleToggleProductAvailability);
jmm_route.post('/products/:id/location-price', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleUpsertLocationPrice);
jmm_route.post('/products/:id/remove-location-price', authenticateUser, authorizePage('productsPage', 'manage'), jmm_controller.handleRemoveLocationPrice);

jmm_route.put('/UpdateProductQuantity/:id', authenticateUser, authorizeAdmin, jmm_controller.handleUpdateProductQuantity);

// Example using Express.js
jmm_route.put('/UpdateProductPrice/:id', authenticateUser, authorizeAdmin, jmm_controller.handleUpdateProductPrice); 

jmm_route.get('/getProductsForPublic', jmm_controller.handleGetProductsForPublic);
jmm_route.get('/sites/public', jmm_controller.handleGetPublicSites);
jmm_route.get('/sites', authenticateUser, authorizePage('adminSites', 'view'), jmm_controller.handleGetSites);
jmm_route.post('/sites', authenticateUser, authorizePage('adminSites', 'manage'), jmm_controller.handleCreateSite);
jmm_route.put('/sites/:id', authenticateUser, authorizePage('adminSites', 'manage'), jmm_controller.handleUpdateSite);
jmm_route.delete('/sites/:id', authenticateUser, authorizePage('adminSites', 'manage'), jmm_controller.handleDeleteSite);
jmm_route.get('/stocks/summary', authenticateUser, authorizePage('manageStocks', 'view'), jmm_controller.handleStockSummary);
jmm_route.get('/stocks/products', authenticateUser, authorizePage('manageStocks', 'view'), jmm_controller.handleGetStockProducts);
jmm_route.get('/stocks/adjustments', authenticateUser, authorizePage('manageStocks', 'view'), jmm_controller.handleStockAdjustments);
jmm_route.post('/stocks/adjust', authenticateUser, authorizePage('manageStocks', 'manage'), jmm_controller.handleAdjustStock);
jmm_route.get('/sales/sites', authenticateUser, authorizePage('salePoint', 'view'), jmm_controller.handleGetAssignedSites);
jmm_route.get('/sales/site-stock', authenticateUser, authorizePage('salePoint', 'view'), jmm_controller.handleGetSiteStock);
jmm_route.post('/sales/entries', authenticateUser, authorizePage('salePoint', 'manage'), jmm_controller.handleCreateSalePointEntry);
jmm_route.post('/sales/checkout', authenticateUser, authorizePage('salePoint', 'manage'), jmm_controller.handleCreateSaleCheckout);
jmm_route.post('/sales/return', authenticateUser, authorizePage('salePoint', 'manage'), jmm_controller.handleCreateSaleReturn);
jmm_route.get('/sales/entries', authenticateUser, authorizePage('salePoint', 'view'), jmm_controller.handleGetSalePointEntries);
jmm_route.get('/wastage/sites', authenticateUser, authorizePage('stockWasted', 'view'), jmm_controller.handleGetAssignedSites);
jmm_route.get('/wastage/site-stock', authenticateUser, authorizePage('stockWasted', 'view'), jmm_controller.handleGetSiteStock);
jmm_route.post('/wastage/entries', authenticateUser, authorizePage('stockWasted', 'manage'), jmm_controller.handleCreateStockWastedEntry);
jmm_route.get('/wastage/entries', authenticateUser, authorizePage('stockWasted', 'view'), jmm_controller.handleGetStockWastedEntries);
jmm_route.get('/customers/directory', authenticateUser, authorizePage('customerDirectory', 'view'), jmm_controller.handleCustomerDirectory);
jmm_route.get('/order-alert-emails', authenticateUser, authorizePage('emailAlerts', 'view'), jmm_controller.handleGetOrderAlertEmails);
jmm_route.post('/order-alert-emails', authenticateUser, authorizePage('emailAlerts', 'manage'), jmm_controller.handleAddOrderAlertEmail);
jmm_route.delete('/order-alert-emails/:id', authenticateUser, authorizePage('emailAlerts', 'manage'), jmm_controller.handleDeleteOrderAlertEmail);
jmm_route.get('/couriers', authenticateUser, authorizePage('courierManagement', 'view'), jmm_controller.handleGetCouriers);
jmm_route.post('/couriers', authenticateUser, authorizePage('courierManagement', 'manage'), jmm_controller.handleCreateCourier);
jmm_route.put('/couriers/:id', authenticateUser, authorizePage('courierManagement', 'manage'), jmm_controller.handleUpdateCourier);
jmm_route.delete('/couriers/:id', authenticateUser, authorizePage('courierManagement', 'manage'), jmm_controller.handleDeleteCourier);
jmm_route.get('/payment-methods', authenticateUser, authorizePage('paymentManager', 'view'), jmm_controller.handleGetPaymentMethods);
jmm_route.post('/payment-methods', authenticateUser, authorizePage('paymentManager', 'manage'), jmm_controller.handleCreatePaymentMethod);
jmm_route.put('/payment-methods/:id', authenticateUser, authorizePage('paymentManager', 'manage'), jmm_controller.handleUpdatePaymentMethod);
jmm_route.delete('/payment-methods/:id', authenticateUser, authorizePage('paymentManager', 'manage'), jmm_controller.handleDeletePaymentMethod);
jmm_route.get('/payment-methods/public', jmm_controller.handleGetPublicPaymentMethods);
jmm_route.get('/orders', authenticateUser, authorizePage('orderManagement', 'view'), jmm_controller.handleGetOrders);
jmm_route.put('/orders/:id/confirm', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleConfirmOrder);
jmm_route.put('/orders/:id/reject', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleRejectOrder);
jmm_route.put('/orders/:id/modify', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleModifyOrder);
jmm_route.put('/orders/:id/dispatch', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleDispatchOrder);
jmm_route.put('/orders/:id/cancel', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleCancelOrder);
jmm_route.put('/orders/:id/deliver', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleDeliverOrder);
jmm_route.put('/orders/:id/return', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleReturnOrder);
jmm_route.put('/orders/:id/verify-payment', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleVerifyOrderPayment);
jmm_route.put('/orders/:id/feedback-reminder', authenticateUser, authorizePage('orderManagement', 'manage'), jmm_controller.handleSendFeedbackReminder);
jmm_route.get('/orders/feedback-report', authenticateUser, authorizePage('feedbackReport', 'view'), jmm_controller.handleFeedbackReport);
jmm_route.get('/expenses/sites', authenticateUser, authorizePage('addExpense', 'view'), jmm_controller.handleGetAssignedSites);
jmm_route.get('/expense-heads', authenticateUser, authorizePage('manageExpense', 'view'), jmm_controller.handleGetExpenseHeads);
jmm_route.get('/expense-heads/for-entry', authenticateUser, authorizePage('addExpense', 'view'), jmm_controller.handleGetExpenseHeads);
jmm_route.post('/expense-heads', authenticateUser, authorizePage('manageExpense', 'manage'), jmm_controller.handleCreateExpenseHead);
jmm_route.get('/expense-items/manage', authenticateUser, authorizePage('manageExpense', 'view'), jmm_controller.handleGetExpenseItems);
jmm_route.get('/expense-items', authenticateUser, authorizePage('addExpense', 'view'), jmm_controller.handleGetExpenseItems);
jmm_route.post('/expense-items', authenticateUser, authorizePage('manageExpense', 'manage'), jmm_controller.handleCreateExpenseItem);
jmm_route.post('/expense-entries', authenticateUser, authorizePage('addExpense', 'manage'), jmm_controller.handleCreateExpenseEntry);
jmm_route.get('/expense-entries', authenticateUser, authorizePage('addExpense', 'view'), jmm_controller.handleGetExpenseEntries);
jmm_route.put('/expense-entries/:id', authenticateUser, authorizePage('addExpense', 'manage'), jmm_controller.handleUpdateExpenseEntry);
jmm_route.delete('/expense-entries/:id', authenticateUser, authorizePage('addExpense', 'manage'), jmm_controller.handleDeleteExpenseEntry);
jmm_route.get('/users', authenticateUser, authorizePage('userManagement', 'view'), jmm_controller.handleGetUsers);
jmm_route.post('/users', authenticateUser, authorizePage('userManagement', 'manage'), jmm_controller.handleCreateUser);
jmm_route.put('/users/:id', authenticateUser, authorizePage('userManagement', 'manage'), jmm_controller.handleUpdateUser);
jmm_route.delete('/users/:id', authenticateUser, authorizePage('userManagement', 'manage'), jmm_controller.handleDeleteUser);

jmm_route.post('/shippingCosts', authenticateUser, authorizePage('shippingRates', 'manage'), jmm_controller.handleUpdateShippingCosts);

jmm_route.get('/shippingCosts', authenticateUser, authorizePage('shippingRates', 'view'), jmm_controller.handleFetchingShippingCosts);
jmm_route.get('/shippingCosts/public', jmm_controller.handleFetchingShippingCosts);

jmm_route.post('/checkout', jmm_controller.handleCheckout);
jmm_route.get('/orders/feedback/:orderNumber', jmm_controller.handleGetOrderFeedbackMeta);
jmm_route.post('/orders/feedback/:orderNumber', jmm_controller.handleSubmitOrderFeedback);



// jmm_route.get('/getProducts', authenticateUser, authorizeAdmin, jmm_controller.handleGetProducts);


// Get user's cart
jmm_route.get('/carting', async (req, res) => {
  res.status(200).json({ message: 'ok caring' });
});


jmm_route.get('/', async (req, res) => {
  res.status(200).json({ message: 'ok' });
});


module.exports = jmm_route;
