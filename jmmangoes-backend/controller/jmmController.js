const { request } = require('https');
const LocalStorage = require('node-localstorage').LocalStorage;
localStorage = new LocalStorage('./scratch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');




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
const FarmBlock = require('../model/FarmBlockSchema');
const FarmCluster = require('../model/FarmClusterSchema');
const FarmVariety = require('../model/FarmVarietySchema');
const FarmTree = require('../model/FarmTreeSchema');
const FarmTreeLog = require('../model/FarmTreeLogSchema');
const FarmBlockLog = require('../model/FarmBlockLogSchema');
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

function userAllowedFarmBlocks(req) {
  if (req.user?.role === 'admin') return null;
  return new Set((req.user?.farmBlockAccess || []).map(String));
}

function canAccessFarmBlock(req, blockId) {
  if (req.user?.role === 'admin') return true;
  const allowed = userAllowedFarmBlocks(req);
  return allowed?.has(String(blockId));
}

function toPositiveInt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function calculateTreeAgeYearsFromDate(plantingDate) {
  if (!plantingDate) return 0;
  const d = new Date(plantingDate);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  const dayDiff = now.getDate() - d.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years < 0 ? 0 : years;
}

function buildTreeIdentifier(blockCode, rowNumber, rowTreeNumber) {
  return `${String(blockCode || '').toUpperCase()}-R${String(rowNumber).padStart(2, '0')}-T${String(rowTreeNumber).padStart(3, '0')}`;
}

function updateEnvKey(key, value) {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  const escapedValue = String(value).replace(/\r?\n/g, '');
  const line = `${key}=${escapedValue}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

function createHumanChallengeToken(a, b) {
  const secret = process.env.JWT_SECRET || 'fallback_secret';
  return jwt.sign({ kind: 'human-challenge', a, b }, secret, { expiresIn: '10m' });
}

function verifyHumanChallenge(token, answer) {
  const secret = process.env.JWT_SECRET || 'fallback_secret';
  const decoded = jwt.verify(String(token || ''), secret);
  if (decoded?.kind !== 'human-challenge') return false;
  return Number(answer) === Number(decoded.a) + Number(decoded.b);
}

async function getNextGlobalTreeCode() {
  const rows = await FarmTree.find({ treeCode: { $regex: '^[0-9]+$' } })
    .sort({ treeCode: -1 })
    .limit(1)
    .select('treeCode');
  const latest = Number(rows?.[0]?.treeCode || 0);
  const next = Number.isFinite(latest) ? latest + 1 : 1;
  return String(next).padStart(6, '0');
}

async function rebuildBlockTreeIdentifiers(blockId) {
  const block = await FarmBlock.findById(blockId).select('code');
  if (!block) return;
  const rows = await FarmTree.find({ blockId }).select('_id treeCode rowNumber rowTreeNumber');
  const targetRows = rows
    .filter((t) => t.rowNumber && t.rowTreeNumber)
    .map((t) => ({
      id: t._id,
      treeCode: t.treeCode,
      rowNumber: t.rowNumber,
      rowTreeNumber: t.rowTreeNumber,
    }));

  if (!targetRows.length) return;

  // Phase 1: assign temporary unique IDs to avoid unique-index collisions
  const tempOps = targetRows.map((t) => {
    const tempTreeId = `TMP-${String(t.id)}`;
    return {
      updateOne: {
        filter: { _id: t.id },
        update: { $set: { treeId: tempTreeId, qrCodeData: `${t.treeCode}|${tempTreeId}` } },
      },
    };
  });
  await FarmTree.bulkWrite(tempOps, { ordered: true });

  // Phase 2: assign final deterministic IDs
  const finalOps = targetRows.map((t) => {
      const treeId = buildTreeIdentifier(block.code, t.rowNumber, t.rowTreeNumber);
      return {
        updateOne: {
          filter: { _id: t.id },
          update: { $set: { blockCode: block.code, treeId, qrCodeData: `${t.treeCode}|${treeId}` } },
        },
      };
    });
  await FarmTree.bulkWrite(finalOps, { ordered: true });
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
        farmBlockAccess: (user.farmBlockAccess || []).map((b) => String(b)),
        isFarmUser: !!user.isFarmUser,
        isSalesUser: !!user.isSalesUser,
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
        farmBlockAccess: (user.farmBlockAccess || []).map((b) => String(b)),
        isFarmUser: !!user.isFarmUser,
        isSalesUser: !!user.isSalesUser,
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

async function handleGetHumanChallenge(req, res) {
  try {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const challengeToken = createHumanChallengeToken(a, b);
    return res.status(200).json({
      success: true,
      question: `What is ${a} + ${b}?`,
      challengeToken,
    });
  } catch (err) {
    logger.error('Human challenge generation failed', { error: err?.message || String(err) });
    return res.status(500).json({ message: 'Server error' });
  }
}

async function handleForgotPassword(req, res) {
  const fallbackEmail = 'engr.dr.ahmed.sohaib@gmail.com';
  try {
    const username = String(req.body?.username || '').trim();
    const challengeToken = String(req.body?.challengeToken || '').trim();
    const challengeAnswer = req.body?.challengeAnswer;
    const hpField = String(req.body?.hpField || '').trim();
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }
    if (hpField) {
      return res.status(400).json({ message: 'Verification failed' });
    }
    let humanOk = false;
    try {
      humanOk = verifyHumanChallenge(challengeToken, challengeAnswer);
    } catch (_) {
      humanOk = false;
    }
    if (!humanOk) {
      return res.status(400).json({ message: 'Human verification failed. Please try again.' });
    }

    const superAdminUsername = process.env.SUPERADMIN_USERNAME || 'admin';
    if (username === superAdminUsername) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const resetSecret = process.env.JWT_SECRET || 'fallback_secret';
      const adminResetToken = jwt.sign(
        { kind: 'super-admin-reset', username: superAdminUsername, token: rawToken },
        resetSecret,
        { expiresIn: '15m' }
      );
      const appOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const resetLink = `${appOrigin}/reset-password?token=${encodeURIComponent(adminResetToken)}`;
      const subject = 'JM Mangoes - Super Admin Password Reset';
      const text = `Super admin password reset requested.\n\nUse this link to reset password:\n${resetLink}\n\nThis link will expire in 15 minutes.`;
      const html = `<p>Super admin password reset requested.</p><p><a href="${resetLink}">Click here to reset password</a></p><p>This link will expire in 15 minutes.</p>`;
      await sendMail({ to: fallbackEmail, subject, text, html });
      return res.status(200).json({ success: true, message: 'If username exists, reset instructions have been sent.' });
    }

    const user = await userDetails.findOne({ username });
    if (!user || user.isActive === false) {
      return res.status(200).json({ success: true, message: 'If username exists, reset instructions have been sent.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = expiresAt;
    await user.save();

    const appOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const resetLink = `${appOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const userEmail = String(user.email || '').trim();
    const recipients = Array.from(new Set([userEmail, fallbackEmail].filter(Boolean)));
    const subject = 'JM Mangoes - Password Reset';
    const text = `Hello ${user.name || user.username},\n\nUse this link to reset your password:\n${resetLink}\n\nThis link will expire in 15 minutes.\n\nIf you did not request this, you can ignore this email.`;
    const html = `<p>Hello ${user.name || user.username},</p><p>Use this link to reset your password:</p><p><a href="${resetLink}">Click here to reset password</a></p><p>This link will expire in 15 minutes.</p><p>If you did not request this, you can ignore this email.</p>`;

    await sendMail({ to: recipients.join(','), subject, text, html });
    return res.status(200).json({ success: true, message: 'If username exists, reset instructions have been sent.' });
  } catch (err) {
    logger.error('Forgot password failed', { error: err?.message || String(err) });
    return res.status(500).json({ message: 'Server error' });
  }
}

async function handleResetPassword(req, res) {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Token, password and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // First, try super-admin reset token (JWT style token)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      if (decoded?.kind === 'super-admin-reset') {
        const superAdminUsername = process.env.SUPERADMIN_USERNAME || 'admin';
        if (decoded.username !== superAdminUsername) {
          return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        process.env.SUPERADMIN_PASSWORD = password;
        updateEnvKey('SUPERADMIN_PASSWORD', password);
        return res.status(200).json({ success: true, message: 'Super admin password reset successful. Please login.' });
      }
    } catch (_) {
      // Ignore and continue with normal user token flow.
    }

    const user = await userDetails.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
      isActive: true,
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successful. Please login.' });
  } catch (err) {
    logger.error('Reset password failed', { error: err?.message || String(err) });
    return res.status(500).json({ message: 'Server error' });
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
      .populate('farmBlockAccess', 'name code acreage isActive')
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
      farmBlockAccess = [],
      isFarmUser = false,
      isSalesUser = true,
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
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const emailExists = await userDetails.findOne({ email: normalizedEmail });
      if (emailExists) return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new userDetails({
      name,
      fatherName: fatherName || '',
      contactNumber,
      cnic: cnic || '',
      username,
      email: normalizedEmail || undefined,
      password,
      role,
      siteAccess,
      farmBlockAccess,
      isFarmUser: Boolean(isFarmUser),
      isSalesUser: Boolean(isSalesUser),
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
      farmBlockAccess,
      isFarmUser,
      isSalesUser,
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
    user.farmBlockAccess = Array.isArray(farmBlockAccess) ? farmBlockAccess : user.farmBlockAccess;
    if (typeof isFarmUser === 'boolean') user.isFarmUser = isFarmUser;
    if (typeof isSalesUser === 'boolean') user.isSalesUser = isSalesUser;
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
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      confirmedAt: new Date(),
    };
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
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      cancelledAt: new Date(),
    };
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
    const { courierId, trackingNumber = '', paymentMode = 'cod' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const courier = await Courier.findById(courierId);
    if (!courier) return res.status(404).json({ message: 'Courier not found' });
    order.status = 'dispatched';
    order.paymentMode = paymentMode;
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      confirmedAt: order?.statusTimeline?.confirmedAt || null,
      dispatchedAt: new Date(),
    };
    order.courier = {
      courierId: courier._id,
      courierName: courier.name,
      trackingNumber,
      courierHelpline: courier.contactNumber || '',
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
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      cancelledAt: new Date(),
    };
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
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      deliveredAt: new Date(),
    };
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
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      returnedAt: new Date(),
    };
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

async function handleGetFarmBlocks(req, res) {
  try {
    let rows = await FarmBlock.find({}).sort({ createdAt: -1 });
    if (req.user.role !== 'admin') {
      const allowed = userAllowedFarmBlocks(req);
      rows = rows.filter((b) => allowed.has(String(b._id)));
    }
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmBlock(req, res) {
  try {
    const { name, code, acreage = 1, description = '', isActive = true, gridRows = 1, gridCols = 1 } = req.body || {};
    if (!String(name || '').trim() || !String(code || '').trim()) {
      return res.status(400).json({ message: 'Name and code are required' });
    }
    const row = await FarmBlock.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      acreage: Number(acreage || 0),
      description: String(description || '').trim(),
      isActive: Boolean(isActive),
      gridRows: Math.max(1, Number(gridRows || 1)),
      gridCols: Math.max(1, Number(gridCols || 1)),
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmBlock(req, res) {
  try {
    const { id } = req.params;
    const payload = { ...req.body };
    if (payload.code) payload.code = String(payload.code).trim().toUpperCase();
    if (payload.acreage !== undefined) payload.acreage = Number(payload.acreage || 0);
    const row = await FarmBlock.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'Farm block not found' });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmBlock(req, res) {
  try {
    const { id } = req.params;
    const treeCount = await FarmTree.countDocuments({ blockId: id });
    if (treeCount > 0) return res.status(400).json({ message: 'Cannot delete block with assigned trees' });
    const row = await FarmBlock.findByIdAndDelete(id);
    if (!row) return res.status(404).json({ message: 'Farm block not found' });
    await userDetails.updateMany({}, { $pull: { farmBlockAccess: row._id } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmClusters(req, res) {
  try {
    const rows = await FarmCluster.find({}).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmCluster(req, res) {
  try {
    const { name, code, description = '', isActive = true, gridRows = 1, gridCols = 1 } = req.body || {};
    if (!String(name || '').trim() || !String(code || '').trim()) {
      return res.status(400).json({ message: 'Name and code are required' });
    }
    const row = await FarmCluster.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      description: String(description || '').trim(),
      isActive: Boolean(isActive),
      gridRows: Math.max(1, Number(gridRows || 1)),
      gridCols: Math.max(1, Number(gridCols || 1)),
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmCluster(req, res) {
  try {
    const { id } = req.params;
    const payload = { ...req.body };
    if (payload.code) payload.code = String(payload.code).trim().toUpperCase();
    if (payload.gridRows !== undefined) payload.gridRows = Math.max(1, Number(payload.gridRows || 1));
    if (payload.gridCols !== undefined) payload.gridCols = Math.max(1, Number(payload.gridCols || 1));
    const row = await FarmCluster.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'Cluster not found' });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmCluster(req, res) {
  try {
    const { id } = req.params;
    const cluster = await FarmCluster.findByIdAndDelete(id);
    if (!cluster) return res.status(404).json({ message: 'Cluster not found' });
    await FarmBlock.updateMany(
      { clusterId: id },
      { $set: { clusterId: null, clusterName: '', clusterCode: '', clusterRow: null, clusterCol: null } }
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmBlocksByCluster(req, res) {
  try {
    const { clusterId } = req.params;
    const query = { clusterId };
    let rows = await FarmBlock.find(query).sort({ clusterRow: 1, clusterCol: 1, code: 1 });
    if (req.user.role !== 'admin') {
      const allowed = userAllowedFarmBlocks(req);
      rows = rows.filter((b) => allowed.has(String(b._id)));
    }
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAssignFarmBlockToCluster(req, res) {
  try {
    const { id } = req.params;
    const { clusterId = null, clusterRow = null, clusterCol = null } = req.body || {};
    const block = await FarmBlock.findById(id);
    if (!block) return res.status(404).json({ message: 'Farm block not found' });
    if (!canAccessFarmBlock(req, block._id)) return res.status(403).json({ message: 'Access denied for this block' });

    if (!clusterId) {
      block.clusterId = null;
      block.clusterName = '';
      block.clusterCode = '';
      block.clusterRow = null;
      block.clusterCol = null;
      await block.save();
      return res.status(200).json({ success: true, row: block });
    }

    const cluster = await FarmCluster.findById(clusterId);
    if (!cluster) return res.status(404).json({ message: 'Cluster not found' });
    const row = toPositiveInt(clusterRow, null);
    const col = toPositiveInt(clusterCol, null);
    if (!row || !col) return res.status(400).json({ message: 'Cluster row/col are required' });

    const occupied = await FarmBlock.findOne({
      _id: { $ne: block._id },
      clusterId,
      clusterRow: row,
      clusterCol: col,
    });
    if (occupied) return res.status(400).json({ message: 'Target cluster position is occupied' });

    block.clusterId = cluster._id;
    block.clusterName = cluster.name;
    block.clusterCode = cluster.code;
    block.clusterRow = row;
    block.clusterCol = col;
    await block.save();
    await FarmCluster.findByIdAndUpdate(cluster._id, { $max: { gridRows: row, gridCols: col } });
    return res.status(200).json({ success: true, row: block });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleMoveFarmBlockInCluster(req, res) {
  try {
    const { id } = req.params;
    const { clusterId, clusterRow, clusterCol, allowSwap = false } = req.body || {};
    const row = toPositiveInt(clusterRow, null);
    const col = toPositiveInt(clusterCol, null);
    if (!clusterId || !row || !col) return res.status(400).json({ message: 'Cluster and target row/col are required' });
    const block = await FarmBlock.findById(id);
    if (!block) return res.status(404).json({ message: 'Farm block not found' });
    if (!canAccessFarmBlock(req, block._id)) return res.status(403).json({ message: 'Access denied for this block' });

    const cluster = await FarmCluster.findById(clusterId);
    if (!cluster) return res.status(404).json({ message: 'Cluster not found' });
    const occupied = await FarmBlock.findOne({
      _id: { $ne: block._id },
      clusterId,
      clusterRow: row,
      clusterCol: col,
    });
    if (occupied && !allowSwap) return res.status(400).json({ message: 'Target position occupied' });

    const old = {
      clusterId: block.clusterId,
      clusterName: block.clusterName,
      clusterCode: block.clusterCode,
      clusterRow: block.clusterRow,
      clusterCol: block.clusterCol,
    };
    block.clusterId = cluster._id;
    block.clusterName = cluster.name;
    block.clusterCode = cluster.code;
    block.clusterRow = row;
    block.clusterCol = col;
    await block.save();

    if (occupied && allowSwap) {
      occupied.clusterId = old.clusterId;
      occupied.clusterName = old.clusterName;
      occupied.clusterCode = old.clusterCode;
      occupied.clusterRow = old.clusterRow;
      occupied.clusterCol = old.clusterCol;
      await occupied.save();
    }

    await FarmCluster.findByIdAndUpdate(cluster._id, { $max: { gridRows: row, gridCols: col } });
    return res.status(200).json({ success: true, swapped: Boolean(occupied && allowSwap), row: block });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAdjustFarmClusterGrid(req, res) {
  try {
    const { clusterId, operation, index } = req.body || {};
    const idx = toPositiveInt(index, null);
    if (!clusterId || !operation || !idx) return res.status(400).json({ message: 'Cluster, operation and index are required' });
    const cluster = await FarmCluster.findById(clusterId);
    if (!cluster) return res.status(404).json({ message: 'Cluster not found' });
    let gridRows = Math.max(1, Number(cluster.gridRows || 1));
    let gridCols = Math.max(1, Number(cluster.gridCols || 1));
    const SHIFT = 100000;

    if (operation === 'append_row') {
      cluster.gridRows = gridRows + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Row added at bottom' });
    }
    if (operation === 'append_col') {
      cluster.gridCols = gridCols + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Column added at right' });
    }

    if (operation === 'add_row_top') {
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gte: idx } }, { $inc: { clusterRow: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gte: idx + SHIFT } }, { $inc: { clusterRow: -(SHIFT - 1) } });
      cluster.gridRows = gridRows + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Row inserted' });
    }
    if (operation === 'add_row_bottom') {
      if (idx === gridRows) {
        cluster.gridRows = gridRows + 1;
        await cluster.save();
        return res.status(200).json({ success: true, message: 'Row added at bottom' });
      }
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gt: idx } }, { $inc: { clusterRow: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gt: idx + SHIFT } }, { $inc: { clusterRow: -(SHIFT - 1) } });
      cluster.gridRows = gridRows + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Row inserted' });
    }
    if (operation === 'delete_row') {
      if (gridRows <= 1) return res.status(400).json({ message: 'Cannot delete the only row' });
      await FarmBlock.updateMany({ clusterId, clusterRow: idx }, { $set: { clusterId: null, clusterName: '', clusterCode: '', clusterRow: null, clusterCol: null } });
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gt: idx } }, { $inc: { clusterRow: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterRow: { $gt: idx + SHIFT } }, { $inc: { clusterRow: -(SHIFT + 1) } });
      cluster.gridRows = Math.max(1, gridRows - 1);
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Row deleted' });
    }

    if (operation === 'add_col_left') {
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gte: idx } }, { $inc: { clusterCol: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gte: idx + SHIFT } }, { $inc: { clusterCol: -(SHIFT - 1) } });
      cluster.gridCols = gridCols + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Column inserted' });
    }
    if (operation === 'add_col_right') {
      if (idx === gridCols) {
        cluster.gridCols = gridCols + 1;
        await cluster.save();
        return res.status(200).json({ success: true, message: 'Column added at right' });
      }
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gt: idx } }, { $inc: { clusterCol: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gt: idx + SHIFT } }, { $inc: { clusterCol: -(SHIFT - 1) } });
      cluster.gridCols = gridCols + 1;
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Column inserted' });
    }
    if (operation === 'delete_col') {
      if (gridCols <= 1) return res.status(400).json({ message: 'Cannot delete the only column' });
      await FarmBlock.updateMany({ clusterId, clusterCol: idx }, { $set: { clusterId: null, clusterName: '', clusterCode: '', clusterRow: null, clusterCol: null } });
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gt: idx } }, { $inc: { clusterCol: SHIFT } });
      await FarmBlock.updateMany({ clusterId, clusterCol: { $gt: idx + SHIFT } }, { $inc: { clusterCol: -(SHIFT + 1) } });
      cluster.gridCols = Math.max(1, gridCols - 1);
      await cluster.save();
      return res.status(200).json({ success: true, message: 'Column deleted' });
    }

    return res.status(400).json({ message: 'Unsupported operation' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmVarieties(req, res) {
  try {
    const includeInactive = String(req.query?.includeInactive || '').toLowerCase() === 'true';
    const query = includeInactive ? {} : { isActive: true };
    const rows = await FarmVariety.find(query).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmVariety(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) return res.status(400).json({ message: 'Variety name is required' });
    const exists = await FarmVariety.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (exists) return res.status(400).json({ message: 'Variety already exists' });
    const row = await FarmVariety.create({ name, description, isActive: true });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Variety already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmVariety(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmVariety.findById(id);
    if (!row) return res.status(404).json({ message: 'Variety not found' });

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Variety name is required' });
      const conflict = await FarmVariety.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (conflict) return res.status(400).json({ message: 'Variety already exists' });
      row.name = name;
    }
    if (req.body?.description !== undefined) row.description = String(req.body.description || '').trim();
    if (typeof req.body?.isActive === 'boolean') row.isActive = req.body.isActive;

    await row.save();
    return res.status(200).json({ success: true, row });
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Variety already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmVariety(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmVariety.findByIdAndDelete(id);
    if (!row) return res.status(404).json({ message: 'Variety not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmTrees(req, res) {
  try {
    const { blockId = '' } = req.query;
    const query = {};
    if (blockId) query.blockId = blockId;
    if (req.user.role !== 'admin') {
      const allowed = userAllowedFarmBlocks(req);
      query.blockId = blockId ? blockId : { $in: Array.from(allowed) };
      if (blockId && !allowed.has(String(blockId))) return res.status(403).json({ message: 'Access denied for this block' });
    }
    const rows = await FarmTree.find(query).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmTreeById(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmTree.findById(id);
    if (!row) return res.status(404).json({ message: 'Tree not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this tree' });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmTree(req, res) {
  try {
    const {
      blockId,
      treeCode,
      treeId,
      qrCodeData = '',
      serialInBlock = 0,
      rowNumber = null,
      rowTreeNumber = null,
      latitude = null,
      longitude = null,
      ageYears = 0,
      varieties = [],
      plantingDate = null,
      isActive = true,
    } = req.body || {};
    if (!blockId || !treeCode || !treeId) return res.status(400).json({ message: 'Block, tree code and tree id are required' });
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const block = await FarmBlock.findById(blockId);
    if (!block) return res.status(404).json({ message: 'Farm block not found' });
    const normalizedRow = toPositiveInt(rowNumber, null);
    const normalizedRowTree = toPositiveInt(rowTreeNumber, null);
    if ((normalizedRow && !normalizedRowTree) || (!normalizedRow && normalizedRowTree)) {
      return res.status(400).json({ message: 'Both row number and row tree number are required together' });
    }
    if (normalizedRow && normalizedRowTree) {
      const duplicateSlot = await FarmTree.findOne({
        blockId: block._id,
        rowNumber: normalizedRow,
        rowTreeNumber: normalizedRowTree,
      });
      if (duplicateSlot) return res.status(400).json({ message: 'Another tree already exists in this row position' });
    }
    const activeVarieties = await FarmVariety.find({ isActive: true }).select('name');
    const allowedVarieties = new Set(activeVarieties.map((v) => String(v.name || '').trim().toLowerCase()));
    const normalizedVarieties = Array.isArray(varieties)
      ? varieties
          .map((v) => String(v).trim())
          .filter(Boolean)
          .filter((v) => allowedVarieties.has(v.toLowerCase()))
      : [];
    const normalizedPlantingDate = plantingDate ? new Date(plantingDate) : null;
    const calculatedAgeYears = calculateTreeAgeYearsFromDate(normalizedPlantingDate);
    const row = await FarmTree.create({
      blockId: block._id,
      blockName: block.name,
      blockCode: block.code,
      treeCode: String(treeCode).trim().toUpperCase(),
      treeId: String(treeId).trim(),
      qrCodeData: String(qrCodeData || `${treeCode}|${treeId}`).trim(),
      serialInBlock: Number(serialInBlock || 0),
      rowNumber: normalizedRow,
      rowTreeNumber: normalizedRowTree,
      latitude: latitude === '' || latitude === null ? null : Number(latitude),
      longitude: longitude === '' || longitude === null ? null : Number(longitude),
      ageYears: calculatedAgeYears,
      varieties: normalizedVarieties,
      plantingDate: normalizedPlantingDate,
      isActive: Boolean(isActive),
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmTree(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmTree.findById(id);
    if (!row) return res.status(404).json({ message: 'Tree not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this tree' });
    const payload = { ...req.body };
    if (payload.blockId && String(payload.blockId) !== String(row.blockId)) {
      if (!canAccessFarmBlock(req, payload.blockId)) return res.status(403).json({ message: 'Access denied for target block' });
      const block = await FarmBlock.findById(payload.blockId);
      if (!block) return res.status(404).json({ message: 'Target block not found' });
      payload.blockName = block.name;
      payload.blockCode = block.code;
    }
    if (payload.treeCode) payload.treeCode = String(payload.treeCode).trim().toUpperCase();
    if (payload.ageYears !== undefined) delete payload.ageYears;
    if (payload.latitude !== undefined) payload.latitude = payload.latitude === '' || payload.latitude === null ? null : Number(payload.latitude);
    if (payload.longitude !== undefined) payload.longitude = payload.longitude === '' || payload.longitude === null ? null : Number(payload.longitude);
    if (payload.varieties !== undefined) {
      const activeVarieties = await FarmVariety.find({ isActive: true }).select('name');
      const allowedVarieties = new Set(activeVarieties.map((v) => String(v.name || '').trim().toLowerCase()));
      payload.varieties = Array.isArray(payload.varieties)
        ? payload.varieties
            .map((v) => String(v).trim())
            .filter(Boolean)
            .filter((v) => allowedVarieties.has(v.toLowerCase()))
        : [];
    }
    if (payload.plantingDate !== undefined) payload.plantingDate = payload.plantingDate ? new Date(payload.plantingDate) : null;
    const effectivePlantingDate = payload.plantingDate !== undefined ? payload.plantingDate : row.plantingDate;
    payload.ageYears = calculateTreeAgeYearsFromDate(effectivePlantingDate);
    if (payload.rowNumber !== undefined || payload.rowTreeNumber !== undefined) {
      const targetRow = toPositiveInt(payload.rowNumber !== undefined ? payload.rowNumber : row.rowNumber, null);
      const targetRowTree = toPositiveInt(payload.rowTreeNumber !== undefined ? payload.rowTreeNumber : row.rowTreeNumber, null);
      if ((targetRow && !targetRowTree) || (!targetRow && targetRowTree)) {
        return res.status(400).json({ message: 'Both row number and row tree number are required together' });
      }
      if (targetRow && targetRowTree) {
        const duplicate = await FarmTree.findOne({
          _id: { $ne: row._id },
          blockId: payload.blockId || row.blockId,
          rowNumber: targetRow,
          rowTreeNumber: targetRowTree,
        });
        if (duplicate) return res.status(400).json({ message: 'Target row position is already occupied' });
      }
      payload.rowNumber = targetRow;
      payload.rowTreeNumber = targetRowTree;
    }
    const updated = await FarmTree.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    return res.status(200).json({ success: true, row: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGenerateFarmTrees(req, res) {
  try {
    const { blockId, rows = 0, treesPerRow = 0 } = req.body || {};
    const totalRows = toPositiveInt(rows, 0);
    const totalTreesPerRow = toPositiveInt(treesPerRow, 0);
    if (!blockId || !totalRows || !totalTreesPerRow) {
      return res.status(400).json({ message: 'Block, rows, and trees per row are required' });
    }
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const block = await FarmBlock.findById(blockId);
    if (!block) return res.status(404).json({ message: 'Farm block not found' });

    const existing = await FarmTree.find({ blockId }).select('serialInBlock rowNumber rowTreeNumber');
    const latestGlobalCodeRow = await FarmTree.find({ treeCode: { $regex: '^[0-9]+$' } })
      .sort({ treeCode: -1 })
      .limit(1)
      .select('treeCode');
    let globalCode = Number(latestGlobalCodeRow?.[0]?.treeCode || 0);
    const occupied = new Set(existing.map((t) => `${t.rowNumber || 0}-${t.rowTreeNumber || 0}`));
    let serial = existing.reduce((m, t) => Math.max(m, Number(t.serialInBlock || 0)), 0);
    const batch = [];

    for (let rowNumber = 1; rowNumber <= totalRows; rowNumber += 1) {
      for (let rowTreeNumber = 1; rowTreeNumber <= totalTreesPerRow; rowTreeNumber += 1) {
        const key = `${rowNumber}-${rowTreeNumber}`;
        if (occupied.has(key)) continue;
        serial += 1;
        globalCode += 1;
        const treeCode = String(globalCode).padStart(6, '0');
        const treeId = buildTreeIdentifier(block.code, rowNumber, rowTreeNumber);
        const qrCodeData = `${treeCode}|${treeId}`;
        batch.push({
          blockId: block._id,
          blockName: block.name,
          blockCode: block.code,
          treeCode,
          treeId,
          serialInBlock: serial,
          rowNumber,
          rowTreeNumber,
          qrCodeData,
          isActive: true,
        });
      }
    }

    if (!batch.length) return res.status(200).json({ success: true, created: 0, message: 'All requested row slots already have trees' });
    await FarmTree.insertMany(batch, { ordered: true });
    await FarmBlock.findByIdAndUpdate(blockId, {
      $max: { gridRows: totalRows, gridCols: totalTreesPerRow },
    });
    return res.status(201).json({ success: true, created: batch.length });
  } catch (err) {
    logger.error('Failed generating farm trees', { error: err?.message || String(err) });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleMoveFarmTree(req, res) {
  try {
    const { id } = req.params;
    const { blockId, rowNumber, rowTreeNumber, allowSwap = false } = req.body || {};
    const targetRow = toPositiveInt(rowNumber, null);
    const targetRowTree = toPositiveInt(rowTreeNumber, null);
    if (!targetRow || !targetRowTree) return res.status(400).json({ message: 'Target row and tree number are required' });

    const row = await FarmTree.findById(id);
    if (!row) return res.status(404).json({ message: 'Tree not found' });
    const targetBlockId = blockId || row.blockId;
    if (!canAccessFarmBlock(req, row.blockId) || !canAccessFarmBlock(req, targetBlockId)) {
      return res.status(403).json({ message: 'Access denied for this block' });
    }

    const duplicate = await FarmTree.findOne({
      _id: { $ne: row._id },
      blockId: targetBlockId,
      rowNumber: targetRow,
      rowTreeNumber: targetRowTree,
    });

    if (duplicate && !allowSwap) return res.status(400).json({ message: 'Target slot is already occupied' });

    const payload = { rowNumber: targetRow, rowTreeNumber: targetRowTree };
    if (String(targetBlockId) !== String(row.blockId)) {
      const block = await FarmBlock.findById(targetBlockId);
      if (!block) return res.status(404).json({ message: 'Target block not found' });
      payload.blockId = block._id;
      payload.blockName = block.name;
      payload.blockCode = block.code;
      payload.treeId = buildTreeIdentifier(block.code, targetRow, targetRowTree);
      payload.qrCodeData = `${row.treeCode}|${payload.treeId}`;
    } else if (row.blockCode) {
      payload.treeId = buildTreeIdentifier(row.blockCode, targetRow, targetRowTree);
      payload.qrCodeData = `${row.treeCode}|${payload.treeId}`;
    }

    if (duplicate && allowSwap) {
      const sourcePayload = {
        rowNumber: row.rowNumber,
        rowTreeNumber: row.rowTreeNumber,
      };
      if (String(targetBlockId) !== String(row.blockId)) {
        const sourceBlock = await FarmBlock.findById(row.blockId);
        if (!sourceBlock) return res.status(404).json({ message: 'Source block not found for swap' });
        sourcePayload.blockId = sourceBlock._id;
        sourcePayload.blockName = sourceBlock.name;
        sourcePayload.blockCode = sourceBlock.code;
        sourcePayload.treeId = buildTreeIdentifier(sourceBlock.code, sourcePayload.rowNumber, sourcePayload.rowTreeNumber);
        sourcePayload.qrCodeData = `${duplicate.treeCode}|${sourcePayload.treeId}`;
      } else if (row.blockCode) {
        sourcePayload.treeId = buildTreeIdentifier(row.blockCode, sourcePayload.rowNumber, sourcePayload.rowTreeNumber);
        sourcePayload.qrCodeData = `${duplicate.treeCode}|${sourcePayload.treeId}`;
      }

      await FarmTree.findByIdAndUpdate(duplicate._id, sourcePayload, { runValidators: true });
    }

    const updated = await FarmTree.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    return res.status(200).json({ success: true, row: updated, swapped: Boolean(duplicate && allowSwap) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAutoCreateFarmTreeAtSlot(req, res) {
  try {
    const { blockId, rowNumber, rowTreeNumber } = req.body || {};
    const targetRow = toPositiveInt(rowNumber, null);
    const targetPos = toPositiveInt(rowTreeNumber, null);
    if (!blockId || !targetRow || !targetPos) {
      return res.status(400).json({ message: 'Block, row number and tree position are required' });
    }
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const block = await FarmBlock.findById(blockId);
    if (!block) return res.status(404).json({ message: 'Farm block not found' });
    const occupied = await FarmTree.findOne({ blockId, rowNumber: targetRow, rowTreeNumber: targetPos });
    if (occupied) return res.status(400).json({ message: 'Target slot is already occupied' });

    const maxSerialInBlock = await FarmTree.find({ blockId }).sort({ serialInBlock: -1 }).limit(1).select('serialInBlock');
    const serialInBlock = Number(maxSerialInBlock?.[0]?.serialInBlock || 0) + 1;
    const treeCode = await getNextGlobalTreeCode();
    const treeId = buildTreeIdentifier(block.code, targetRow, targetPos);
    const qrCodeData = `${treeCode}|${treeId}`;

    const row = await FarmTree.create({
      blockId: block._id,
      blockName: block.name,
      blockCode: block.code,
      treeCode,
      treeId,
      serialInBlock,
      rowNumber: targetRow,
      rowTreeNumber: targetPos,
      qrCodeData,
      isActive: true,
    });

    await FarmBlock.findByIdAndUpdate(blockId, {
      $max: { gridRows: targetRow, gridCols: targetPos },
    });

    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAdjustFarmTreeGrid(req, res) {
  try {
    const { blockId, operation, index } = req.body || {};
    const idx = toPositiveInt(index, null);
    if (!blockId || !operation || !idx) return res.status(400).json({ message: 'Block, operation and index are required' });
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const block = await FarmBlock.findById(blockId).select('gridRows gridCols');
    if (!block) return res.status(404).json({ message: 'Farm block not found' });
    let gridRows = Math.max(1, Number(block.gridRows || 1));
    let gridCols = Math.max(1, Number(block.gridCols || 1));
    if (idx < 1) return res.status(400).json({ message: 'Invalid row/column index' });

    const SHIFT_OFFSET = 100000;

    if (operation === 'add_row_top') {
      if (idx > gridRows) return res.status(400).json({ message: 'Row index out of range' });
      await FarmTree.updateMany({ blockId, rowNumber: { $gte: idx } }, { $inc: { rowNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowNumber: { $gte: idx + SHIFT_OFFSET } }, { $inc: { rowNumber: -(SHIFT_OFFSET - 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridRows += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
      return res.status(200).json({ success: true, message: 'Row inserted' });
    }

    if (operation === 'add_row_bottom') {
      if (idx > gridRows) return res.status(400).json({ message: 'Row index out of range' });
      if (idx === gridRows) {
        gridRows += 1;
        await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
        return res.status(200).json({ success: true, message: 'Row added at bottom' });
      }
      await FarmTree.updateMany({ blockId, rowNumber: { $gt: idx } }, { $inc: { rowNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowNumber: { $gt: idx + SHIFT_OFFSET } }, { $inc: { rowNumber: -(SHIFT_OFFSET - 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridRows += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
      return res.status(200).json({ success: true, message: 'Row inserted' });
    }

    if (operation === 'delete_row') {
      if (idx > gridRows) return res.status(400).json({ message: 'Row index out of range' });
      if (gridRows <= 1) return res.status(400).json({ message: 'Cannot delete the only remaining row' });
      const rowTreeCount = await FarmTree.countDocuments({ blockId, rowNumber: idx });
      if (rowTreeCount === 0 && idx === gridRows) {
        gridRows -= 1;
        await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
        return res.status(200).json({ success: true, message: 'Empty last row deleted' });
      }
      await FarmTree.deleteMany({ blockId, rowNumber: idx });
      await FarmTree.updateMany({ blockId, rowNumber: { $gt: idx } }, { $inc: { rowNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowNumber: { $gt: idx + SHIFT_OFFSET } }, { $inc: { rowNumber: -(SHIFT_OFFSET + 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridRows = Math.max(1, gridRows - 1);
      await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
      return res.status(200).json({ success: true, message: 'Row deleted' });
    }

    if (operation === 'add_col_left') {
      if (idx > gridCols) return res.status(400).json({ message: 'Column index out of range' });
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gte: idx } }, { $inc: { rowTreeNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gte: idx + SHIFT_OFFSET } }, { $inc: { rowTreeNumber: -(SHIFT_OFFSET - 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridCols += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
      return res.status(200).json({ success: true, message: 'Column inserted' });
    }

    if (operation === 'add_col_right') {
      if (idx > gridCols) return res.status(400).json({ message: 'Column index out of range' });
      if (idx === gridCols) {
        gridCols += 1;
        await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
        return res.status(200).json({ success: true, message: 'Column added at right' });
      }
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gt: idx } }, { $inc: { rowTreeNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gt: idx + SHIFT_OFFSET } }, { $inc: { rowTreeNumber: -(SHIFT_OFFSET - 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridCols += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
      return res.status(200).json({ success: true, message: 'Column inserted' });
    }

    if (operation === 'delete_col') {
      if (idx > gridCols) return res.status(400).json({ message: 'Column index out of range' });
      if (gridCols <= 1) return res.status(400).json({ message: 'Cannot delete the only remaining column' });
      const colTreeCount = await FarmTree.countDocuments({ blockId, rowTreeNumber: idx });
      if (colTreeCount === 0 && idx === gridCols) {
        gridCols -= 1;
        await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
        return res.status(200).json({ success: true, message: 'Empty last column deleted' });
      }
      await FarmTree.deleteMany({ blockId, rowTreeNumber: idx });
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gt: idx } }, { $inc: { rowTreeNumber: SHIFT_OFFSET } });
      await FarmTree.updateMany({ blockId, rowTreeNumber: { $gt: idx + SHIFT_OFFSET } }, { $inc: { rowTreeNumber: -(SHIFT_OFFSET + 1) } });
      await rebuildBlockTreeIdentifiers(blockId);
      gridCols = Math.max(1, gridCols - 1);
      await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
      return res.status(200).json({ success: true, message: 'Column deleted' });
    }

    if (operation === 'append_row') {
      gridRows += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridRows });
      return res.status(200).json({ success: true, message: 'Row added at bottom' });
    }

    if (operation === 'append_col') {
      gridCols += 1;
      await FarmBlock.findByIdAndUpdate(blockId, { gridCols });
      return res.status(200).json({ success: true, message: 'Column added at right' });
    }

    return res.status(400).json({ message: 'Unsupported operation' });
  } catch (err) {
    logger.error('Failed adjusting farm tree grid', { error: err?.message || String(err), body: req.body });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmTree(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmTree.findById(id);
    if (!row) return res.status(404).json({ message: 'Tree not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this tree' });
    await FarmTree.findByIdAndDelete(id);
    await FarmTreeLog.deleteMany({ treeId: row._id });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmTreeLogs(req, res) {
  try {
    const { treeId = '' } = req.query;
    if (!treeId) return res.status(400).json({ message: 'treeId is required' });
    const tree = await FarmTree.findById(treeId);
    if (!tree) return res.status(404).json({ message: 'Tree not found' });
    if (!canAccessFarmBlock(req, tree.blockId)) return res.status(403).json({ message: 'Access denied for this tree' });
    const rows = await FarmTreeLog.find({ treeId }).sort({ logDate: -1, createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmTreeLog(req, res) {
  try {
    const {
      treeId,
      logType,
      logDate,
      year,
      quantity = 0,
      quality = '',
      fertilizerType = '',
      fertilizerQuantity = 0,
      diseaseName = '',
      maintenanceJob = '',
      gradeA = 0,
      gradeB = 0,
      gradeC = 0,
      gradeD = 0,
      remarks = '',
      maintenanceStatus = 'pending',
    } = req.body || {};
    if (!treeId || !logType) return res.status(400).json({ message: 'Tree and log type are required' });
    const tree = await FarmTree.findById(treeId);
    if (!tree) return res.status(404).json({ message: 'Tree not found' });
    if (!canAccessFarmBlock(req, tree.blockId)) return res.status(403).json({ message: 'Access denied for this tree' });
    const row = await FarmTreeLog.create({
      treeId: tree._id,
      treeCode: tree.treeCode,
      blockId: tree.blockId,
      blockName: tree.blockName,
      logType,
      logDate: logDate ? new Date(logDate) : new Date(),
      year: Number(year || new Date().getFullYear()),
      quantity: Number(quantity || 0),
      quality: String(quality || '').trim(),
      fertilizerType: String(fertilizerType || '').trim(),
      fertilizerQuantity: Number(fertilizerQuantity || 0),
      diseaseName: String(diseaseName || '').trim(),
      maintenanceJob: String(maintenanceJob || '').trim(),
      maintenanceStatus: logType === 'maintenance' ? (String(maintenanceStatus || 'pending').toLowerCase() === 'completed' ? 'completed' : 'pending') : 'pending',
      maintenanceCompletedAt: logType === 'maintenance' && String(maintenanceStatus || '').toLowerCase() === 'completed' ? new Date() : null,
      maintenanceCompletedById: logType === 'maintenance' && String(maintenanceStatus || '').toLowerCase() === 'completed' && req.user.id !== 'super-admin' ? req.user.id : null,
      maintenanceCompletedByName: logType === 'maintenance' && String(maintenanceStatus || '').toLowerCase() === 'completed' ? (req.user.name || req.user.username || 'User') : '',
      gradeA: Number(gradeA || 0),
      gradeB: Number(gradeB || 0),
      gradeC: Number(gradeC || 0),
      gradeD: Number(gradeD || 0),
      remarks: String(remarks || '').trim(),
      createdById: req.user.id !== 'super-admin' ? req.user.id : null,
      createdByName: req.user.name || req.user.username || 'User',
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmTreeLog(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmTreeLog.findById(id);
    if (!row) return res.status(404).json({ message: 'Log not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this log' });
    const payload = { ...req.body };
    if (payload.logDate !== undefined) payload.logDate = payload.logDate ? new Date(payload.logDate) : row.logDate;
    ['year', 'quantity', 'fertilizerQuantity', 'gradeA', 'gradeB', 'gradeC', 'gradeD'].forEach((k) => {
      if (payload[k] !== undefined) payload[k] = Number(payload[k] || 0);
    });
    if (payload.logType && payload.logType !== 'maintenance') {
      payload.maintenanceStatus = 'pending';
      payload.maintenanceCompletedAt = null;
      payload.maintenanceCompletedById = null;
      payload.maintenanceCompletedByName = '';
    }
    if (payload.maintenanceStatus !== undefined) {
      const nextStatus = String(payload.maintenanceStatus || 'pending').toLowerCase() === 'completed' ? 'completed' : 'pending';
      payload.maintenanceStatus = nextStatus;
      if (nextStatus === 'completed') {
        payload.maintenanceCompletedAt = payload.maintenanceCompletedAt || new Date();
        payload.maintenanceCompletedById = req.user.id !== 'super-admin' ? req.user.id : null;
        payload.maintenanceCompletedByName = req.user.name || req.user.username || 'User';
      } else {
        payload.maintenanceCompletedAt = null;
        payload.maintenanceCompletedById = null;
        payload.maintenanceCompletedByName = '';
      }
    }
    const updated = await FarmTreeLog.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    return res.status(200).json({ success: true, row: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetMaintenanceTasks(req, res) {
  try {
    const query = { logType: 'maintenance' };
    if (req.user.role !== 'admin') {
      const allowed = Array.from(userAllowedFarmBlocks(req));
      query.blockId = { $in: allowed };
    }
    const [treeRows, blockRows] = await Promise.all([
      FarmTreeLog.find(query).sort({ createdAt: -1 }),
      FarmBlockLog.find(query).sort({ createdAt: -1 }),
    ]);
    const rows = [
      ...treeRows.map((r) => ({ ...r.toObject(), sourceType: 'tree' })),
      ...blockRows.map((r) => ({
        ...r.toObject(),
        sourceType: 'block',
        treeCode: '',
        treeId: '',
        maintenanceJob: r.details || 'Block maintenance',
      })),
    ].sort((a, b) => new Date(a.createdAt || a.logDate) - new Date(b.createdAt || b.logDate));
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCompleteMaintenanceTask(req, res) {
  try {
    const { id } = req.params;
    let row = await FarmTreeLog.findById(id);
    let modelType = 'tree';
    if (!row) {
      row = await FarmBlockLog.findById(id);
      modelType = 'block';
    }
    if (!row) return res.status(404).json({ message: 'Task not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this task' });
    row.maintenanceStatus = 'completed';
    row.maintenanceCompletedAt = new Date();
    row.maintenanceCompletedById = req.user.id !== 'super-admin' ? req.user.id : null;
    row.maintenanceCompletedByName = req.user.name || req.user.username || 'User';
    await row.save();
    return res.status(200).json({ success: true, row, modelType });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmTreeLog(req, res) {
  try {
    const { id } = req.params;
    const row = await FarmTreeLog.findById(id);
    if (!row) return res.status(404).json({ message: 'Log not found' });
    if (!canAccessFarmBlock(req, row.blockId)) return res.status(403).json({ message: 'Access denied for this log' });
    await FarmTreeLog.findByIdAndDelete(id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmBlockLogs(req, res) {
  try {
    const { blockId } = req.query;
    if (!blockId) return res.status(400).json({ message: 'blockId is required' });
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const rows = await FarmBlockLog.find({ blockId }).sort({ logDate: -1, createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmBlockLog(req, res) {
  try {
    const { blockId, logType, logDate, quantity = 0, unit = '', details = '' } = req.body || {};
    if (!blockId || !logType) return res.status(400).json({ message: 'Block and log type are required' });
    if (!canAccessFarmBlock(req, blockId)) return res.status(403).json({ message: 'Access denied for this block' });
    const block = await FarmBlock.findById(blockId);
    if (!block) return res.status(404).json({ message: 'Block not found' });
    const row = await FarmBlockLog.create({
      blockId: block._id,
      blockName: block.name,
      blockCode: block.code,
      logType: String(logType).trim().toLowerCase(),
      logDate: logDate ? new Date(logDate) : new Date(),
      year: Number(String(logDate || new Date().toISOString().slice(0, 10)).slice(0, 4)),
      quantity: Number(quantity || 0),
      unit: String(unit || '').trim(),
      details: String(details || '').trim(),
      maintenanceStatus: String(logType).toLowerCase() === 'maintenance' ? 'pending' : 'completed',
      createdById: req.user.id !== 'super-admin' ? req.user.id : null,
      createdByName: req.user.name || req.user.username || 'User',
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmBlockDetails(req, res) {
  try {
    const { blockId, blockName, blockQr } = req.query || {};
    let block = null;
    if (blockId) block = await FarmBlock.findById(blockId);
    if (!block && blockName) block = await FarmBlock.findOne({ name: new RegExp(`^${String(blockName).trim()}$`, 'i') });
    if (!block && blockQr) {
      const qr = String(blockQr).trim().toUpperCase();
      block = await FarmBlock.findOne({ $or: [{ code: qr }, { name: new RegExp(`^${qr}$`, 'i') }] });
    }
    if (!block) return res.status(404).json({ message: 'Block not found' });
    if (!canAccessFarmBlock(req, block._id)) return res.status(403).json({ message: 'Access denied for this block' });

    const [trees, treeLogs, blockLogs] = await Promise.all([
      FarmTree.find({ blockId: block._id }).sort({ rowNumber: 1, rowTreeNumber: 1, treeCode: 1 }),
      FarmTreeLog.find({ blockId: block._id }).sort({ logDate: -1 }),
      FarmBlockLog.find({ blockId: block._id }).sort({ logDate: -1 }),
    ]);

    const annualTreeProduction = {};
    const annualTreeFertilizer = {};
    const annualTreeIrrigation = {};
    const annualTreePesticide = {};
    const annualTreeMaintenancePending = {};
    const annualTreeMaintenanceCompleted = {};
    treeLogs.forEach((l) => {
      const y = String(l.year || new Date(l.logDate || l.createdAt).getFullYear());
      if (!annualTreeProduction[y]) annualTreeProduction[y] = 0;
      if (!annualTreeFertilizer[y]) annualTreeFertilizer[y] = 0;
      if (!annualTreeIrrigation[y]) annualTreeIrrigation[y] = 0;
      if (!annualTreePesticide[y]) annualTreePesticide[y] = 0;
      if (!annualTreeMaintenancePending[y]) annualTreeMaintenancePending[y] = 0;
      if (!annualTreeMaintenanceCompleted[y]) annualTreeMaintenanceCompleted[y] = 0;
      if (['production', 'harvest'].includes(l.logType)) annualTreeProduction[y] += Number(l.quantity || 0);
      if (l.logType === 'fertilizer') annualTreeFertilizer[y] += Number(l.fertilizerQuantity || l.quantity || 0);
      if (['irrigation', 'watering'].includes(l.logType)) annualTreeIrrigation[y] += 1;
      if (l.logType === 'disease') annualTreePesticide[y] += 1;
      if (l.logType === 'maintenance') {
        if ((l.maintenanceStatus || 'pending') === 'completed') annualTreeMaintenanceCompleted[y] += 1;
        else annualTreeMaintenancePending[y] += 1;
      }
    });

    const annualBlockProduction = {};
    const annualBlockFertilizer = {};
    const annualBlockIrrigation = {};
    const annualBlockPesticide = {};
    const annualBlockMaintenancePending = {};
    const annualBlockMaintenanceCompleted = {};
    blockLogs.forEach((l) => {
      const y = String(l.year || new Date(l.logDate || l.createdAt).getFullYear());
      if (!annualBlockProduction[y]) annualBlockProduction[y] = 0;
      if (!annualBlockFertilizer[y]) annualBlockFertilizer[y] = 0;
      if (!annualBlockIrrigation[y]) annualBlockIrrigation[y] = 0;
      if (!annualBlockPesticide[y]) annualBlockPesticide[y] = 0;
      if (!annualBlockMaintenancePending[y]) annualBlockMaintenancePending[y] = 0;
      if (!annualBlockMaintenanceCompleted[y]) annualBlockMaintenanceCompleted[y] = 0;
      if (l.logType === 'production') annualBlockProduction[y] += Number(l.quantity || 0);
      if (l.logType === 'fertilizer') annualBlockFertilizer[y] += Number(l.quantity || 0);
      if (l.logType === 'irrigation') annualBlockIrrigation[y] += 1;
      if (l.logType === 'pesticide') annualBlockPesticide[y] += 1;
      if (l.logType === 'maintenance') {
        if ((l.maintenanceStatus || 'pending') === 'completed') annualBlockMaintenanceCompleted[y] += 1;
        else annualBlockMaintenancePending[y] += 1;
      }
    });

    const years = [...new Set([
      ...Object.keys(annualTreeProduction),
      ...Object.keys(annualBlockProduction),
      ...Object.keys(annualTreeFertilizer),
      ...Object.keys(annualBlockFertilizer),
    ])].sort((a, b) => Number(b) - Number(a));

    const annualSummary = years.map((year) => ({
      year: Number(year),
      productionQty: Number((annualTreeProduction[year] || 0) + (annualBlockProduction[year] || 0)),
      fertilizerApplied: Number((annualTreeFertilizer[year] || 0) + (annualBlockFertilizer[year] || 0)),
      irrigationCycles: Number((annualTreeIrrigation[year] || 0) + (annualBlockIrrigation[year] || 0)),
      pesticideApplications: Number((annualTreePesticide[year] || 0) + (annualBlockPesticide[year] || 0)),
      maintenancePending: Number((annualTreeMaintenancePending[year] || 0) + (annualBlockMaintenancePending[year] || 0)),
      maintenanceCompleted: Number((annualTreeMaintenanceCompleted[year] || 0) + (annualBlockMaintenanceCompleted[year] || 0)),
    }));

    const treeById = new Map(trees.map((t) => [String(t._id), t]));
    const treeSummaryMap = {};
    const treeUpcomingMaintenance = {};
    treeLogs.forEach((l) => {
      const tid = String(l.treeId);
      if (!treeSummaryMap[tid]) treeSummaryMap[tid] = {};
      const y = String(l.year || new Date(l.logDate || l.createdAt).getFullYear());
      if (!treeSummaryMap[tid][y]) treeSummaryMap[tid][y] = { productionQty: 0, fertilizerApplied: 0, irrigationCycles: 0, pesticideApplications: 0 };
      if (['production', 'harvest'].includes(l.logType)) treeSummaryMap[tid][y].productionQty += Number(l.quantity || 0);
      if (l.logType === 'fertilizer') treeSummaryMap[tid][y].fertilizerApplied += Number(l.fertilizerQuantity || l.quantity || 0);
      if (['irrigation', 'watering'].includes(l.logType)) treeSummaryMap[tid][y].irrigationCycles += 1;
      if (l.logType === 'disease') treeSummaryMap[tid][y].pesticideApplications += 1;
      if (l.logType === 'maintenance' && (l.maintenanceStatus || 'pending') !== 'completed') {
        if (!treeUpcomingMaintenance[tid]) treeUpcomingMaintenance[tid] = [];
        treeUpcomingMaintenance[tid].push({
          _id: l._id,
          task: l.maintenanceJob || l.remarks || 'Maintenance',
          logDate: l.logDate,
          remarks: l.remarks || '',
        });
      }
    });

    const treeCards = trees.map((t) => ({
      ...t.toObject(),
      yearlySummary: treeSummaryMap[String(t._id)] || {},
      upcomingMaintenance: (treeUpcomingMaintenance[String(t._id)] || []).sort((a, b) => new Date(a.logDate) - new Date(b.logDate)),
    }));

    return res.status(200).json({
      block,
      annualSummary,
      blockLogs,
      trees: treeCards,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleFarmDashboardSummary(req, res) {
  try {
    const treesQuery = {};
    const logsMatch = {};
    if (req.user.role !== 'admin') {
      const allowed = Array.from(userAllowedFarmBlocks(req));
      treesQuery.blockId = { $in: allowed };
      logsMatch.blockId = { $in: allowed };
    }

    const [treesTotal, treesByBlock, treesByVariety, productionByYearBlock, productionByYearVariety, gradeTotals] = await Promise.all([
      FarmTree.countDocuments(treesQuery),
      FarmTree.aggregate([
        { $match: treesQuery },
        { $group: { _id: '$blockId', blockName: { $first: '$blockName' }, treeCount: { $sum: 1 } } },
        { $sort: { blockName: 1 } },
      ]),
      FarmTree.aggregate([
        { $match: treesQuery },
        {
          $project: {
            varieties: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$varieties', []] } }, 0] },
                '$varieties',
                ['Unspecified'],
              ],
            },
          },
        },
        { $unwind: '$varieties' },
        { $group: { _id: '$varieties', treeCount: { $sum: 1 } } },
        { $project: { _id: 0, variety: '$_id', treeCount: 1 } },
        { $sort: { variety: 1 } },
      ]),
      FarmTreeLog.aggregate([
        { $match: { ...logsMatch, logType: { $in: ['production', 'harvest'] } } },
        {
          $group: {
            _id: { year: '$year', blockId: '$blockId', blockName: '$blockName' },
            quantity: { $sum: { $ifNull: ['$quantity', 0] } },
            gradeA: { $sum: { $ifNull: ['$gradeA', 0] } },
            gradeB: { $sum: { $ifNull: ['$gradeB', 0] } },
            gradeC: { $sum: { $ifNull: ['$gradeC', 0] } },
            gradeD: { $sum: { $ifNull: ['$gradeD', 0] } },
          },
        },
        { $sort: { '_id.year': -1, '_id.blockName': 1 } },
      ]),
      FarmTreeLog.aggregate([
        { $match: { ...logsMatch, logType: { $in: ['production', 'harvest'] } } },
        {
          $lookup: {
            from: 'farmtrees',
            localField: 'treeId',
            foreignField: '_id',
            as: 'tree',
          },
        },
        {
          $addFields: {
            treeVarieties: {
              $cond: [
                { $gt: [{ $size: { $ifNull: [{ $arrayElemAt: ['$tree.varieties', 0] }, []] } }, 0] },
                { $arrayElemAt: ['$tree.varieties', 0] },
                ['Unspecified'],
              ],
            },
          },
        },
        { $unwind: '$treeVarieties' },
        {
          $group: {
            _id: { year: '$year', variety: '$treeVarieties' },
            quantity: { $sum: { $ifNull: ['$quantity', 0] } },
            gradeA: { $sum: { $ifNull: ['$gradeA', 0] } },
            gradeB: { $sum: { $ifNull: ['$gradeB', 0] } },
            gradeC: { $sum: { $ifNull: ['$gradeC', 0] } },
            gradeD: { $sum: { $ifNull: ['$gradeD', 0] } },
          },
        },
        { $sort: { '_id.year': -1, '_id.variety': 1 } },
      ]),
      FarmTreeLog.aggregate([
        { $match: logsMatch },
        {
          $group: {
            _id: null,
            gradeA: { $sum: { $ifNull: ['$gradeA', 0] } },
            gradeB: { $sum: { $ifNull: ['$gradeB', 0] } },
            gradeC: { $sum: { $ifNull: ['$gradeC', 0] } },
            gradeD: { $sum: { $ifNull: ['$gradeD', 0] } },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      treesTotal,
      treesByBlock,
      productionByYearBlock: productionByYearBlock.map((r) => ({
        year: r._id.year,
        blockId: r._id.blockId,
        blockName: r._id.blockName,
        quantity: r.quantity || 0,
        gradeA: r.gradeA || 0,
        gradeB: r.gradeB || 0,
        gradeC: r.gradeC || 0,
        gradeD: r.gradeD || 0,
      })),
      treesByVariety,
      productionByYearVariety: productionByYearVariety.map((r) => ({
        year: r._id.year,
        variety: r._id.variety || 'Unspecified',
        quantity: r.quantity || 0,
        gradeA: r.gradeA || 0,
        gradeB: r.gradeB || 0,
        gradeC: r.gradeC || 0,
        gradeD: r.gradeD || 0,
      })),
      gradeTotals: gradeTotals?.[0] || { gradeA: 0, gradeB: 0, gradeC: 0, gradeD: 0 },
    });
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
      statusTimeline: {
        placedAt: new Date(),
      },
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
    handleGetHumanChallenge,
    handleForgotPassword,
    handleResetPassword,
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
    handleGetFarmBlocks,
    handleCreateFarmBlock,
    handleUpdateFarmBlock,
    handleDeleteFarmBlock,
    handleGetFarmClusters,
    handleCreateFarmCluster,
    handleUpdateFarmCluster,
    handleDeleteFarmCluster,
    handleGetFarmBlocksByCluster,
    handleAssignFarmBlockToCluster,
    handleMoveFarmBlockInCluster,
    handleAdjustFarmClusterGrid,
    handleGetFarmVarieties,
    handleCreateFarmVariety,
    handleUpdateFarmVariety,
    handleDeleteFarmVariety,
    handleGetFarmTrees,
    handleGetFarmTreeById,
    handleCreateFarmTree,
    handleUpdateFarmTree,
    handleDeleteFarmTree,
    handleGenerateFarmTrees,
    handleMoveFarmTree,
    handleAutoCreateFarmTreeAtSlot,
    handleAdjustFarmTreeGrid,
    handleGetFarmTreeLogs,
    handleCreateFarmTreeLog,
    handleUpdateFarmTreeLog,
    handleDeleteFarmTreeLog,
    handleGetMaintenanceTasks,
    handleCompleteMaintenanceTask,
    handleGetFarmBlockDetails,
    handleGetFarmBlockLogs,
    handleCreateFarmBlockLog,
    handleFarmDashboardSummary,
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

