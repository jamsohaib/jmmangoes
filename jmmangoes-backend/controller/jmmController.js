const { request } = require('https');
const LocalStorage = require('node-localstorage').LocalStorage;
localStorage = new LocalStorage('./scratch');
const jwt = require('jsonwebtoken');




const cartItemDetails = require('../model/cartItemSchema');
const orderDetails = require('../model/OrderSchema');
const Product  = require('../model/ProductSchema');
const userDetails = require('../model/UserSchema');
const ShippingSettings = require('../model/shippingCostSchema');
const Order = require('../model/OrderSchema');
const Site = require('../model/SiteSchema');
const SalePointEntry = require('../model/SalePointEntrySchema');
const StockWastedEntry = require('../model/StockWastedEntrySchema');
const StockAdjustment = require('../model/StockAdjustmentSchema');
const ExpenseHead = require('../model/ExpenseHeadSchema');
const ExpenseItem = require('../model/ExpenseItemSchema');
const ExpenseEntry = require('../model/ExpenseEntrySchema');
const OrderAlertEmail = require('../model/OrderAlertEmailSchema');
const Courier = require('../model/CourierSchema');
const PaymentMethod = require('../model/PaymentMethodSchema');
const { sendMail } = require('../services/mailer');
const logger = require('../utils/logger');


async function ensureOnlineSite() {
  let onlineSite = await Site.findOne({ name: { $regex: /^online$/i } });
  if (!onlineSite) {
    onlineSite = await Site.create({
      name: 'online',
      contactNumber: 'N/A',
      contactPersonName: '',
      address: 'Website',
      city: 'Online',
      isActive: true,
    });
  }
  return onlineSite;
}

async function ensureDefaultExpenseSetup() {
  let othersHead = await ExpenseHead.findOne({ name: { $regex: /^others$/i } });
  if (!othersHead) {
    othersHead = await ExpenseHead.create({ name: 'Others', colorCode: '#6B7280', isActive: true });
  }
  let othersItem = await ExpenseItem.findOne({ headId: othersHead._id, name: { $regex: /^others$/i } });
  if (!othersItem) {
    await ExpenseItem.create({ headId: othersHead._id, name: 'Others', isActive: true });
  }
  return othersHead;
}

function normalizePaymentCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getNextOrderNumber() {
  const numericRows = await Order.find({ orderNumber: { $regex: '^[0-9]{6}$' } })
    .sort({ orderNumber: -1 })
    .limit(1)
    .select('orderNumber');
  const latest = Number(numericRows?.[0]?.orderNumber || 100000);
  const next = Number.isFinite(latest) ? latest + 1 : 100001;
  if (next > 999999) return String(Math.floor(100000 + Math.random() * 900000));
  return String(next).padStart(6, '0');
}

async function sendOrderAlertEmails(subject, text, customerEmail, html = '') {
  const recipients = await OrderAlertEmail.find({ isActive: true }).select('email');
  const emails = recipients.map((r) => r.email).filter(Boolean);
  const unique = Array.from(new Set([...(customerEmail ? [customerEmail] : []), ...emails]));
  if (!unique.length) return;
  await sendMail({ to: unique.join(','), subject, text, html });
}




async function handleRegister(req,res){ 
    logger.debug("In handleRegistration");
   const { name, email, username, contactNumber, password } = req.body;
  try {
    let user = await userDetails.findOne({ username });
    if (user) return res.status(400).json({ message: 'User already exists' });
    if (email) {
      const emailUser = await userDetails.findOne({ email });
      if (emailUser) return res.status(400).json({ message: 'Email already exists' });
    }

    user = new userDetails({ name, email, username, contactNumber: contactNumber || 'N/A', password });
    await user.save();

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}


async function handleLogin(req, res) {
  logger.debug("In handleLogin");
  const { username, password } = req.body;
  try {
    const superAdminUsername = process.env.SUPERADMIN_USERNAME || 'admin';
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD || '123456';

    if (username === superAdminUsername && password === superAdminPassword) {
      const token = jwt.sign(
        {
          id: 'super-admin',
          role: 'admin',
          name: 'Super Admin',
          username: superAdminUsername,
          permissions: {},
          siteAccess: [],
          isSuperAdmin: true,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: 'Logged in successfully',
        url: req.url,
        user: {
          id: 'super-admin',
          username: superAdminUsername,
          role: 'admin',
          name: 'Super Admin',
          permissions: {},
          siteAccess: [],
          isSuperAdmin: true,
        },
      });
    }

    // Find user
    const user = await userDetails.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (user.isActive === false) return res.status(403).json({ message: 'User account is disabled' });

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Generate JWT with role included
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name,
        username: user.username,
        permissions: user.permissions || {},
        siteAccess: (user.siteAccess || []).map((s) => String(s)),
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    logger.debug('Token generated for login');

    // Send JWT in HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.json({
      success: true,
      message: 'Logged in successfully',
      url: req.url,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        name : user.name,
        permissions: user.permissions || {},
        siteAccess: (user.siteAccess || []).map((s) => String(s)),
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function handleLogout(req,res){ 
    logger.debug("In handleLogout");

      const isProduction = process.env.NODE_ENV === 'production';
      res.clearCookie('token', {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
      });
//   res.status(200).json({ message: 'Logged out successfully' });
  

    res.status(200).json({
        success:true,
        message: 'Logged out successfully',
        url:req.url,
        user:null,
     });
}


async function handleAddProducts(req,res){ 
    logger.debug("In handleAddProducts");

    try {
    const { name, description, price, weight, imageUrl, category, locationPrices = [], productChannel = 'website', availableSiteId = null } = req.body;
    const onlineSite = await ensureOnlineSite();
    let availableSiteName = '';
    if (availableSiteId) {
      const site = await Site.findById(availableSiteId);
      availableSiteName = site?.name || '';
    }
    const normalizedLocationPrices = Array.isArray(locationPrices)
      ? locationPrices
          .filter((lp) => lp && lp.siteId && lp.siteName && typeof lp.price === 'number')
          .map((lp) => ({
            siteId: lp.siteId,
            siteName: lp.siteName.trim(),
            price: lp.price,
          }))
      : [];

    const onlineExisting = normalizedLocationPrices.find((lp) => lp.siteName.toLowerCase() === 'online');
    if (productChannel === 'website' && !onlineExisting && typeof price === 'number') {
      normalizedLocationPrices.push({
        siteId: onlineSite._id,
        siteName: 'online',
        price,
      });
    }

    const newProduct = new Product({
      name,
      description,
      price,
      weight,
      quantity: 0,
      imageUrl,
      category,
      isActive: true,
      isAvailableForCart: true,
      productChannel,
      availableSiteId: availableSiteId || (productChannel === 'website' ? onlineSite._id : null),
      availableSiteName: availableSiteName || (productChannel === 'website' ? 'online' : ''),
      locationPrices: normalizedLocationPrices,
    });

    await newProduct.save();
    res.status(201).json({ success:"true",message: 'Product added successfully', product: newProduct });
  } 
  catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}



async function handleGetProducts(req,res){ 
  logger.debug("In handleGetProducts");

  try {
    let query = {};
    if (req.user.role !== 'admin') {
      const allowed = req.user.siteAccess || [];
      query = { availableSiteId: { $in: allowed } };
    }
    const products = await Product.find(query).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    logger.error('Error fetching products', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}



async function handleUpdateProductQuantity(req, res) {
  logger.debug('In handleUpdateProductQuantity');

  const { id } = req.params;
  const { quantity } = req.body;

  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { quantity },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ success: true, message: 'Quantity updated', product: updatedProduct });
  } catch (err) {
    logger.error('Error updating product quantity', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}


async function handleUpdateProductPrice(req, res) {
  logger.debug('In handleUpdateProductPrice');
  const { id } = req.params;
  const { price } = req.body;
    
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { price },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ success: true, message: 'Price updated', product: updatedProduct });
  } catch (err) {
    logger.error('Error updating product quantity', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateProduct(req, res) {
  const { id } = req.params;
  const { name, description, price, weight, imageUrl, category, productChannel, availableSiteId, availableSiteName } = req.body;
  try {
    const updated = await Product.findByIdAndUpdate(
      id,
      { name, description, price, weight, imageUrl, category, productChannel, availableSiteId, availableSiteName },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ success: true, product: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteProduct(req, res) {
  const { id } = req.params;
  try {
    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleToggleProductActive(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  try {
    const updated = await Product.findByIdAndUpdate(
      id,
      { isActive: Boolean(isActive) },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ success: true, product: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleToggleProductAvailability(req, res) {
  const { id } = req.params;
  const { isAvailableForCart } = req.body;
  try {
    const updated = await Product.findByIdAndUpdate(
      id,
      { isAvailableForCart: Boolean(isAvailableForCart) },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ success: true, product: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpsertLocationPrice(req, res) {
  const { id } = req.params;
  const { siteId, siteName, price } = req.body;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const existingIndex = product.locationPrices.findIndex(
      (lp) => String(lp.siteId) === String(siteId)
    );
    if (existingIndex >= 0) {
      product.locationPrices[existingIndex].price = Number(price);
      product.locationPrices[existingIndex].siteName = siteName;
    } else {
      product.locationPrices.push({
        siteId,
        siteName,
        price: Number(price),
      });
    }

    if (siteName?.toLowerCase() === 'online') {
      product.price = Number(price);
    }

    await product.save();
    return res.status(200).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRemoveLocationPrice(req, res) {
  const { id } = req.params;
  const { siteId } = req.body;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.locationPrices = product.locationPrices.filter((lp) => String(lp.siteId) !== String(siteId));
    await product.save();
    return res.status(200).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}


async function handleGetProductsForPublic(req,res){ 
  logger.debug("In handleGetProductsForPublic");

  try {
    const products = await Product.find({ isActive: true, productChannel: 'website' }).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    logger.error('Error fetching products', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetSites(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({}).sort({ name: 1 });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      sites = sites.filter((s) => allowedSet.has(String(s._id)));
    }
    return res.status(200).json(sites);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetProductSites(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      sites = sites.filter((s) => allowedSet.has(String(s._id)));
    }
    return res.status(200).json(sites);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetPublicSites(req, res) {
  try {
    await ensureOnlineSite();
    const sites = await Site.find({ isActive: true }).sort({ name: 1 });
    return res.status(200).json(sites);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSite(req, res) {
  try {
    const { name, contactNumber, contactPersonName, address, city, latitude = null, longitude = null, isActive = true } = req.body;
    if (name?.trim().toLowerCase() === 'online') {
      return res.status(400).json({ message: 'Online site is system-managed and cannot be created manually' });
    }
    const exists = await Site.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Site already exists' });
    const site = await Site.create({
      name,
      contactNumber,
      contactPersonName,
      address,
      city,
      latitude: latitude === '' || latitude === null ? null : Number(latitude),
      longitude: longitude === '' || longitude === null ? null : Number(longitude),
      isActive,
    });
    return res.status(201).json({ success: true, site });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateSite(req, res) {
  try {
    const { id } = req.params;
    const siteBefore = await Site.findById(id);
    if (!siteBefore) return res.status(404).json({ message: 'Site not found' });
    if (siteBefore.name.toLowerCase() === 'online' && req.body.name && req.body.name.toLowerCase() !== 'online') {
      return res.status(400).json({ message: 'Online site name cannot be changed' });
    }
    if (req.body.name?.trim().toLowerCase() === 'online' && siteBefore.name.toLowerCase() !== 'online') {
      return res.status(400).json({ message: 'Only system default site can be named online' });
    }
    const site = await Site.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!site) return res.status(404).json({ message: 'Site not found' });
    return res.status(200).json({ success: true, site });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteSite(req, res) {
  try {
    const { id } = req.params;
    const site = await Site.findById(id);
    if (!site) return res.status(404).json({ message: 'Site not found' });
    if (site.name.toLowerCase() === 'online') {
      return res.status(400).json({ message: 'Online site cannot be deleted' });
    }
    await Site.findByIdAndDelete(id);
    await Product.updateMany({}, { $pull: { locationPrices: { siteId: id } } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleStockSummary(req, res) {
  try {
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    const products = await Product.find({});
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      sites = sites.filter((s) => allowedSet.has(String(s._id)));
    }
    const summary = sites.map((site) => {
      const items = products.filter(
        (p) => String(p.availableSiteId || '') === String(site._id) || (p.availableSiteName || '').toLowerCase() === site.name.toLowerCase()
      );
      const totalStock = items.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
      return {
        siteId: site._id,
        siteName: site.name,
        totalStock,
        productsCount: items.length,
      };
    });
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockProducts(req, res) {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      const allowed = req.user.siteAccess || [];
      query = { availableSiteId: { $in: allowed } };
    }
    const products = await Product.find(query).sort({ name: 1 });
    return res.status(200).json(products);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetAssignedSites(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      sites = sites.filter((s) => allowedSet.has(String(s._id)));
    }
    return res.status(200).json(sites);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetSiteStock(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json({ message: 'siteId is required' });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    const products = await Product.find({
      $or: [{ availableSiteId: siteId }, { availableSiteName: { $regex: /^online$/i } }],
    }).sort({ name: 1 });
    const filtered = products.filter(
      (p) => String(p.availableSiteId || '') === String(siteId)
    );
    return res.status(200).json(filtered);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSalePointEntry(req, res) {
  try {
    const { siteId, productId, quantity, discountAmount = 0, date } = req.body;
    const qty = Number(quantity);
    const discount = Number(discountAmount || 0);
    if (!siteId || !productId || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Invalid sale entry data' });
    }
    if (Number.isNaN(discount) || discount < 0) {
      return res.status(400).json({ message: 'Invalid discount amount' });
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }

    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (String(product.availableSiteId || '') !== String(siteId)) {
      return res.status(400).json({ message: 'Selected product does not belong to this site' });
    }
    if (Number(product.quantity || 0) < qty) {
      return res.status(400).json({ message: 'Insufficient stock available' });
    }

    const unitPrice = Number(product.price || 0);
    const grossAmount = unitPrice * qty;
    const netAmount = Math.max(0, grossAmount - discount);

    product.quantity = Number(product.quantity || 0) - qty;
    await product.save();

    const entry = await SalePointEntry.create({
      siteId: site._id,
      siteName: site.name,
      productId: product._id,
      productName: product.name,
      date: date ? new Date(date) : new Date(),
      quantity: qty,
      unitPrice,
      grossAmount,
      discountAmount: discount,
      netAmount,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || req.user.username || '',
    });

    return res.status(201).json({ success: true, entry, remainingStock: product.quantity });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSaleCheckout(req, res) {
  try {
    const { siteId, date, items = [], customerName = '', customerWhatsapp = '', customerEmail = '' } = req.body;
    if (!siteId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid sale checkout data' });
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const normalizedItems = items.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      discountAmount: Number(it.discountAmount || 0),
    }));
    for (const it of normalizedItems) {
      if (!it.productId || Number.isNaN(it.quantity) || it.quantity <= 0 || Number.isNaN(it.discountAmount) || it.discountAmount < 0) {
        return res.status(400).json({ message: 'Invalid item in sale checkout' });
      }
      const product = await Product.findById(it.productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (String(product.availableSiteId || '') !== String(siteId)) {
        return res.status(400).json({ message: `Product "${product.name}" does not belong to selected site` });
      }
      if (Number(product.quantity || 0) < it.quantity) {
        return res.status(400).json({ message: `Insufficient stock for "${product.name}"` });
      }
    }

    const createdEntries = [];
    let grossTotal = 0;
    let discountTotal = 0;
    let netTotal = 0;
    for (const it of normalizedItems) {
      const product = await Product.findById(it.productId);
      const unitPrice = Number(product.price || 0);
      const grossAmount = unitPrice * it.quantity;
      const netAmount = Math.max(0, grossAmount - it.discountAmount);

      product.quantity = Number(product.quantity || 0) - it.quantity;
      await product.save();

      const entry = await SalePointEntry.create({
        entryType: 'sale',
        siteId: site._id,
        siteName: site.name,
        productId: product._id,
        productName: product.name,
        date: date ? new Date(date) : new Date(),
        quantity: it.quantity,
        unitPrice,
        grossAmount,
        discountAmount: it.discountAmount,
        netAmount,
        customerName: String(customerName || '').trim(),
        customerWhatsapp: String(customerWhatsapp || '').trim(),
        customerEmail: String(customerEmail || '').trim(),
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
      createdEntries.push(entry);
      grossTotal += grossAmount;
      discountTotal += it.discountAmount;
      netTotal += netAmount;
    }

    return res.status(201).json({ success: true, entries: createdEntries, grossTotal, discountTotal, netTotal });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSaleReturn(req, res) {
  try {
    const { siteId, date, items = [], customerName = '', customerWhatsapp = '', customerEmail = '' } = req.body;
    if (!siteId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid return data' });
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const createdEntries = [];
    for (const raw of items) {
      const quantity = Number(raw.quantity);
      const returnAmount = Number(raw.returnAmount);
      if (!raw.productId || Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(returnAmount) || returnAmount < 0) {
        return res.status(400).json({ message: 'Invalid item in return form' });
      }
      const product = await Product.findById(raw.productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (String(product.availableSiteId || '') !== String(siteId)) {
        return res.status(400).json({ message: `Product "${product.name}" does not belong to selected site` });
      }

      product.quantity = Number(product.quantity || 0) + quantity;
      await product.save();

      const entry = await SalePointEntry.create({
        entryType: 'return',
        siteId: site._id,
        siteName: site.name,
        productId: product._id,
        productName: product.name,
        date: date ? new Date(date) : new Date(),
        quantity,
        unitPrice: quantity > 0 ? returnAmount / quantity : Number(product.price || 0),
        grossAmount: returnAmount,
        discountAmount: 0,
        netAmount: -Math.abs(returnAmount),
        customerName: String(customerName || '').trim(),
        customerWhatsapp: String(customerWhatsapp || '').trim(),
        customerEmail: String(customerEmail || '').trim(),
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
      createdEntries.push(entry);
    }

    return res.status(201).json({ success: true, entries: createdEntries });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetSalePointEntries(req, res) {
  try {
    const { siteId, date, dateFrom, dateTo } = req.query;
    const query = {};
    if (siteId) query.siteId = siteId;
    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query.date = range;
    } else if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (siteId && !allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
      if (!siteId) query.siteId = { $in: Array.from(allowedSet) };
    }

    const entries = await SalePointEntry.find(query).sort({ createdAt: -1 }).limit(200);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateStockWastedEntry(req, res) {
  try {
    const { siteId, productId, quantity, notes = '', date } = req.body;
    const qty = Number(quantity);
    if (!siteId || !productId || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Invalid stock wasted entry data' });
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }

    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (String(product.availableSiteId || '') !== String(siteId)) {
      return res.status(400).json({ message: 'Selected product does not belong to this site' });
    }
    if (Number(product.quantity || 0) < qty) {
      return res.status(400).json({ message: 'Insufficient stock available' });
    }

    product.quantity = Number(product.quantity || 0) - qty;
    await product.save();

    const entry = await StockWastedEntry.create({
      siteId: site._id,
      siteName: site.name,
      productId: product._id,
      productName: product.name,
      date: date ? new Date(date) : new Date(),
      quantity: qty,
      notes,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || req.user.username || '',
    });

    return res.status(201).json({ success: true, entry, remainingStock: product.quantity });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockWastedEntries(req, res) {
  try {
    const { siteId, date, dateFrom, dateTo } = req.query;
    const query = {};
    if (siteId) query.siteId = siteId;
    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query.date = range;
    } else if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (siteId && !allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
      if (!siteId) query.siteId = { $in: Array.from(allowedSet) };
    }

    const entries = await StockWastedEntry.find(query).sort({ createdAt: -1 }).limit(200);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCustomerDirectory(req, res) {
  try {
    const saleMatch = {
      entryType: 'sale',
      customerWhatsapp: { $exists: true, $ne: '' },
    };
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      saleMatch.siteId = { $in: Array.from(allowedSet) };
    }

    const saleRows = await SalePointEntry.aggregate([
      { $match: saleMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customerWhatsapp',
          customerWhatsapp: { $first: '$customerWhatsapp' },
          customerName: { $first: '$customerName' },
          customerEmail: { $first: '' },
          lastPurchaseAt: { $first: '$createdAt' },
          lastPurchaseSite: { $first: '$siteName' },
        },
      },
    ]);

    const onlineOrderQuery = {
      'customer.mobile': { $exists: true, $ne: '' },
    };
    const orderRowsRaw = req.user.role === 'admin'
      ? await Order.find(onlineOrderQuery).sort({ createdAt: -1 }).select('customer createdAt status')
      : [];

    const orderRows = orderRowsRaw.map((o) => ({
      _id: `online-${String(o.customer?.mobile || '').trim()}`,
      customerWhatsapp: String(o.customer?.mobile || '').trim(),
      customerName: String(o.customer?.name || '').trim(),
      customerEmail: String(o.customer?.email || '').trim(),
      lastPurchaseAt: o.createdAt,
      lastPurchaseSite: 'online',
    })).filter((r) => r.customerWhatsapp);

    const mergedMap = new Map();
    const allRows = [...saleRows, ...orderRows];
    for (const row of allRows) {
      const key = String(row.customerWhatsapp || '').trim();
      if (!key) continue;
      const prev = mergedMap.get(key);
      if (!prev) {
        mergedMap.set(key, {
          _id: key,
          customerWhatsapp: key,
          customerName: row.customerName || '',
          customerEmail: row.customerEmail || '',
          lastPurchaseAt: row.lastPurchaseAt || null,
          lastPurchaseSite: row.lastPurchaseSite || '',
        });
        continue;
      }

      const prevAt = prev.lastPurchaseAt ? new Date(prev.lastPurchaseAt).getTime() : 0;
      const nextAt = row.lastPurchaseAt ? new Date(row.lastPurchaseAt).getTime() : 0;
      const useNext = nextAt >= prevAt;
      mergedMap.set(key, {
        _id: key,
        customerWhatsapp: key,
        customerName: useNext ? (row.customerName || prev.customerName || '') : prev.customerName,
        customerEmail: useNext ? (row.customerEmail || prev.customerEmail || '') : (prev.customerEmail || row.customerEmail || ''),
        lastPurchaseAt: useNext ? row.lastPurchaseAt : prev.lastPurchaseAt,
        lastPurchaseSite: useNext ? (row.lastPurchaseSite || prev.lastPurchaseSite || '') : prev.lastPurchaseSite,
      });
    }

    const rows = Array.from(mergedMap.values()).sort((a, b) => {
      const at = a.lastPurchaseAt ? new Date(a.lastPurchaseAt).getTime() : 0;
      const bt = b.lastPurchaseAt ? new Date(b.lastPurchaseAt).getTime() : 0;
      return bt - at;
    });

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetExpenseHeads(req, res) {
  try {
    await ensureDefaultExpenseSetup();
    const heads = await ExpenseHead.find({}).sort({ name: 1 });
    return res.status(200).json(heads);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateExpenseHead(req, res) {
  try {
    const { name, colorCode = '#6B7280' } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Expense head name is required' });
    const exists = await ExpenseHead.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Expense head already exists' });
    const head = await ExpenseHead.create({ name: name.trim(), colorCode, isActive: true });
    return res.status(201).json({ success: true, head });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetExpenseItems(req, res) {
  try {
    await ensureDefaultExpenseSetup();
    const { headId } = req.query;
    const query = headId ? { headId } : {};
    const items = await ExpenseItem.find(query).sort({ name: 1 });
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateExpenseItem(req, res) {
  try {
    const { headId, name } = req.body;
    if (!headId || !name?.trim()) return res.status(400).json({ message: 'headId and expense name are required' });
    const head = await ExpenseHead.findById(headId);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });
    const exists = await ExpenseItem.findOne({ headId, name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Expense name already exists in this head' });
    const item = await ExpenseItem.create({ headId, name: name.trim(), isActive: true });
    return res.status(201).json({ success: true, item });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateExpenseEntry(req, res) {
  try {
    const { siteId, date, headId, itemId, itemName, amount, remarks = '' } = req.body;
    const value = Number(amount);
    if (!siteId || !headId || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Invalid expense entry data' });
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });
    const head = await ExpenseHead.findById(headId);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });

    let resolvedItemName = String(itemName || '').trim();
    let resolvedItemId = null;
    if (itemId) {
      const item = await ExpenseItem.findById(itemId);
      if (!item) return res.status(404).json({ message: 'Expense item not found' });
      resolvedItemName = item.name;
      resolvedItemId = item._id;
    }
    if (!resolvedItemName) return res.status(400).json({ message: 'Expense name is required' });

    const entry = await ExpenseEntry.create({
      siteId: site._id,
      siteName: site.name,
      date: date ? new Date(date) : new Date(),
      headId: head._id,
      headName: head.name,
      itemId: resolvedItemId,
      itemName: resolvedItemName,
      amount: value,
      remarks,
      enteredBy: req.user.id === 'super-admin' ? null : req.user.id,
      enteredByName: req.user.name || req.user.username || '',
    });
    return res.status(201).json({ success: true, entry });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetExpenseEntries(req, res) {
  try {
    const { siteId, dateFrom, dateTo } = req.query;
    const query = {};
    if (siteId) query.siteId = siteId;
    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query.date = range;
    }
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (siteId && !allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
      if (!siteId) query.siteId = { $in: Array.from(allowedSet) };
    }
    const entries = await ExpenseEntry.find(query).sort({ date: -1, createdAt: -1 }).limit(1000);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateExpenseEntry(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only super user can edit expense entries' });
    }
    const { id } = req.params;
    const { date, headId, itemId, itemName, amount, remarks = '' } = req.body;
    const entry = await ExpenseEntry.findById(id);
    if (!entry) return res.status(404).json({ message: 'Expense entry not found' });

    const value = Number(amount);
    if (Number.isNaN(value) || value < 0) return res.status(400).json({ message: 'Invalid amount' });

    const head = await ExpenseHead.findById(headId || entry.headId);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });

    let resolvedItemName = String(itemName || '').trim();
    let resolvedItemId = null;
    if (itemId) {
      const item = await ExpenseItem.findById(itemId);
      if (!item) return res.status(404).json({ message: 'Expense item not found' });
      resolvedItemName = item.name;
      resolvedItemId = item._id;
    }
    if (!resolvedItemName) return res.status(400).json({ message: 'Expense name is required' });

    entry.date = date ? new Date(date) : entry.date;
    entry.headId = head._id;
    entry.headName = head.name;
    entry.itemId = resolvedItemId;
    entry.itemName = resolvedItemName;
    entry.amount = value;
    entry.remarks = remarks;
    await entry.save();
    return res.status(200).json({ success: true, entry });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteExpenseEntry(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only super user can remove expense entries' });
    }
    const { id } = req.params;
    const deleted = await ExpenseEntry.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Expense entry not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetUsers(req, res) {
  try {
    const users = await userDetails
      .find({})
      .select('-password')
      .populate('siteAccess', 'name city isActive')
      .sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateUser(req, res) {
  try {
    const {
      name,
      fatherName,
      contactNumber,
      cnic,
      username,
      email,
      password,
      confirmPassword,
      role = 'user',
      siteAccess = [],
      permissions = {},
    } = req.body;

    if (!name || !contactNumber || !username || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const existing = await userDetails.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username already exists' });
    if (email) {
      const emailExists = await userDetails.findOne({ email });
      if (emailExists) return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new userDetails({
      name,
      fatherName: fatherName || '',
      contactNumber,
      cnic: cnic || '',
      username,
      email: email || undefined,
      password,
      role,
      siteAccess,
      permissions,
      isActive: true,
    });
    await user.save();
    return res.status(201).json({ success: true, user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateUser(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      fatherName,
      contactNumber,
      cnic,
      email,
      role,
      siteAccess,
      permissions,
      isActive,
      password,
      confirmPassword,
    } = req.body;
    const user = await userDetails.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.name = name ?? user.name;
    user.fatherName = fatherName ?? user.fatherName;
    user.contactNumber = contactNumber ?? user.contactNumber;
    user.cnic = cnic ?? user.cnic;
    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail) {
        user.email = undefined;
      } else {
        const emailOwner = await userDetails.findOne({ email: normalizedEmail, _id: { $ne: id } });
        if (emailOwner) return res.status(400).json({ message: 'Email already exists' });
        user.email = normalizedEmail;
      }
    }
    user.role = role ?? user.role;
    user.siteAccess = Array.isArray(siteAccess) ? siteAccess : user.siteAccess;
    user.permissions = permissions ?? user.permissions;
    if (typeof isActive === 'boolean') user.isActive = isActive;

    if (password || confirmPassword) {
      if (!password || !confirmPassword || password !== confirmPassword) {
        return res.status(400).json({ message: 'Password confirmation does not match' });
      }
      user.password = password;
    }

    await user.save();
    return res.status(200).json({ success: true, user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    if (err?.code === 11000) {
      const dupField = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(400).json({ message: `${dupField} already exists` });
    }
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteUser(req, res) {
  try {
    const { id } = req.params;
    if (String(req.user.id) === String(id)) return res.status(400).json({ message: 'You cannot delete yourself' });
    const user = await userDetails.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAdjustStock(req, res) {
  try {
    const { productId, quantityChange } = req.body;
    const delta = Number(quantityChange);
    if (!productId || Number.isNaN(delta) || delta === 0) {
      return res.status(400).json({ message: 'Invalid stock adjustment request' });
    }
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const quantityBefore = Number(product.quantity || 0);
    const nextQuantity = quantityBefore + delta;
    if (nextQuantity < 0) return res.status(400).json({ message: 'Stock cannot go below zero' });
    product.quantity = nextQuantity;
    await product.save();
    const site = product.availableSiteId ? await Site.findById(product.availableSiteId) : null;
    await StockAdjustment.create({
      siteId: site?._id || product.availableSiteId,
      siteName: site?.name || product.availableSiteName || 'Unknown',
      productId: product._id,
      productName: product.name,
      adjustmentType: delta > 0 ? 'add' : 'remove',
      quantityChange: delta,
      quantityBefore,
      quantityAfter: nextQuantity,
      updatedBy: req.user.id === 'super-admin' ? null : req.user.id,
      updatedByName: req.user.name || req.user.username || 'Unknown',
    });
    return res.status(200).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleStockAdjustments(req, res) {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      const allowed = req.user.siteAccess || [];
      query = { siteId: { $in: allowed } };
    }
    const rows = await StockAdjustment.find(query).sort({ createdAt: -1 }).limit(500);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}


async function handleUpdateShippingCosts(req,res){ 
  logger.debug("In handleUpdateShippingCosts");

  try {
    const { zoneAUnitCost, cityOverrides, allowedCities } = req.body;
    const updatePayload = {};
    if (typeof zoneAUnitCost === 'number' && !Number.isNaN(zoneAUnitCost)) {
      updatePayload.zoneAUnitCost = zoneAUnitCost;
    }
    if (Array.isArray(cityOverrides)) {
      updatePayload.cityOverrides = cityOverrides;
    }
    if (Array.isArray(allowedCities)) {
      updatePayload.allowedCities = allowedCities;
    }

    const existing = await ShippingSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });

    if (existing) {
      await ShippingSettings.findByIdAndUpdate(
        existing._id,
        { $set: updatePayload },
        { runValidators: true }
      );
    } else {
      await ShippingSettings.create({
        zoneAUnitCost: 0,
        cityOverrides: [],
        allowedCities: [],
        ...updatePayload,
      });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Error updating shipping settings', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error in Updating Shipping details', error: err.message });
  }
}

async function handleGetOrderAlertEmails(req, res) {
  try {
    const rows = await OrderAlertEmail.find({}).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAddOrderAlertEmail(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const row = await OrderAlertEmail.create({ email: String(email).trim().toLowerCase(), isActive: true });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteOrderAlertEmail(req, res) {
  try {
    const { id } = req.params;
    const row = await OrderAlertEmail.findByIdAndDelete(id);
    if (!row) return res.status(404).json({ message: 'Email not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetCouriers(req, res) {
  try {
    const rows = await Courier.find({}).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateCourier(req, res) {
  try {
    const row = await Courier.create(req.body);
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateCourier(req, res) {
  try {
    const { id } = req.params;
    const row = await Courier.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'Courier not found' });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteCourier(req, res) {
  try {
    const { id } = req.params;
    const row = await Courier.findByIdAndDelete(id);
    if (!row) return res.status(404).json({ message: 'Courier not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetPaymentMethods(req, res) {
  try {
    const rows = await PaymentMethod.find({}).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetPublicPaymentMethods(req, res) {
  try {
    const rows = await PaymentMethod.find({ isActive: true }).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreatePaymentMethod(req, res) {
  try {
    const {
      name,
      code = '',
      requiresReceipt = false,
      allowReceiptUpload = false,
      discountType = 'none',
      discountValue = 0,
      chargeType = 'none',
      chargeValue = 0,
      qrImageUrl = '',
      methodImageUrl = '',
      details = '',
      isCashOnDelivery = false,
      isActive = true,
    } = req.body;

    if (!String(name || '').trim()) return res.status(400).json({ message: 'Payment method name is required' });
    const normalizedCode = normalizePaymentCode(code || name);
    if (!normalizedCode) return res.status(400).json({ message: 'Payment method code is invalid' });
    const exists = await PaymentMethod.findOne({ code: normalizedCode });
    if (exists) return res.status(400).json({ message: 'Payment method already exists' });

    const row = await PaymentMethod.create({
      name: String(name).trim(),
      code: normalizedCode,
      requiresReceipt: Boolean(requiresReceipt),
      allowReceiptUpload: Boolean(allowReceiptUpload),
      discountType,
      discountValue: Number(discountValue || 0),
      chargeType,
      chargeValue: Number(chargeValue || 0),
      qrImageUrl: String(qrImageUrl || '').trim(),
      methodImageUrl: String(methodImageUrl || '').trim(),
      details: String(details || '').trim(),
      isCashOnDelivery: Boolean(isCashOnDelivery),
      isActive: Boolean(isActive),
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdatePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const payload = { ...req.body };
    if (payload.code || payload.name) {
      payload.code = normalizePaymentCode(payload.code || payload.name);
      const clash = await PaymentMethod.findOne({ code: payload.code, _id: { $ne: id } });
      if (clash) return res.status(400).json({ message: 'Payment method code already exists' });
    }
    if (payload.discountValue !== undefined) payload.discountValue = Number(payload.discountValue || 0);
    if (payload.chargeValue !== undefined) payload.chargeValue = Number(payload.chargeValue || 0);
    const row = await PaymentMethod.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'Payment method not found' });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeletePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const row = await PaymentMethod.findByIdAndDelete(id);
    if (!row) return res.status(404).json({ message: 'Payment method not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetOrders(req, res) {
  try {
    const rows = await Order.find({}).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleConfirmOrder(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'confirmed';
    await order.save();
    await sendOrderAlertEmails(`Order Confirmed - ${order.orderNumber}`, `Your order ${order.orderNumber} has been confirmed.`, order.customer?.email);
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRejectOrder(req, res) {
  try {
    const { id } = req.params;
    const { reason = 'Order cancelled due to stock unavailability' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'cancelled';
    order.adminRemarks = reason;
    order.rejectionReason = '';
    await order.save();
    await sendOrderAlertEmails(
      `Order Cancelled - ${order.orderNumber}`,
      `Your order ${order.orderNumber} has been cancelled. Reason: ${reason}`,
      order.customer?.email
    );
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleModifyOrder(req, res) {
  try {
    const { id } = req.params;
    const { items = [], discountAmount = 0, paymentMethodId } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Items are required' });

    const normalizedItems = [];
    for (const it of items) {
      const pid = it?.productId;
      const qty = Number(it?.quantity || 0);
      if (!pid || qty < 1) {
        return res.status(400).json({ message: 'Each item requires product and quantity' });
      }

      const product = await Product.findById(pid);
      if (!product) {
        return res.status(400).json({ message: `Product not found for item: ${it?.name || pid}` });
      }

      if (qty > Number(product.quantity || 0)) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name}. Available: ${Number(product.quantity || 0)}`,
        });
      }

      normalizedItems.push({
        productId: product._id,
        name: product.name,
        price: Number(product.price || 0),
        quantity: qty,
      });
    }

    order.items = normalizedItems;
    const subtotal = normalizedItems.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
    order.subtotal = subtotal;
    order.discountAmount = Number(discountAmount || 0);
    const baseAfterAdminDiscount = Math.max(0, subtotal + Number(order.shippingCost || 0) - Number(order.discountAmount || 0));

    let selectedPaymentMethod = null;
    if (paymentMethodId) {
      selectedPaymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!selectedPaymentMethod || !selectedPaymentMethod.isActive) {
        return res.status(400).json({ message: 'Selected payment method is not available' });
      }
    }

    let paymentDiscount = 0;
    if (selectedPaymentMethod?.discountType === 'fixed') {
      paymentDiscount = Number(selectedPaymentMethod.discountValue || 0);
    } else if (selectedPaymentMethod?.discountType === 'percentage') {
      paymentDiscount = (Number(baseAfterAdminDiscount || 0) * Number(selectedPaymentMethod.discountValue || 0)) / 100;
    }
    paymentDiscount = Math.max(0, Number(paymentDiscount || 0));

    let paymentCharge = 0;
    if (selectedPaymentMethod?.chargeType === 'fixed') {
      paymentCharge = Number(selectedPaymentMethod.chargeValue || 0);
    } else if (selectedPaymentMethod?.chargeType === 'percentage') {
      paymentCharge = (Number(baseAfterAdminDiscount || 0) * Number(selectedPaymentMethod.chargeValue || 0)) / 100;
    }
    paymentCharge = Math.max(0, Number(paymentCharge || 0));

    const payableAmount = Math.max(0, Number(baseAfterAdminDiscount || 0) - paymentDiscount + paymentCharge);
    order.finalAmount = payableAmount;
    if (selectedPaymentMethod) {
      order.paymentMode = selectedPaymentMethod?.isCashOnDelivery ? 'cod' : 'prepaid';
      order.paymentDetails = {
        ...(order.paymentDetails || {}),
        methodId: selectedPaymentMethod._id,
        methodName: selectedPaymentMethod.name || '',
        methodCode: selectedPaymentMethod.code || '',
        paymentDiscount,
        paymentCharge,
        payableAmount,
      };
    }
    await order.save();

    try {
      await sendOrderAlertEmails(`Order Modified - ${order.orderNumber}`, `Your order ${order.orderNumber} has been modified. Updated amount: ${order.finalAmount}`, order.customer?.email);
    } catch (mailErr) {
      logger.warn('Order modified but email failed', { error: mailErr?.message || String(mailErr) });
    }

    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDispatchOrder(req, res) {
  try {
    const { id } = req.params;
    const { courierId, trackingNumber = '', courierHelpline = '', paymentMode = 'cod' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const courier = await Courier.findById(courierId);
    if (!courier) return res.status(404).json({ message: 'Courier not found' });
    order.status = 'dispatched';
    order.paymentMode = paymentMode;
    order.courier = {
      courierId: courier._id,
      courierName: courier.name,
      trackingNumber,
      courierHelpline: courierHelpline || courier.contactNumber || '',
      jmmContactPersonName: courier.jmmContactPersonName || '',
      jmmContactNumber: courier.jmmContactNumber || '',
    };
    await order.save();
    await sendOrderAlertEmails(
      `Order Dispatched - ${order.orderNumber}`,
      `Order ${order.orderNumber} dispatched.\nTracking: ${trackingNumber}\nCourier: ${courier.name}\nCourier Contact: ${order.courier.courierHelpline}\nJM Contact: ${order.courier.jmmContactPersonName} ${order.courier.jmmContactNumber}`,
      order.customer?.email
    );
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCancelOrder(req, res) {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'cancelled';
    order.adminRemarks = reason;
    await order.save();
    await sendOrderAlertEmails(`Order Cancelled - ${order.orderNumber}`, `Order ${order.orderNumber} was cancelled. Reason: ${reason}`, order.customer?.email);
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeliverOrder(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'delivered';
    await order.save();
    const feedbackUrl =
      process.env.FEEDBACK_URL?.includes('{orderNumber}')
        ? process.env.FEEDBACK_URL.replace('{orderNumber}', order.orderNumber)
        : (process.env.FEEDBACK_URL || `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/feedback/${order.orderNumber}`);
    const textBody = `Thank you! Your order ${order.orderNumber} is delivered. Please order again.\nSubmit feedback: ${feedbackUrl}`;
    const htmlBody = `
      <p>Thank you! Your order <strong>${order.orderNumber}</strong> has been delivered.</p>
      <p>Please order again.</p>
      <p><a href="${feedbackUrl}" target="_blank" rel="noopener noreferrer">Click here to complete feedback</a></p>
    `;
    await sendOrderAlertEmails(
      `Order Delivered - ${order.orderNumber}`,
      textBody,
      order.customer?.email,
      htmlBody
    );
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleSendFeedbackReminder(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'delivered') return res.status(400).json({ message: 'Feedback reminder can only be sent for delivered orders' });
    if (order.feedback?.rating) return res.status(400).json({ message: 'Feedback already submitted for this order' });

    const feedbackUrl =
      process.env.FEEDBACK_URL?.includes('{orderNumber}')
        ? process.env.FEEDBACK_URL.replace('{orderNumber}', order.orderNumber)
        : (process.env.FEEDBACK_URL || `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/feedback/${order.orderNumber}`);

    const textBody = `Friendly reminder: please share feedback for order ${order.orderNumber}.\nSubmit feedback: ${feedbackUrl}`;
    const htmlBody = `
      <p>Friendly reminder for your delivered order <strong>${order.orderNumber}</strong>.</p>
      <p>Your feedback helps us improve.</p>
      <p><a href="${feedbackUrl}" target="_blank" rel="noopener noreferrer">Click here to complete feedback</a></p>
    `;

    await sendOrderAlertEmails(
      `Feedback Reminder - ${order.orderNumber}`,
      textBody,
      order.customer?.email,
      htmlBody
    );
    return res.status(200).json({ success: true, message: 'Feedback reminder sent' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleReturnOrder(req, res) {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'returned';
    order.adminRemarks = reason;
    await order.save();
    await sendOrderAlertEmails(`Order Returned - ${order.orderNumber}`, `Order ${order.orderNumber} was marked returned. Reason: ${reason}`, order.customer?.email);
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleVerifyOrderPayment(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.paymentDetails = {
      ...(order.paymentDetails || {}),
      isVerified: true,
      verifiedAt: new Date(),
      verifiedByName: req.user?.name || req.user?.username || 'Admin',
    };
    await order.save();
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetOrderFeedbackMeta(req, res) {
  try {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber }).select('orderNumber customer.name status feedback');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.status(200).json({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || '',
      status: order.status,
      feedback: order.feedback || null,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleSubmitOrderFeedback(req, res) {
  try {
    const { orderNumber } = req.params;
    const { rating, comments = '' } = req.body;
    const val = Number(rating);
    if (Number.isNaN(val) || val < 1 || val > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.feedback = {
      rating: val,
      comments: String(comments || '').trim(),
      submittedAt: new Date(),
    };
    await order.save();
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleFeedbackReport(req, res) {
  try {
    const { rating, dateFrom, dateTo } = req.query;
    const query = { 'feedback.rating': { $ne: null } };
    if (rating) query['feedback.rating'] = Number(rating);
    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query['feedback.submittedAt'] = range;
    }
    const rows = await Order.find(query).sort({ 'feedback.submittedAt': -1, createdAt: -1 });
    return res.status(200).json(rows.map((o) => ({
      orderNumber: o.orderNumber,
      customerName: o.customer?.name || '',
      customerEmail: o.customer?.email || '',
      customerMobile: o.customer?.mobile || '',
      rating: o.feedback?.rating || null,
      comments: o.feedback?.comments || '',
      submittedAt: o.feedback?.submittedAt || null,
      finalAmount: o.finalAmount || o.totalCost || 0,
      status: o.status,
    })));
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleFetchingShippingCosts(req,res){ 
  logger.debug("In handleGetShippingCosts");

  try {
   
    const settings = await ShippingSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });
    logger.debug("Loaded shipping settings");
    res.json(settings || {});
  } catch (err) {
    logger.error('Error fetching shipping settings', { error: err?.message || String(err) });
    res.status(500).json({ message: 'Server error in fetching Shipping details', error: err.message });
  }
}

async function handleContactQuery(req, res) {
  try {
    const {
      name = '',
      email = '',
      phone = '',
      siteName = '',
      message = '',
      hpField = '',
      captchaA,
      captchaB,
      captchaAnswer,
      formStartedAt,
    } = req.body || {};
    if (!String(name).trim() || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Name and message are required' });
    }
    if (String(hpField || '').trim()) {
      return res.status(400).json({ success: false, message: 'Bot verification failed' });
    }
    const a = Number(captchaA);
    const b = Number(captchaB);
    const ans = Number(captchaAnswer);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(ans) || ans !== a + b) {
      return res.status(400).json({ success: false, message: 'Human verification answer is incorrect' });
    }
    const started = Number(formStartedAt || 0);
    if (!Number.isFinite(started) || started <= 0 || Date.now() - started < 3000) {
      return res.status(400).json({ success: false, message: 'Please take a moment before submitting the form' });
    }

    const to = process.env.CONTACT_QUERY_TO || 'info@csittec.com';
    const safeName = String(name).trim();
    const safeEmail = String(email || '').trim();
    const safePhone = String(phone || '').trim();
    const safeSite = String(siteName || '').trim();
    const safeMessage = String(message || '').trim();

    const subject = `JM Mangoes Contact Query - ${safeName}`;
    const text = `New contact query received:
Name: ${safeName}
Email: ${safeEmail || '-'}
Phone: ${safePhone || '-'}
Site: ${safeSite || '-'}
Message:
${safeMessage}`;

    const html = `
      <h3>New contact query received</h3>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${safeEmail || '-'}</p>
      <p><strong>Phone:</strong> ${safePhone || '-'}</p>
      <p><strong>Site:</strong> ${safeSite || '-'}</p>
      <p><strong>Message:</strong><br/>${safeMessage.replace(/\n/g, '<br/>')}</p>
    `;

    await sendMail({ to, subject, text, html });
    return res.status(200).json({ success: true, message: 'Your query has been sent.' });
  } catch (err) {
    logger.error('Contact query email failed', { error: err?.message || String(err) });
    return res.status(500).json({ success: false, message: 'Failed to send query right now' });
  }
}


async function handleCheckout(req,res){ 
  logger.debug("In handleCheckout");

 try {
    const { customer, items, paymentMethodId = '', receiptUrl = '' } = req.body;

    // Load shipping settings
    const settings = await ShippingSettings.findOne({});
    const zoneRate = settings?.zoneAUnitCost || 0;
    const override = settings?.cityOverrides?.find(o => o.city.toLowerCase() === customer.city.toLowerCase());
    const shippingRate = override ? override.cost : zoneRate;

    

    // Calculate derived values
    const subtotal = items.reduce((sum, v) => sum + v.price * v.quantity, 0);
    const totalQuantity = items.reduce((sum, v) => sum + v.quantity, 0);
    const shippingCost = shippingRate * totalQuantity;
    const totalCost = subtotal + shippingCost;

    let selectedPaymentMethod = null;
    if (paymentMethodId) {
      selectedPaymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!selectedPaymentMethod || !selectedPaymentMethod.isActive) {
        return res.status(400).json({ success: false, message: 'Selected payment method is not available' });
      }
      if (selectedPaymentMethod.requiresReceipt && !String(receiptUrl || '').trim()) {
        return res.status(400).json({ success: false, message: 'Receipt is required for selected payment method' });
      }
    }

    let paymentDiscount = 0;
    if (selectedPaymentMethod?.discountType === 'fixed') {
      paymentDiscount = Number(selectedPaymentMethod.discountValue || 0);
    } else if (selectedPaymentMethod?.discountType === 'percentage') {
      paymentDiscount = (Number(totalCost || 0) * Number(selectedPaymentMethod.discountValue || 0)) / 100;
    }
    paymentDiscount = Math.max(0, Number(paymentDiscount || 0));

    let paymentCharge = 0;
    if (selectedPaymentMethod?.chargeType === 'fixed') {
      paymentCharge = Number(selectedPaymentMethod.chargeValue || 0);
    } else if (selectedPaymentMethod?.chargeType === 'percentage') {
      paymentCharge = (Number(totalCost || 0) * Number(selectedPaymentMethod.chargeValue || 0)) / 100;
    }
    paymentCharge = Math.max(0, Number(paymentCharge || 0));

    const payableAmount = Math.max(0, Number(totalCost || 0) - paymentDiscount + paymentCharge);

    logger.debug('Checkout shipping cost computed', { shippingCost });
    logger.debug('Checkout total cost computed', { totalCost });

    // Save order
    const orderNumber = await getNextOrderNumber();
    const order = new Order({
      orderNumber,
      customer,
      items,
      subtotal,
      shippingRate,
      shippingCost,
      totalCost,
      discountAmount: 0,
      finalAmount: payableAmount,
      paymentMode: selectedPaymentMethod?.isCashOnDelivery ? 'cod' : 'prepaid',
      paymentDetails: {
        methodId: selectedPaymentMethod?._id || null,
        methodName: selectedPaymentMethod?.name || '',
        methodCode: selectedPaymentMethod?.code || '',
        receiptUrl: String(receiptUrl || '').trim(),
        paymentDiscount,
        paymentCharge,
        payableAmount,
      },
      status: 'pending_confirmation',
    });
    await order.save();

    const customerName = customer?.fullName || customer?.name || 'Customer';
    const customerPhone = customer?.phone || customer?.contactNumber || customer?.mobile || 'N/A';
    const customerCity = customer?.city || 'N/A';
    const lines = (items || [])
      .map((item) => `- ${item.name} x ${item.quantity} @ ${item.price}`)
      .join('\n');
    const text = `New order received
Order Number: ${orderNumber}
Customer: ${customerName}
Phone: ${customerPhone}
City: ${customerCity}
Subtotal: ${subtotal}
Shipping: ${shippingCost}
Total: ${totalCost}
Payment Method: ${selectedPaymentMethod?.name || 'N/A'}
Payment Discount: ${paymentDiscount}
Payment Charge: ${paymentCharge}
Payable: ${payableAmount}
Items:
${lines}`;
    sendOrderAlertEmails(`New JM Mangoes Order ${orderNumber}`, text, customer?.email)
      .catch((mailErr) => {
        logger.warn('Order placed but email sending failed', { error: mailErr?.message || String(mailErr) });
      });

    res.status(201).json({ success: true, orderId: order._id, orderNumber, totalCost, payableAmount });
  } catch (err) {
    logger.error('Checkout error', { error: err?.message || String(err) });
    res.status(500).json({ success: false, message: 'Checkout failed' });
  }
}





module.exports = {
    handleCheckout,
    handleRegister,
    handleLogin,
    handleLogout,
    handleAddProducts,
    handleGetProducts,
    handleUpdateProductQuantity,
    handleUpdateProductPrice,
    handleUpdateProduct,
    handleDeleteProduct,
    handleToggleProductActive,
    handleToggleProductAvailability,
    handleUpsertLocationPrice,
    handleRemoveLocationPrice,
    handleGetProductsForPublic,
    handleGetSites,
    handleGetProductSites,
    handleGetPublicSites,
    handleCreateSite,
    handleUpdateSite,
    handleDeleteSite,
    handleGetUsers,
    handleCreateUser,
    handleUpdateUser,
    handleDeleteUser,
    handleStockSummary,
    handleGetStockProducts,
    handleGetAssignedSites,
    handleGetSiteStock,
    handleCreateSalePointEntry,
    handleCreateSaleCheckout,
    handleCreateSaleReturn,
    handleGetSalePointEntries,
    handleCustomerDirectory,
    handleGetExpenseHeads,
    handleCreateExpenseHead,
    handleGetExpenseItems,
    handleCreateExpenseItem,
    handleCreateExpenseEntry,
    handleGetExpenseEntries,
    handleUpdateExpenseEntry,
    handleDeleteExpenseEntry,
    handleGetOrderAlertEmails,
    handleAddOrderAlertEmail,
    handleDeleteOrderAlertEmail,
    handleGetCouriers,
    handleCreateCourier,
    handleUpdateCourier,
    handleDeleteCourier,
    handleGetPaymentMethods,
    handleGetPublicPaymentMethods,
    handleCreatePaymentMethod,
    handleUpdatePaymentMethod,
    handleDeletePaymentMethod,
    handleGetOrders,
    handleConfirmOrder,
    handleRejectOrder,
    handleModifyOrder,
    handleDispatchOrder,
    handleCancelOrder,
    handleDeliverOrder,
    handleSendFeedbackReminder,
    handleReturnOrder,
    handleVerifyOrderPayment,
    handleGetOrderFeedbackMeta,
    handleSubmitOrderFeedback,
    handleFeedbackReport,
    handleCreateStockWastedEntry,
    handleGetStockWastedEntries,
    handleAdjustStock,
    handleStockAdjustments,
    handleUpdateShippingCosts,
    handleFetchingShippingCosts,
    handleContactQuery,
    handleCheckout,
    
}

