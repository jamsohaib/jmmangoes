const { request } = require('https');
const LocalStorage = require('node-localstorage').LocalStorage;
localStorage = new LocalStorage('./scratch');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');




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
const CompanyCashDeposit = require('../model/CompanyCashDepositSchema');
const OrderAlertEmail = require('../model/OrderAlertEmailSchema');
const Courier = require('../model/CourierSchema');
const PaymentMethod = require('../model/PaymentMethodSchema');
const FarmBlock = require('../model/FarmBlockSchema');
const FarmCluster = require('../model/FarmClusterSchema');
const FarmVariety = require('../model/FarmVarietySchema');
const FarmTree = require('../model/FarmTreeSchema');
const FarmTreeLog = require('../model/FarmTreeLogSchema');
const FarmBlockLog = require('../model/FarmBlockLogSchema');
const FarmExpenseHead = require('../model/FarmExpenseHeadSchema');
const FarmExpenseItem = require('../model/FarmExpenseItemSchema');
const FarmExpenseEntry = require('../model/FarmExpenseEntrySchema');
const FinancialYear = require('../model/FinancialYearSchema');
const FarmHRStaff = require('../model/FarmHRStaffSchema');
const FarmHRPayment = require('../model/FarmHRPaymentSchema');
const FarmUsherSetting = require('../model/FarmUsherSettingSchema');
const FarmUsherEntry = require('../model/FarmUsherEntrySchema');
const FarmUsherBeneficiary = require('../model/FarmUsherBeneficiarySchema');
const ActionLog = require('../model/ActionLogSchema');
const Warehouse = require('../model/WarehouseSchema');
const Wholeseller = require('../model/WholesellerSchema');
const StockLot = require('../model/StockLotSchema');
const StockLedger = require('../model/StockLedgerSchema');
const StockTransfer = require('../model/StockTransferSchema');
const OrderStockRequest = require('../model/OrderStockRequestSchema');
const WhatsAppEvent = require('../model/WhatsAppEventSchema');
const GiftSource = require('../model/GiftSourceSchema');
const Owner = require('../model/OwnerSchema');
const { sendMail } = require('../services/mailer');
const { sendWhatsAppMessage } = require('../services/whatsappService');
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

function normalizeEntityType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['site', 'warehouse', 'wholeseller', 'online'].includes(v)) return v;
  return '';
}

async function resolveEntity(type, id, { allowOnlineName = false } = {}) {
  const normalized = normalizeEntityType(type);
  if (!normalized) return null;
  if (normalized === 'online') {
    const onlineSite = await ensureOnlineSite();
    return { type: 'online', id: onlineSite._id, name: allowOnlineName ? 'online' : onlineSite.name };
  }
  if (!id) return null;
  if (normalized === 'site') {
    const doc = await Site.findById(id).select('name');
    if (!doc) return null;
    return { type: normalized, id: doc._id, name: doc.name };
  }
  if (normalized === 'warehouse') {
    const doc = await Warehouse.findById(id).select('name');
    if (!doc) return null;
    return { type: normalized, id: doc._id, name: doc.name };
  }
  if (normalized === 'wholeseller') {
    const doc = await Wholeseller.findById(id).select('name');
    if (!doc) return null;
    return { type: normalized, id: doc._id, name: doc.name };
  }
  return null;
}

function userCanAccessEntity(req, type, id) {
  if (req.user?.role === 'admin') return true;
  const normalized = normalizeEntityType(type);
  if (normalized === 'online') {
    const allowedSet = new Set((req.user?.siteAccess || []).map(String));
    return allowedSet.has(String(id));
  }
  if (normalized === 'site') {
    const allowedSet = new Set((req.user?.siteAccess || []).map(String));
    return allowedSet.has(String(id));
  }
  if (normalized === 'warehouse') {
    const allowedSet = new Set((req.user?.warehouseAccess || []).map(String));
    return allowedSet.has(String(id));
  }
  if (normalized === 'wholeseller') {
    const allowedSet = new Set((req.user?.wholesellerAccess || []).map(String));
    return allowedSet.has(String(id));
  }
  return false;
}

async function createStockLedgerRow(payload) {
  return StockLedger.create({
    ...payload,
    amount: Number(payload.quantity || 0) * Number(payload.unitCost || 0),
  });
}

function makeTransferNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `TRF-${y}${m}${d}-${rand}`;
}

function formatDDMMYYYY(date = new Date()) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear());
  return `${d}${m}${y}`;
}

function toLotSafeProductName(name = '') {
  return String(name || 'Product')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Product';
}

async function makeSimpleLotCode(productName, quantity) {
  const safeProduct = toLotSafeProductName(productName);
  const datePart = formatDDMMYYYY(new Date());
  const qtyPart = Number(quantity || 0);
  const prefix = `${safeProduct}_${datePart}_${qtyPart}`;
  const existingCount = await StockLot.countDocuments({ lotCode: { $regex: `^${prefix}_` } });
  const serial = existingCount + 1;
  return `${prefix}_${serial}`;
}

function productHasSiteAssignment(product, siteId, siteName = '') {
  return productHasHolderAssignment(product, 'site', siteId, siteName);
}

function productHasHolderAssignment(product, holderType, holderId, holderName = '') {
  const normalizedType = normalizeEntityType(holderType) || 'site';
  const holderIdStr = String(holderId || '');
  const holderNameNorm = String(holderName || '').trim().toLowerCase();
  const locationPrices = Array.isArray(product?.locationPrices) ? product.locationPrices : [];
  return locationPrices.some((lp) => {
    const lpType = normalizeEntityType(lp.holderType) || 'site';
    const lpId = String(lp.holderId || lp.siteId || '');
    const lpName = String(lp.holderName || lp.siteName || '').trim().toLowerCase();
    return lpType === normalizedType && (lpId === holderIdStr || (holderNameNorm && lpName === holderNameNorm));
  });
}

function getProductSitePrice(product, siteId, fallbackPrice = 0) {
  return getProductHolderPrice(product, 'site', siteId, fallbackPrice);
}

function getProductHolderPrice(product, holderType, holderId, fallbackPrice = 0) {
  const normalizedType = normalizeEntityType(holderType) || 'site';
  const holderIdStr = String(holderId || '');
  const locationPrices = Array.isArray(product?.locationPrices) ? product.locationPrices : [];
  const lp = locationPrices.find((x) => (normalizeEntityType(x.holderType) || 'site') === normalizedType && String(x.holderId || x.siteId || '') === holderIdStr);
  if (lp && Number.isFinite(Number(lp.price))) return Number(lp.price);
  return Number(fallbackPrice || product?.price || 0);
}


async function getSiteProductAvailableQty(siteId, productId) {
  return getHolderProductAvailableQty('site', siteId, productId);
}

async function getHolderProductAvailableQty(holderType, holderId, productId) {
  const rows = await StockLot.find({
    holderType: normalizeEntityType(holderType),
    holderId,
    productId,
    quantityAvailable: { $gt: 0 },
  }).select('quantityAvailable');
  return rows.reduce((sum, r) => sum + Number(r.quantityAvailable || 0), 0);
}

async function consumeHolderProductLots(holderType, holderId, productId, qty) {
  let remaining = Number(qty || 0);
  const touched = [];
  const lots = await StockLot.find({
    holderType: normalizeEntityType(holderType),
    holderId,
    productId,
    quantityAvailable: { $gt: 0 },
  }).sort({ receivedAt: 1, createdAt: 1 });

  const available = lots.reduce((sum, l) => sum + Number(l.quantityAvailable || 0), 0);
  if (available < remaining) return { ok: false, available, touched: [] };

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(Number(lot.quantityAvailable || 0), remaining);
    if (take <= 0) continue;
    lot.quantityAvailable = Number(lot.quantityAvailable || 0) - take;
    await lot.save();
    touched.push({ lotId: lot._id, lotCode: lot.lotCode, qty: take, unitCost: Number(lot.unitCost || 0) });
    remaining -= take;
  }
  return { ok: true, available, touched };
}

async function consumeSiteProductLots(siteId, productId, qty) {
  return consumeHolderProductLots('site', siteId, productId, qty);
}

async function addSiteProductReturnLot(siteId, siteName, product, qty, unitCost = 0) {
  return addHolderProductReturnLot('site', siteId, siteName, product, qty, unitCost);
}

async function addHolderProductReturnLot(holderType, holderId, holderName, product, qty, unitCost = 0) {
  const lotCode = await makeSimpleLotCode(product?.name || 'Product', Number(qty || 0));
  return StockLot.create({
    holderType: normalizeEntityType(holderType),
    holderId,
    holderName,
    productId: product._id,
    productName: product.name,
    lotCode,
    quantityInitial: Number(qty || 0),
    quantityAvailable: Number(qty || 0),
    unitCost: Number(unitCost || 0),
    sourceRefType: 'sale_return',
    sourceRefId: null,
    notes: 'Sale return',
  });
}

async function getSiteProductAvailableQtyByName(siteId, productName) {
  const rows = await StockLot.find({
    holderType: 'site',
    holderId: siteId,
    productName,
    quantityAvailable: { $gt: 0 },
  }).select('quantityAvailable');
  return rows.reduce((sum, r) => sum + Number(r.quantityAvailable || 0), 0);
}

async function consumeHolderProductLotsByName(holderType, holderId, productName, qty) {
  let remaining = Number(qty || 0);
  const touched = [];
  const normalizedHolderType = normalizeEntityType(holderType);
  const lots = await StockLot.find({
    holderType: normalizedHolderType,
    holderId,
    productName,
    quantityAvailable: { $gt: 0 },
  }).sort({ receivedAt: 1, createdAt: 1 });
  const available = lots.reduce((sum, l) => sum + Number(l.quantityAvailable || 0), 0);
  if (available < remaining) return { ok: false, available, touched: [] };
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(Number(lot.quantityAvailable || 0), remaining);
    if (take <= 0) continue;
    lot.quantityAvailable = Number(lot.quantityAvailable || 0) - take;
    await lot.save();
    touched.push({ lotId: lot._id, lotCode: lot.lotCode, qty: take, unitCost: Number(lot.unitCost || 0), productName: lot.productName, productId: lot.productId });
    remaining -= take;
  }
  return { ok: true, available, touched };
}

async function consumeSiteProductLotsByName(siteId, productName, qty) {
  return consumeHolderProductLotsByName('site', siteId, productName, qty);
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

async function recordAction(req, { action, module = '', entityType = '', entityId = null, entityLabel = '', details = {} }) {
  try {
    await ActionLog.create({
      action,
      module,
      entityType,
      entityId,
      entityLabel,
      details,
      performedBy: req.user?.id === 'super-admin' ? null : req.user?.id || req.user?._id || null,
      performedByName: req.user?.name || req.user?.username || 'User',
      performedByRole: req.user?.role || '',
    });
  } catch (err) {
    logger.warn('Failed to record action log', { error: err?.message || String(err), action, module });
  }
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
  const rows = await Order.find({ orderNumber: { $regex: '^JMM-[A-Z][0-9]{3}$' } })
    .select('orderNumber');

  if (!rows.length) return 'JMM-A001';

  const parsed = rows
    .map((r) => {
      const m = String(r.orderNumber || '').match(/^JMM-([A-Z])([0-9]{3})$/);
      if (!m) return null;
      return {
        letterIdx: m[1].charCodeAt(0) - 65,
        number: Number(m[2]),
      };
    })
    .filter(Boolean);

  if (!parsed.length) return 'JMM-A001';

  const max = parsed.reduce((best, cur) => {
    if (!best) return cur;
    if (cur.letterIdx > best.letterIdx) return cur;
    if (cur.letterIdx === best.letterIdx && cur.number > best.number) return cur;
    return best;
  }, null);

  let nextLetterIdx = max.letterIdx;
  let nextNum = max.number + 1;
  if (nextNum > 999) {
    nextLetterIdx += 1;
    nextNum = 1;
  }

  if (nextLetterIdx > 25) {
    // Fallback guard after Z999
    const rand = Math.floor(100 + Math.random() * 900);
    return `JMM-Z${String(rand).padStart(3, '0')}`;
  }

  const letter = String.fromCharCode(65 + nextLetterIdx);
  return `JMM-${letter}${String(nextNum).padStart(3, '0')}`;
}

async function sendOrderAlertEmails(subject, text, customerEmail, html = '') {
  const recipients = await OrderAlertEmail.find({ isActive: true }).select('email');
  const emails = recipients.map((r) => r.email).filter(Boolean);
  const unique = Array.from(new Set([...(customerEmail ? [customerEmail] : []), ...emails]));
  if (!unique.length) return;
  await sendMail({ to: unique.join(','), subject, text, html });
}

async function sendOrderStockRequestEmailsForSite(siteId, subject, text, html = '') {
  const fallbackEmail = 'engr.dr.ahmed.sohaib@gmail.com';
  const users = await userDetails.find({
    isActive: true,
    siteAccess: siteId,
  }).select('email permissions');
  const recipients = users
    .filter((u) => !!u?.permissions?.stockTransfer?.manage)
    .map((u) => String(u.email || '').trim().toLowerCase())
    .filter(Boolean);
  const finalRecipients = recipients.length ? Array.from(new Set(recipients)) : [fallbackEmail];
  await sendMail({ to: finalRecipients.join(','), subject, text, html });
}

async function getStockTransferRecipientsByEntity(entityType, entityId) {
  const fallbackEmail = 'engr.dr.ahmed.sohaib@gmail.com';
  const normalized = normalizeEntityType(entityType);
  if (!normalized || !entityId) return [fallbackEmail];

  const baseQuery = { isActive: true, 'permissions.stockTransfer.manage': true };
  if (normalized === 'site' || normalized === 'online') {
    baseQuery.siteAccess = entityId;
  } else if (normalized === 'warehouse') {
    baseQuery.warehouseAccess = entityId;
  } else if (normalized === 'wholeseller') {
    baseQuery.wholesellerAccess = entityId;
  }

  const users = await userDetails.find(baseQuery).select('email');
  const emails = users
    .map((u) => String(u.email || '').trim().toLowerCase())
    .filter(Boolean);
  return emails.length ? Array.from(new Set(emails)) : [fallbackEmail];
}

async function notifyStockTransferEntity(entityType, entityId, { subject, text, html = '' }) {
  const recipients = await getStockTransferRecipientsByEntity(entityType, entityId);
  if (!recipients.length) return;
  await sendMail({ to: recipients.join(','), subject, text, html });
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
          warehouseAccess: [],
          wholesellerAccess: [],
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
          warehouseAccess: [],
          wholesellerAccess: [],
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

    // Keep the cookie token small and rehydrate permissions from DB in auth middleware.
    const token = jwt.sign(
      {
        id: String(user._id),
        role: user.role,
        name: user.name,
        username: user.username,
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
        id: String(user._id),
        email: user.email,
        username: user.username,
        role: user.role,
        name : user.name,
        permissions: user.permissions || {},
        siteAccess: (user.siteAccess || []).map((s) => String(s)),
        warehouseAccess: (user.warehouseAccess || []).map((w) => String(w)),
        wholesellerAccess: (user.wholesellerAccess || []).map((w) => String(w)),
        farmBlockAccess: (user.farmBlockAccess || []).map((b) => String(b)),
        isFarmUser: !!user.isFarmUser,
        isSalesUser: !!user.isSalesUser,
      }
    });
  } catch (err) {
    logger.error('Login error after credential check', { error: err?.message || String(err), username });
    res.status(500).json({ message: 'Login failed. Please contact admin if this continues.' });
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
    const { name, description, price, weight, imageUrl, category, locationPrices = [], productChannel = 'website' } = req.body;
    const onlineSite = await ensureOnlineSite();
    const normalizedLocationPrices = Array.isArray(locationPrices)
      ? locationPrices
          .filter((lp) => lp && (lp.holderId || lp.siteId) && (lp.holderName || lp.siteName) && typeof lp.price === 'number')
          .map((lp) => ({
            siteId: lp.siteId || (lp.holderType === 'site' || lp.holderType === 'online' ? lp.holderId : null),
            siteName: String(lp.siteName || lp.holderName || '').trim(),
            holderType: normalizeEntityType(lp.holderType) || 'site',
            holderId: lp.holderId || lp.siteId,
            holderName: String(lp.holderName || lp.siteName || '').trim(),
            price: lp.price,
          }))
      : [];

    const onlineExisting = normalizedLocationPrices.find((lp) => lp.siteName.toLowerCase() === 'online');
    if (productChannel === 'website' && !onlineExisting && typeof price === 'number') {
      normalizedLocationPrices.push({
        siteId: onlineSite._id,
        siteName: 'online',
        holderType: 'site',
        holderId: onlineSite._id,
        holderName: 'online',
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
    let products = await Product.find({}).sort({ createdAt: -1 });
    if (req.user.role !== 'admin') {
      const allowed = req.user.siteAccess || [];
      const allowedSet = new Set(allowed.map(String));
      products = products.filter((product) => {
        return Array.from(allowedSet).some((siteId) => productHasSiteAssignment(product, siteId));
      });
    }
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

async function handleSession(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
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
  const { name, description, price, weight, imageUrl, category, productChannel } = req.body;
  try {
    const updated = await Product.findById(id);
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    updated.name = name;
    updated.description = description;
    updated.price = price;
    updated.weight = weight;
    updated.imageUrl = imageUrl;
    updated.category = category;
    updated.productChannel = productChannel;
    await updated.save();
    return res.status(200).json({ success: true, product: updated });
  } catch (err) {
    if (err?.code === 11000) {
      const dupField = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(400).json({ message: `${dupField} already exists` });
    }
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
    if (err?.code === 11000) {
      const dupField = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(400).json({ message: `${dupField} already exists` });
    }
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
  const { siteId, siteName, holderType = 'site', holderId = '', holderName = '', price } = req.body;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const normalizedType = normalizeEntityType(holderType) || 'site';
    const effectiveHolderId = holderId || siteId;
    const effectiveHolderName = String(holderName || siteName || '').trim();
    if (!effectiveHolderId || !effectiveHolderName) return res.status(400).json({ message: 'Holder is required' });

    const existingIndex = product.locationPrices.findIndex(
      (lp) => (normalizeEntityType(lp.holderType) || 'site') === normalizedType && String(lp.holderId || lp.siteId) === String(effectiveHolderId)
    );
    if (existingIndex >= 0) {
      product.locationPrices[existingIndex].price = Number(price);
      product.locationPrices[existingIndex].siteName = normalizedType === 'site' || normalizedType === 'online' ? effectiveHolderName : '';
      product.locationPrices[existingIndex].siteId = normalizedType === 'site' || normalizedType === 'online' ? effectiveHolderId : null;
      product.locationPrices[existingIndex].holderType = normalizedType;
      product.locationPrices[existingIndex].holderId = effectiveHolderId;
      product.locationPrices[existingIndex].holderName = effectiveHolderName;
    } else {
      product.locationPrices.push({
        siteId: normalizedType === 'site' || normalizedType === 'online' ? effectiveHolderId : null,
        siteName: normalizedType === 'site' || normalizedType === 'online' ? effectiveHolderName : '',
        holderType: normalizedType,
        holderId: effectiveHolderId,
        holderName: effectiveHolderName,
        price: Number(price),
      });
    }

    if (effectiveHolderName?.toLowerCase() === 'online') product.price = Number(price);
    await product.save();
    return res.status(200).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRemoveLocationPrice(req, res) {
  const { id } = req.params;
  const { siteId, holderType = 'site', holderId = '' } = req.body;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const normalizedType = normalizeEntityType(holderType) || 'site';
    const effectiveHolderId = holderId || siteId;
    product.locationPrices = product.locationPrices.filter((lp) => !(
      (normalizeEntityType(lp.holderType) || 'site') === normalizedType &&
      String(lp.holderId || lp.siteId) === String(effectiveHolderId)
    ));
    await product.save();
    return res.status(200).json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}


async function handleGetProductsForPublic(req,res){ 
  logger.debug("In handleGetProductsForPublic");

  try {
    const onlineSite = await ensureOnlineSite();
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    const filtered = products
      .filter((p) => productHasSiteAssignment(p, onlineSite._id, 'online'))
      .map((p) => {
        const onlinePrice = getProductSitePrice(p, onlineSite._id, p.price);
        const obj = p.toObject ? p.toObject() : p;
        return { ...obj, price: onlinePrice };
      });
    res.status(200).json(filtered);
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
    let warehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      sites = sites.filter((s) => allowedSet.has(String(s._id)));
      warehouses = warehouses.filter((w) => warehouseSet.has(String(w._id)));
    }
    return res.status(200).json([
      ...sites.map((s) => ({
        _id: `site:${s._id}`,
        holderType: 'site',
        holderId: s._id,
        name: s.name,
        label: `Sale Point / Site - ${s.name}`,
        isActive: s.isActive,
      })),
      ...warehouses.map((w) => ({
        _id: `warehouse:${w._id}`,
        holderType: 'warehouse',
        holderId: w._id,
        name: w.name,
        label: `Warehouse - ${w.name}`,
        isActive: w.isActive,
      })),
    ]);
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
      const items = products.filter((p) => productHasSiteAssignment(p, site._id, site.name));
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

async function handleStockStatusAll(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).select('name').sort({ name: 1 });
    let warehouses = await Warehouse.find({ isActive: true }).select('name code').sort({ name: 1 });
    let wholesellers = await Wholeseller.find({ isActive: true }).select('name code').sort({ name: 1 });

    if (req.user.role !== 'admin') {
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      const wholesellerSet = new Set((req.user.wholesellerAccess || []).map(String));
      sites = sites.filter((s) => siteSet.has(String(s._id)));
      warehouses = warehouses.filter((w) => warehouseSet.has(String(w._id)));
      wholesellers = wholesellers.filter((w) => wholesellerSet.has(String(w._id)));
    }

    const allLots = await StockLot.find({ quantityAvailable: { $gt: 0 } }).select('holderType holderId productId productName quantityAvailable');

    const buildHolderSummary = (holderTypeOrTypes, holders) => {
      const holderTypes = Array.isArray(holderTypeOrTypes) ? holderTypeOrTypes : [holderTypeOrTypes];
      return holders.map((h) => {
        const lots = allLots.filter(
          (l) =>
            holderTypes.includes(String(l.holderType)) &&
            String(l.holderId) === String(h._id)
        );
        const productMap = new Map();
        for (const lot of lots) {
          const key = String(lot.productId);
          if (!productMap.has(key)) {
            productMap.set(key, { productId: lot.productId, productName: lot.productName, quantity: 0 });
          }
          const row = productMap.get(key);
          row.quantity += Number(lot.quantityAvailable || 0);
        }
        const products = Array.from(productMap.values()).sort((a, b) => String(a.productName || '').localeCompare(String(b.productName || '')));
        const totalStock = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
        return {
          holderType: holderTypes.length > 1 ? holderTypes.join(',') : holderTypes[0],
          holderId: h._id,
          holderName: h.name,
          holderCode: h.code || '',
          totalStock,
          products,
        };
      });
    };

    return res.status(200).json({
      sites: buildHolderSummary(['site', 'online'], sites),
      warehouses: buildHolderSummary('warehouse', warehouses),
      wholesellers: buildHolderSummary('wholeseller', wholesellers),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockProducts(req, res) {
  try {
    const products = await Product.find({ isActive: { $ne: false } }).sort({ name: 1 });
    return res.status(200).json(products);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockHolders(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    let warehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 });
    let wholesellers = await Wholeseller.find({ isActive: true }).sort({ name: 1 });

    if (req.user.role !== 'admin') {
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      const wholesellerSet = new Set((req.user.wholesellerAccess || []).map(String));
      sites = sites.filter((s) => siteSet.has(String(s._id)));
      warehouses = warehouses.filter((w) => warehouseSet.has(String(w._id)));
      wholesellers = wholesellers.filter((w) => wholesellerSet.has(String(w._id)));
    }

    return res.status(200).json({ sites, warehouses, wholesellers });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockTransferHolders(req, res) {
  try {
    await ensureOnlineSite();
    const allSites = await Site.find({ isActive: true }).sort({ name: 1 });
    const allWarehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 });
    const allWholesellers = await Wholeseller.find({ isActive: true }).sort({ name: 1 });

    if (req.user.role === 'admin') {
      return res.status(200).json({
        source: { sites: allSites, warehouses: allWarehouses, wholesellers: allWholesellers },
        target: { sites: allSites, warehouses: allWarehouses, wholesellers: allWholesellers },
      });
    }

    const siteSet = new Set((req.user.siteAccess || []).map(String));
    const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
    const wholesellerSet = new Set((req.user.wholesellerAccess || []).map(String));

    const sourceSites = allSites.filter((s) => siteSet.has(String(s._id)));
    const sourceWarehouses = allWarehouses.filter((w) => warehouseSet.has(String(w._id)));
    const sourceWholesellers = allWholesellers.filter((w) => wholesellerSet.has(String(w._id)));

    return res.status(200).json({
      source: { sites: sourceSites, warehouses: sourceWarehouses, wholesellers: sourceWholesellers },
      target: { sites: allSites, warehouses: allWarehouses, wholesellers: allWholesellers },
    });
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

async function handleGetSaleHolders(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    let warehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 });
    if (req.user.role !== 'admin') {
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      sites = sites.filter((s) => siteSet.has(String(s._id)));
      warehouses = warehouses.filter((w) => warehouseSet.has(String(w._id)));
    }
    const rows = [
      ...sites.map((s) => ({
        _id: `site:${s._id}`,
        holderType: 'site',
        holderId: s._id,
        name: s.name,
        label: `Sale Point / Site - ${s.name}`,
        contactNumber: s.contactNumber || '',
      })),
      ...warehouses.map((w) => ({
        _id: `warehouse:${w._id}`,
        holderType: 'warehouse',
        holderId: w._id,
        name: w.name,
        label: `Warehouse - ${w.name}`,
      })),
    ];
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetSiteStock(req, res) {
  try {
    const { siteId, holderType = 'site', holderId = '' } = req.query;
    const resolvedHolderType = normalizeEntityType(holderType || 'site') || 'site';
    const resolvedHolderId = holderId || siteId;
    if (!resolvedHolderId) return res.status(400).json({ message: 'holderId is required' });
    const holder = await resolveEntity(resolvedHolderType, resolvedHolderId, { allowOnlineName: true });
    if (!holder) return res.status(404).json({ message: 'Holder not found' });
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });
    const products = await Product.find({ isActive: { $ne: false } }).sort({ name: 1 });
    const filtered = products.filter((p) => productHasHolderAssignment(p, holder.type, holder.id, holder.name));
    const mapped = await Promise.all(
      filtered.map(async (p) => {
        const qty = await getHolderProductAvailableQty(holder.type, holder.id, p._id);
        const obj = p.toObject ? p.toObject() : p;
        return {
          ...obj,
          price: getProductHolderPrice(p, holder.type, holder.id, p.price),
          quantity: qty,
        };
      })
    );
    return res.status(200).json(mapped.filter((p) => holder.type === 'site' || Number(p.quantity || 0) > 0));
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSalePointEntry(req, res) {
  try {
    const { siteId, holderType = 'site', holderId = '', productId, quantity, discountAmount = 0, priceIncreaseAmount = 0, date, paymentMethodId = '' } = req.body;
    const qty = Number(quantity);
    const discount = Number(discountAmount || 0);
    const priceIncrease = Number(priceIncreaseAmount || 0);
    const holder = await resolveEntity(holderType || 'site', holderId || siteId, { allowOnlineName: true });
    if (!holder || !productId || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Invalid sale entry data' });
    }
    if (Number.isNaN(discount) || discount < 0) {
      return res.status(400).json({ message: 'Invalid discount amount' });
    }
    if (Number.isNaN(priceIncrease) || priceIncrease < 0) {
      return res.status(400).json({ message: 'Invalid price increase amount' });
    }
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!productHasHolderAssignment(product, holder.type, holder.id, holder.name)) {
      return res.status(400).json({ message: 'Selected product is not assigned to this holder' });
    }
    const availableQty = await getHolderProductAvailableQty(holder.type, holder.id, product._id);
    if (availableQty < qty) {
      return res.status(400).json({ message: 'Insufficient stock available' });
    }

    const unitPrice = getProductHolderPrice(product, holder.type, holder.id, product.price);
    const grossAmount = unitPrice * qty;
    const netAmount = Math.max(0, grossAmount + priceIncrease - discount);
    let paymentMethod = { id: null, name: 'Cash Payment', code: 'cash_payment' };
    if (paymentMethodId && !['cash', 'cash_payment'].includes(String(paymentMethodId))) {
      const method = await PaymentMethod.findOne({ _id: paymentMethodId, isActive: true });
      if (!method) return res.status(400).json({ message: 'Selected payment method is not available' });
      paymentMethod = { id: method._id, name: method.name, code: method.code || '' };
    }

    await consumeHolderProductLots(holder.type, holder.id, product._id, qty);

    const entry = await SalePointEntry.create({
      siteId: holder.type === 'site' || holder.type === 'online' ? holder.id : null,
      siteName: holder.name,
      holderType: holder.type,
      holderId: holder.id,
      holderName: holder.name,
      productId: product._id,
      productName: product.name,
      date: date ? new Date(date) : new Date(),
      quantity: qty,
      unitPrice,
      grossAmount,
      priceIncreaseAmount: priceIncrease,
      discountAmount: discount,
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      paymentMethodCode: paymentMethod.code,
      netAmount,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || req.user.username || '',
    });

    return res.status(201).json({ success: true, entry, remainingStock: Math.max(0, availableQty - qty) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSaleCheckout(req, res) {
  try {
    const { siteId, holderType = 'site', holderId = '', date, items = [], customerName = '', customerWhatsapp = '', customerEmail = '', paymentMethodId = '' } = req.body;
    const holder = await resolveEntity(holderType || 'site', holderId || siteId, { allowOnlineName: true });
    if (!holder || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid sale checkout data' });
    }
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });

    const normalizedItems = items.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      discountAmount: Number(it.discountAmount || 0),
      priceIncreaseAmount: Number(it.priceIncreaseAmount || 0),
      isGift: Boolean(it.isGift),
      isPayLater: Boolean(it.isPayLater),
      giftSourceId: it.giftSourceId || null,
    }));
    const hasGiftItems = normalizedItems.some((it) => it.isGift);
    const hasPayLaterItems = normalizedItems.some((it) => it.isPayLater);
    const hasSaleItems = normalizedItems.some((it) => !it.isGift && !it.isPayLater);
    if (normalizedItems.some((it) => it.isGift && it.isPayLater)) {
      return res.status(400).json({ message: 'An item cannot be both gift and pay later' });
    }
    if (hasGiftItems && (!String(customerName || '').trim() || !String(customerWhatsapp || '').trim())) {
      return res.status(400).json({ message: 'Recipient name and contact number are required for gift items' });
    }
    if (hasPayLaterItems && (!String(customerName || '').trim() || !String(customerWhatsapp || '').trim())) {
      return res.status(400).json({ message: 'Customer name and contact number are required for pay later items' });
    }
    let paymentMethod = { id: null, name: 'Cash Payment', code: 'cash_payment' };
    if (hasSaleItems && paymentMethodId && !['cash', 'cash_payment'].includes(String(paymentMethodId))) {
      const method = await PaymentMethod.findOne({ _id: paymentMethodId, isActive: true });
      if (!method) return res.status(400).json({ message: 'Selected payment method is not available' });
      paymentMethod = { id: method._id, name: method.name, code: method.code || '' };
    }
    for (const it of normalizedItems) {
      if (
        !it.productId ||
        Number.isNaN(it.quantity) ||
        it.quantity <= 0 ||
        Number.isNaN(it.discountAmount) ||
        it.discountAmount < 0 ||
        Number.isNaN(it.priceIncreaseAmount) ||
        it.priceIncreaseAmount < 0
      ) {
        return res.status(400).json({ message: 'Invalid item in sale checkout' });
      }
      const product = await Product.findById(it.productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (!productHasHolderAssignment(product, holder.type, holder.id, holder.name)) {
        return res.status(400).json({ message: `Product "${product.name}" is not assigned to selected holder` });
      }
      if (it.isGift) {
        const source = await GiftSource.findById(it.giftSourceId);
        if (!source || !source.isActive) return res.status(400).json({ message: 'Active gifting source is required for gift items' });
        it.giftSourceName = source.name;
      }
      const availableQty = await getHolderProductAvailableQty(holder.type, holder.id, product._id);
      if (availableQty < it.quantity) {
        return res.status(400).json({ message: `Insufficient stock for "${product.name}"` });
      }
    }

    const createdEntries = [];
    let grossTotal = 0;
    let priceIncreaseTotal = 0;
    let discountTotal = 0;
    let netTotal = 0;
    for (const it of normalizedItems) {
      const product = await Product.findById(it.productId);
      const unitPrice = getProductHolderPrice(product, holder.type, holder.id, product.price);
      const grossAmount = it.isGift ? 0 : unitPrice * it.quantity;
      const linePriceIncrease = it.isGift ? 0 : it.priceIncreaseAmount;
      const lineDiscount = it.isGift ? 0 : it.discountAmount;
      const receivableAmount = it.isPayLater ? Math.max(0, grossAmount + linePriceIncrease - lineDiscount) : 0;
      const netAmount = it.isGift || it.isPayLater ? 0 : Math.max(0, grossAmount + linePriceIncrease - lineDiscount);

      await consumeHolderProductLots(holder.type, holder.id, product._id, it.quantity);

      const entry = await SalePointEntry.create({
        entryType: it.isGift ? 'gift' : it.isPayLater ? 'pay_later' : 'sale',
        siteId: holder.type === 'site' || holder.type === 'online' ? holder.id : null,
        siteName: holder.name,
        holderType: holder.type,
        holderId: holder.id,
        holderName: holder.name,
        productId: product._id,
        productName: product.name,
        date: date ? new Date(date) : new Date(),
        quantity: it.quantity,
        unitPrice,
        grossAmount,
        priceIncreaseAmount: linePriceIncrease,
        discountAmount: lineDiscount,
        receivableAmount,
        paymentStatus: it.isPayLater ? 'pending' : 'not_applicable',
        paymentMethodId: !it.isGift && !it.isPayLater ? paymentMethod.id : null,
        paymentMethodName: !it.isGift && !it.isPayLater ? paymentMethod.name : '',
        paymentMethodCode: !it.isGift && !it.isPayLater ? paymentMethod.code : '',
        giftSourceId: it.isGift ? it.giftSourceId : null,
        giftSourceName: it.isGift ? it.giftSourceName : '',
        netAmount,
        customerName: String(customerName || '').trim(),
        customerWhatsapp: String(customerWhatsapp || '').trim(),
        customerEmail: String(customerEmail || '').trim(),
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
      createdEntries.push(entry);
      grossTotal += grossAmount;
      priceIncreaseTotal += linePriceIncrease;
      discountTotal += lineDiscount;
      netTotal += netAmount;
    }

    return res.status(201).json({ success: true, entries: createdEntries, grossTotal, priceIncreaseTotal, discountTotal, netTotal });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateSaleReturn(req, res) {
  try {
    const { siteId, holderType = 'site', holderId = '', date, items = [], customerName = '', customerWhatsapp = '', customerEmail = '' } = req.body;
    const holder = await resolveEntity(holderType || 'site', holderId || siteId, { allowOnlineName: true });
    if (!holder || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid return data' });
    }
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });

    const createdEntries = [];
    for (const raw of items) {
      const quantity = Number(raw.quantity);
      const returnAmount = Number(raw.returnAmount);
      if (!raw.productId || Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(returnAmount) || returnAmount < 0) {
        return res.status(400).json({ message: 'Invalid item in return form' });
      }
      const product = await Product.findById(raw.productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (!productHasHolderAssignment(product, holder.type, holder.id, holder.name)) {
        return res.status(400).json({ message: `Product "${product.name}" is not assigned to selected holder` });
      }

      await addHolderProductReturnLot(holder.type, holder.id, holder.name, product, quantity, quantity > 0 ? returnAmount / quantity : 0);

      const entry = await SalePointEntry.create({
        entryType: 'return',
        siteId: holder.type === 'site' || holder.type === 'online' ? holder.id : null,
        siteName: holder.name,
        holderType: holder.type,
        holderId: holder.id,
        holderName: holder.name,
        productId: product._id,
        productName: product.name,
        date: date ? new Date(date) : new Date(),
        quantity,
        unitPrice: quantity > 0 ? returnAmount / quantity : getProductHolderPrice(product, holder.type, holder.id, product.price),
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
    const { siteId, holderType = '', holderId = '', date, dateFrom, dateTo, entryType = '' } = req.query;
    const query = {};
    const normalizedHolderType = normalizeEntityType(holderType);
    const effectiveHolderId = holderId || siteId;
    if (normalizedHolderType && effectiveHolderId) {
      if (normalizedHolderType === 'site') {
        query.$or = [
          { holderType: 'site', holderId: effectiveHolderId },
          { siteId: effectiveHolderId, holderType: { $exists: false } },
          { siteId: effectiveHolderId, holderType: 'site' },
        ];
      } else {
        query.holderType = normalizedHolderType;
        query.holderId = effectiveHolderId;
      }
    } else if (siteId) {
      query.siteId = siteId;
    }
    if (['sale', 'return', 'gift', 'pay_later'].includes(String(entryType))) query.entryType = entryType;
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
      if (normalizedHolderType && effectiveHolderId) {
        if (!userCanAccessEntity(req, normalizedHolderType, effectiveHolderId)) return res.status(403).json({ message: 'Holder access denied' });
      } else if (siteId) {
        const allowedSet = new Set((req.user.siteAccess || []).map(String));
        if (!allowedSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
      } else {
        const siteIds = Array.from(new Set((req.user.siteAccess || []).map(String)));
        const warehouseIds = Array.from(new Set((req.user.warehouseAccess || []).map(String)));
        query.$or = [
          { siteId: { $in: siteIds } },
          { holderType: 'site', holderId: { $in: siteIds } },
          { holderType: 'warehouse', holderId: { $in: warehouseIds } },
        ];
      }
    }

    const entries = await SalePointEntry.find(query).sort({ createdAt: -1 }).limit(200);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetGiftEntries(req, res) {
  try {
    const { siteId, dateFrom, dateTo } = req.query;
    const query = { entryType: 'gift' };
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
    const entries = await SalePointEntry.find(query).sort({ createdAt: -1 }).limit(1000);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetPayLaterEntries(req, res) {
  try {
    const { siteId, dateFrom, dateTo } = req.query;
    const query = {
      entryType: 'pay_later',
      paymentStatus: { $in: ['pending', 'paid'] },
      receivableAmount: { $gt: 0 },
    };
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
    const entries = await SalePointEntry.find(query).sort({ createdAt: -1 }).limit(1000);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteSalePointEntry(req, res) {
  try {
    const isSuperAdmin = req.user?.id === 'super-admin' || String(req.user?.username || '').toLowerCase() === 'admin';
    if (!isSuperAdmin) return res.status(403).json({ message: 'Only super admin can delete sale transactions' });

    const row = await SalePointEntry.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Sale transaction not found' });
    const rowHolderType = normalizeEntityType(row.holderType) || 'site';
    const rowHolderId = row.holderId || row.siteId;
    if (!userCanAccessEntity(req, rowHolderType, rowHolderId)) return res.status(403).json({ message: 'Holder access denied' });

    const product = await Product.findById(row.productId);
    const productRef = product || { _id: row.productId, name: row.productName };
    const qty = Number(row.quantity || 0);
    if (qty <= 0) return res.status(400).json({ message: 'Invalid transaction quantity' });

    if (row.entryType === 'return') {
      const consumed = await consumeHolderProductLots(rowHolderType, rowHolderId, row.productId, qty);
      if (!consumed.ok) {
        return res.status(400).json({ message: `Unable to delete return. Only ${consumed.available} stock available to reverse.` });
      }
      for (const lot of consumed.touched) {
        await createStockLedgerRow({
          movementType: 'out',
          holderType: rowHolderType,
          holderId: rowHolderId,
          holderName: row.holderName || row.siteName,
          productId: row.productId,
          productName: row.productName,
          lotId: lot.lotId,
          lotCode: lot.lotCode,
          quantity: -Math.abs(Number(lot.qty || 0)),
          unitCost: Number(lot.unitCost || 0),
          referenceType: 'sale_transaction_delete',
          referenceId: row._id,
          remarks: `Deleted return transaction for ${row.productName}`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || req.user.username || '',
        });
      }
    } else {
      const lot = await addHolderProductReturnLot(rowHolderType, rowHolderId, row.holderName || row.siteName, productRef, qty, Number(row.unitPrice || 0));
      await createStockLedgerRow({
        movementType: 'in',
        holderType: rowHolderType,
        holderId: rowHolderId,
        holderName: row.holderName || row.siteName,
        productId: row.productId,
        productName: row.productName,
        lotId: lot._id,
        lotCode: lot.lotCode,
        quantity: qty,
        unitCost: Number(row.unitPrice || 0),
        referenceType: 'sale_transaction_delete',
        referenceId: row._id,
        remarks: `Deleted ${row.entryType || 'sale'} transaction and restored stock`,
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
    }

    await SalePointEntry.deleteOne({ _id: row._id });
    await recordAction(req, {
      action: 'delete_sale_transaction',
      module: 'Sales',
      entityType: 'SalePointEntry',
      entityId: row._id,
      entityLabel: `${row.siteName} - ${row.productName} x ${row.quantity}`,
      details: {
        entryType: row.entryType,
        siteName: row.siteName,
        productName: row.productName,
        quantity: row.quantity,
        netAmount: row.netAmount,
      },
    });

    return res.status(200).json({ success: true, message: 'Sale transaction deleted and stock reversed.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetGiftSources(req, res) {
  try {
    const { activeOnly = '' } = req.query || {};
    const query = {};
    if (String(activeOnly) === 'true') query.isActive = true;
    const rows = await GiftSource.find(query).sort({ isActive: -1, name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateGiftSource(req, res) {
  try {
    const { name, relation = '', contactNumber = '', isActive = true } = req.body || {};
    const safeName = String(name || '').trim();
    if (!safeName) return res.status(400).json({ message: 'Name is required' });
    const row = await GiftSource.create({
      name: safeName,
      relation,
      contactNumber,
      isActive: !!isActive,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || req.user.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'gift-sources',
      entityType: 'GiftSource',
      entityId: row._id,
      entityLabel: row.name,
      details: row.toObject(),
    });
    return res.status(201).json(row);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Gift source already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateGiftSource(req, res) {
  try {
    const row = await GiftSource.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Gift source not found' });
    const before = row.toObject();
    const { name, relation, contactNumber, isActive } = req.body || {};
    if (name !== undefined) {
      const safeName = String(name || '').trim();
      if (!safeName) return res.status(400).json({ message: 'Name is required' });
      row.name = safeName;
    }
    if (relation !== undefined) row.relation = String(relation || '').trim();
    if (contactNumber !== undefined) row.contactNumber = String(contactNumber || '').trim();
    if (isActive !== undefined) row.isActive = !!isActive;
    await row.save();
    await SalePointEntry.updateMany({ giftSourceId: row._id }, { $set: { giftSourceName: row.name } });
    await recordAction(req, {
      action: 'update',
      module: 'gift-sources',
      entityType: 'GiftSource',
      entityId: row._id,
      entityLabel: row.name,
      details: { before, after: row.toObject() },
    });
    return res.status(200).json(row);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Gift source already exists' });
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteGiftSource(req, res) {
  try {
    const used = await SalePointEntry.countDocuments({ giftSourceId: req.params.id });
    if (used > 0) return res.status(400).json({ message: 'Cannot delete a gift source used in gifting records. Disable it instead.' });
    const row = await GiftSource.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Gift source not found' });
    await recordAction(req, {
      action: 'delete',
      module: 'gift-sources',
      entityType: 'GiftSource',
      entityId: row._id,
      entityLabel: row.name,
      details: row.toObject(),
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdatePayLaterAmount(req, res) {
  try {
    const { id } = req.params;
    const value = Number(req.body?.receivableAmount);
    if (Number.isNaN(value) || value < 0) return res.status(400).json({ message: 'Valid receivable amount is required' });
    const row = await SalePointEntry.findById(id);
    if (!row || row.entryType !== 'pay_later') return res.status(404).json({ message: 'Pay later record not found' });
    if (row.paymentStatus === 'paid') return res.status(400).json({ message: 'Paid records cannot be edited' });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(row.siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    const before = row.toObject();
    row.receivableAmount = value;
    await row.save();
    await recordAction(req, {
      action: 'update',
      module: 'pay-later-records',
      entityType: 'SalePointEntry',
      entityId: row._id,
      entityLabel: `${row.customerName || 'Customer'} - ${row.productName} - ${value}`,
      details: { before, after: row.toObject() },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleMarkPayLaterPaid(req, res) {
  try {
    const { id } = req.params;
    const row = await SalePointEntry.findById(id);
    if (!row || row.entryType !== 'pay_later') return res.status(404).json({ message: 'Pay later record not found' });
    if (row.paymentStatus === 'paid') return res.status(400).json({ message: 'Payment already marked as received' });
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.siteAccess || []).map(String));
      if (!allowedSet.has(String(row.siteId))) return res.status(403).json({ message: 'Site access denied' });
    }
    row.paymentStatus = 'paid';
    row.paymentReceivedAt = new Date();
    row.paymentReceivedBy = req.user.id === 'super-admin' ? null : req.user.id;
    row.paymentReceivedByName = req.user.name || req.user.username || '';
    row.netAmount = Number(row.receivableAmount || 0);
    await row.save();
    await recordAction(req, {
      action: 'mark-paid',
      module: 'pay-later-records',
      entityType: 'SalePointEntry',
      entityId: row._id,
      entityLabel: `${row.customerName || 'Customer'} - ${row.productName} - ${row.netAmount}`,
      details: { paymentStatus: row.paymentStatus, netAmount: row.netAmount },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetWarehouses(req, res) {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.warehouseAccess || []).map(String));
      query._id = { $in: Array.from(allowedSet) };
    }
    const rows = await Warehouse.find(query).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateWarehouse(req, res) {
  try {
    const { name, code, contactNumber = '', contactPersonName = '', address = '', city = '', latitude = null, longitude = null, isActive = true } = req.body;
    if (!name?.trim() || !code?.trim()) return res.status(400).json({ message: 'Name and code are required' });
    const exists = await Warehouse.findOne({ $or: [{ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } }, { code: { $regex: new RegExp(`^${code.trim()}$`, 'i') } }] });
    if (exists) return res.status(400).json({ message: 'Warehouse name/code already exists' });
    const row = await Warehouse.create({ name: name.trim(), code: code.trim().toUpperCase(), contactNumber, contactPersonName, address, city, latitude, longitude, isActive });
    return res.status(201).json({ success: true, warehouse: row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateWarehouse(req, res) {
  try {
    const row = await Warehouse.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Warehouse not found' });
    const { name, code, contactNumber, contactPersonName, address, city, latitude, longitude, isActive } = req.body;
    if (name !== undefined) row.name = String(name || '').trim();
    if (code !== undefined) row.code = String(code || '').trim().toUpperCase();
    if (contactNumber !== undefined) row.contactNumber = contactNumber;
    if (contactPersonName !== undefined) row.contactPersonName = contactPersonName;
    if (address !== undefined) row.address = address;
    if (city !== undefined) row.city = city;
    if (latitude !== undefined) row.latitude = latitude;
    if (longitude !== undefined) row.longitude = longitude;
    if (isActive !== undefined) row.isActive = !!isActive;
    await row.save();
    return res.status(200).json({ success: true, warehouse: row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteWarehouse(req, res) {
  try {
    const row = await Warehouse.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Warehouse not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetWholesellers(req, res) {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      const allowedSet = new Set((req.user.wholesellerAccess || []).map(String));
      query._id = { $in: Array.from(allowedSet) };
    }
    const rows = await Wholeseller.find(query).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateWholeseller(req, res) {
  try {
    const { name, code, contactNumber = '', contactPersonName = '', address = '', city = '', latitude = null, longitude = null, isActive = true } = req.body;
    if (!name?.trim() || !code?.trim()) return res.status(400).json({ message: 'Name and code are required' });
    const exists = await Wholeseller.findOne({ $or: [{ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } }, { code: { $regex: new RegExp(`^${code.trim()}$`, 'i') } }] });
    if (exists) return res.status(400).json({ message: 'Wholeseller name/code already exists' });
    const row = await Wholeseller.create({ name: name.trim(), code: code.trim().toUpperCase(), contactNumber, contactPersonName, address, city, latitude, longitude, isActive });
    return res.status(201).json({ success: true, wholeseller: row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateWholeseller(req, res) {
  try {
    const row = await Wholeseller.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Wholeseller not found' });
    const { name, code, contactNumber, contactPersonName, address, city, latitude, longitude, isActive } = req.body;
    if (name !== undefined) row.name = String(name || '').trim();
    if (code !== undefined) row.code = String(code || '').trim().toUpperCase();
    if (contactNumber !== undefined) row.contactNumber = contactNumber;
    if (contactPersonName !== undefined) row.contactPersonName = contactPersonName;
    if (address !== undefined) row.address = address;
    if (city !== undefined) row.city = city;
    if (latitude !== undefined) row.latitude = latitude;
    if (longitude !== undefined) row.longitude = longitude;
    if (isActive !== undefined) row.isActive = !!isActive;
    await row.save();
    return res.status(200).json({ success: true, wholeseller: row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteWholeseller(req, res) {
  try {
    const row = await Wholeseller.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Wholeseller not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockLots(req, res) {
  try {
    const { holderType, holderId, productId } = req.query;
    const query = {};
    if (holderType) query.holderType = normalizeEntityType(holderType);
    if (holderId) query.holderId = holderId;
    if (productId) query.productId = productId;
    if (req.user.role !== 'admin') {
      if (!query.holderType || !query.holderId) {
        return res.status(400).json({ message: 'holderType and holderId are required for non-admin users' });
      }
      if (!userCanAccessEntity(req, query.holderType, query.holderId)) {
        return res.status(403).json({ message: 'Access denied for selected holder' });
      }
    }
    const rows = await StockLot.find(query).sort({ createdAt: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateStockLot(req, res) {
  try {
    const {
      holderType,
      holderId,
      productId,
      lotCode,
      quantity,
      unitCost = 0,
      receivedAt,
      notes = '',
      sourceRefType = 'manual',
      sourceRefId = null,
    } = req.body;
    const qty = Number(quantity);
    if (!holderType || !holderId || !productId || !lotCode?.trim() || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'holderType, holderId, productId, lotCode, quantity are required' });
    }
    const holder = await resolveEntity(holderType, holderId, { allowOnlineName: true });
    if (!holder) return res.status(404).json({ message: 'Holder not found' });
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Access denied for selected holder' });
    const product = await Product.findById(productId).select('name');
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const row = await StockLot.create({
      holderType: holder.type,
      holderId: holder.id,
      holderName: holder.name,
      productId: product._id,
      productName: product.name,
      lotCode: lotCode.trim(),
      quantityInitial: qty,
      quantityAvailable: qty,
      unitCost: Number(unitCost || 0),
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      sourceRefType,
      sourceRefId,
      notes,
    });

    await createStockLedgerRow({
      movementType: 'in',
      holderType: holder.type,
      holderId: holder.id,
      holderName: holder.name,
      productId: product._id,
      productName: product.name,
      lotId: row._id,
      lotCode: row.lotCode,
      quantity: qty,
      unitCost: Number(unitCost || 0),
      referenceType: 'stock_lot_create',
      referenceId: row._id,
      remarks: notes,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || '',
    });

    return res.status(201).json({ success: true, lot: row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateStockTransfer(req, res) {
  try {
    const { fromType, fromId, toType, toId, items = [], senderRemarks = '' } = req.body;
    if (!fromType || !fromId || !toType || !toId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'from/to and items are required' });
    }
    const from = await resolveEntity(fromType, fromId, { allowOnlineName: true });
    const to = await resolveEntity(toType, toId, { allowOnlineName: true });
    if (!from || !to) return res.status(404).json({ message: 'Source/target not found' });
    if (!userCanAccessEntity(req, from.type, from.id)) return res.status(403).json({ message: 'No access to source holder' });
    if (String(from.type) === String(to.type) && String(from.id) === String(to.id)) {
      return res.status(400).json({ message: 'Source and target cannot be same' });
    }

    const transferItems = [];
    for (const item of items) {
      const lot = await StockLot.findById(item.lotId);
      const qty = Number(item.quantity);
      if (!lot || Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
        return res.status(400).json({ message: 'Invalid transfer item/lot/qty. Only whole-number quantities are allowed.' });
      }
      if (String(lot.holderType) !== String(from.type) || String(lot.holderId) !== String(from.id)) {
        return res.status(400).json({ message: `Lot ${lot.lotCode} does not belong to source holder` });
      }
      if (Number(lot.quantityAvailable || 0) < qty) return res.status(400).json({ message: `Insufficient quantity in lot ${lot.lotCode}` });
      lot.quantityAvailable = Number(lot.quantityAvailable || 0) - qty;
      await lot.save();

      transferItems.push({
        productId: lot.productId,
        productName: lot.productName,
        lotId: lot._id,
        lotCode: lot.lotCode,
        requestedQty: qty,
        acceptedQty: null,
        returnedQty: 0,
        unitCost: Number(item.unitCost ?? lot.unitCost ?? 0),
        notes: item.notes || '',
      });

      await createStockLedgerRow({
        movementType: 'transfer_out',
        holderType: from.type,
        holderId: from.id,
        holderName: from.name,
        productId: lot.productId,
        productName: lot.productName,
        lotId: lot._id,
        lotCode: lot.lotCode,
        quantity: -qty,
        unitCost: Number(item.unitCost ?? lot.unitCost ?? 0),
        referenceType: 'stock_transfer',
        counterpartType: to.type,
        counterpartId: to.id,
        counterpartName: to.name,
        remarks: `Transfer initiated`,
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || '',
      });
    }

    const transfer = await StockTransfer.create({
      transferNumber: makeTransferNumber(),
      fromType: from.type,
      fromId: from.id,
      fromName: from.name,
      toType: to.type,
      toId: to.id,
      toName: to.name,
      status: 'pending',
      items: transferItems,
      senderRemarks,
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || '',
    });

    // Notify receiving-side users that a transfer was initiated for their holder.
    try {
      const itemsText = transferItems.map((it) => `${it.productName} x ${Number(it.requestedQty || 0)}`).join(', ');
      const subject = `Stock Transfer Requested - ${transfer.transferNumber}`;
      const text = [
        `A stock transfer has been initiated.`,
        `Transfer#: ${transfer.transferNumber}`,
        `From: ${transfer.fromName}`,
        `To: ${transfer.toName}`,
        `Items: ${itemsText}`,
        `Requested By: ${req.user.name || req.user.username || 'User'}`,
      ].join('\n');
      await notifyStockTransferEntity(transfer.toType, transfer.toId, { subject, text });
    } catch (mailErr) {
      logger.warn('Stock transfer initiation email failed', { error: mailErr?.message || String(mailErr), transferNumber: transfer.transferNumber });
    }

    return res.status(201).json({ success: true, transfer });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetStockTransfers(req, res) {
  try {
    const { role = 'all', status = '' } = req.query;
    const query = {};
    if (status) query.status = status;
    if (req.user.role !== 'admin') {
      const siteIds = new Set((req.user.siteAccess || []).map(String));
      const warehouseIds = new Set((req.user.warehouseAccess || []).map(String));
      const wholesellerIds = new Set((req.user.wholesellerAccess || []).map(String));
      query.$or = [
        { fromType: 'site', fromId: { $in: Array.from(siteIds) } },
        { toType: 'site', toId: { $in: Array.from(siteIds) } },
        { fromType: 'online', fromId: { $in: Array.from(siteIds) } },
        { toType: 'online', toId: { $in: Array.from(siteIds) } },
        { fromType: 'warehouse', fromId: { $in: Array.from(warehouseIds) } },
        { toType: 'warehouse', toId: { $in: Array.from(warehouseIds) } },
        { fromType: 'wholeseller', fromId: { $in: Array.from(wholesellerIds) } },
        { toType: 'wholeseller', toId: { $in: Array.from(wholesellerIds) } },
      ];
    }
    if (role === 'sent') query.createdBy = req.user.id;
    if (role === 'received') {
      const ands = query.$and || [];
      ands.push({ toType: { $exists: true } });
      query.$and = ands;
    }
    const rows = await StockTransfer.find(query).sort({ createdAt: -1 }).limit(500);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRespondStockTransfer(req, res) {
  try {
    const { action, items = [], receiverRemarks = '', returnDisposition = 'return_to_sender' } = req.body;
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'pending') return res.status(400).json({ message: 'Transfer already processed' });
    if (!userCanAccessEntity(req, transfer.toType, transfer.toId)) return res.status(403).json({ message: 'No access to receiving holder' });
    if (!['accepted', 'modified', 'returned'].includes(action)) return res.status(400).json({ message: 'Invalid action' });

    const itemMap = new Map((items || []).map((r) => [String(r.itemId), r]));
    let totalReturnedQty = 0;
    for (const row of transfer.items) {
      const decision = itemMap.get(String(row._id)) || {};
      let acceptedQty = 0;
      if (action === 'accepted') acceptedQty = Number(row.requestedQty || 0);
      else if (action === 'returned') acceptedQty = 0;
      else acceptedQty = Number(decision.acceptedQty ?? row.requestedQty ?? 0);
      if (!Number.isFinite(acceptedQty) || !Number.isInteger(acceptedQty) || acceptedQty < 0 || acceptedQty > Number(row.requestedQty || 0)) {
        return res.status(400).json({ message: `Invalid acceptedQty for lot ${row.lotCode}` });
      }
      const returnedQty = Number(row.requestedQty || 0) - acceptedQty;
      row.acceptedQty = acceptedQty;
      row.returnedQty = returnedQty;
      totalReturnedQty += Number(returnedQty || 0);

      if (acceptedQty > 0) {
        const generatedInLotCode = await makeSimpleLotCode(row.productName, Number(acceptedQty || 0));
        const existingLot = await StockLot.findOne({
          holderType: transfer.toType,
          holderId: transfer.toId,
          productId: row.productId,
          lotCode: generatedInLotCode,
        });
        if (existingLot) {
          existingLot.quantityAvailable = Number(existingLot.quantityAvailable || 0) + acceptedQty;
          existingLot.quantityInitial = Number(existingLot.quantityInitial || 0) + acceptedQty;
          await existingLot.save();
        } else {
          await StockLot.create({
            holderType: transfer.toType,
            holderId: transfer.toId,
            holderName: transfer.toName,
            productId: row.productId,
            productName: row.productName,
            lotCode: generatedInLotCode,
            quantityInitial: acceptedQty,
            quantityAvailable: acceptedQty,
            unitCost: Number(row.unitCost || 0),
            sourceRefType: 'stock_transfer',
            sourceRefId: transfer._id,
            notes: `Received from ${transfer.fromName} via ${transfer.transferNumber}`,
          });
        }
        await createStockLedgerRow({
          movementType: 'transfer_in',
          holderType: transfer.toType,
          holderId: transfer.toId,
          holderName: transfer.toName,
          productId: row.productId,
          productName: row.productName,
          lotId: null,
          lotCode: row.lotCode,
          quantity: acceptedQty,
          unitCost: Number(row.unitCost || 0),
          referenceType: 'stock_transfer',
          referenceId: transfer._id,
          counterpartType: transfer.fromType,
          counterpartId: transfer.fromId,
          counterpartName: transfer.fromName,
          remarks: `Transfer received`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || '',
        });
      }

      // For modified transfers, sender will resolve difference in a second step.
      const shouldAutoResolveReturned = action !== 'modified';
      if (returnedQty > 0 && shouldAutoResolveReturned) {
        if (returnDisposition === 'mark_wasted') {
          if ((transfer.fromType === 'site' || transfer.fromType === 'online') && transfer.fromId) {
            await StockWastedEntry.create({
              siteId: transfer.fromId,
              siteName: transfer.fromName || (transfer.fromType === 'online' ? 'online' : 'site'),
              productId: row.productId,
              productName: row.productName,
              date: new Date(),
              quantity: Number(returnedQty || 0),
              notes: [
                `Transfer ${transfer.transferNumber} difference marked wasted`,
                `From: ${transfer.fromName}`,
                `To: ${transfer.toName}`,
                receiverRemarks ? `Comments: ${receiverRemarks}` : '',
              ].filter(Boolean).join(' | '),
              createdBy: req.user.id === 'super-admin' ? null : req.user.id,
              createdByName: req.user.name || '',
            });
          }
          await createStockLedgerRow({
            movementType: 'wastage',
            holderType: transfer.fromType,
            holderId: transfer.fromId,
            holderName: transfer.fromName,
            productId: row.productId,
            productName: row.productName,
            lotId: row.lotId,
            lotCode: row.lotCode,
            quantity: -returnedQty,
            unitCost: Number(row.unitCost || 0),
            referenceType: 'stock_transfer',
            referenceId: transfer._id,
            counterpartType: transfer.toType,
            counterpartId: transfer.toId,
            counterpartName: transfer.toName,
            remarks: `Transfer diff marked wastage${receiverRemarks ? ` | ${receiverRemarks}` : ''}`,
            createdBy: req.user.id === 'super-admin' ? null : req.user.id,
            createdByName: req.user.name || '',
          });
        } else {
          const sourceLot = await StockLot.findById(row.lotId);
          if (sourceLot) {
            sourceLot.quantityAvailable = Number(sourceLot.quantityAvailable || 0) + returnedQty;
            await sourceLot.save();
          }
          await createStockLedgerRow({
            movementType: 'in',
            holderType: transfer.fromType,
            holderId: transfer.fromId,
            holderName: transfer.fromName,
            productId: row.productId,
            productName: row.productName,
            lotId: row.lotId,
            lotCode: row.lotCode,
            quantity: returnedQty,
            unitCost: Number(row.unitCost || 0),
            referenceType: 'stock_transfer_return',
            referenceId: transfer._id,
            counterpartType: transfer.toType,
            counterpartId: transfer.toId,
            counterpartName: transfer.toName,
            remarks: `Transfer qty returned`,
            createdBy: req.user.id === 'super-admin' ? null : req.user.id,
            createdByName: req.user.name || '',
          });
        }
      }
    }

    transfer.status = action;
    transfer.receiverRemarks = receiverRemarks;
    if (action === 'modified' && totalReturnedQty > 0) {
      transfer.differenceStatus = 'pending_sender';
      transfer.differenceNotes = receiverRemarks || '';
      transfer.differenceResolvedAt = null;
      transfer.differenceResolvedBy = null;
      transfer.differenceResolvedByName = '';
    } else if (action !== 'modified') {
      transfer.differenceStatus = 'none';
      transfer.differenceNotes = '';
      transfer.differenceResolvedAt = null;
      transfer.differenceResolvedBy = null;
      transfer.differenceResolvedByName = '';
    }
    transfer.responseAt = new Date();
    transfer.respondedBy = req.user.id === 'super-admin' ? null : req.user.id;
    transfer.respondedByName = req.user.name || '';
    await transfer.save();

    // Notify sender-side users about the action taken by receiver.
    try {
      const initiatedItems = (transfer.items || [])
        .map((i) => `${i.productName} x ${Number(i.requestedQty || 0)}`)
        .join(', ');
      const finalItems = (transfer.items || [])
        .map((i) => `${i.productName} x ${Number((i.acceptedQty === undefined || i.acceptedQty === null) ? i.requestedQty : i.acceptedQty || 0)}`)
        .join(', ');
      const subject = `Stock Transfer ${transfer.status.toUpperCase()} - ${transfer.transferNumber}`;
      const text = [
        `A stock transfer has been updated by receiver.`,
        `Transfer#: ${transfer.transferNumber}`,
        `From: ${transfer.fromName}`,
        `To: ${transfer.toName}`,
        `Status: ${transfer.status}`,
        `Initiated Items: ${initiatedItems}`,
        `Final Items: ${finalItems}`,
        transfer.receiverRemarks ? `Receiver Remarks: ${transfer.receiverRemarks}` : '',
        `Action By: ${req.user.name || req.user.username || 'User'}`,
      ].filter(Boolean).join('\n');
      await notifyStockTransferEntity(transfer.fromType, transfer.fromId, { subject, text });
    } catch (mailErr) {
      logger.warn('Stock transfer response email failed', { error: mailErr?.message || String(mailErr), transferNumber: transfer.transferNumber });
    }

    return res.status(200).json({ success: true, transfer });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleResolveStockTransferDifference(req, res) {
  try {
    const { resolution, notes = '' } = req.body;
    if (!['return_to_sender', 'mark_wasted'].includes(String(resolution || ''))) {
      return res.status(400).json({ message: 'resolution must be return_to_sender or mark_wasted' });
    }
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'modified' || transfer.differenceStatus !== 'pending_sender') {
      return res.status(400).json({ message: 'No pending modified difference to resolve' });
    }
    if (!userCanAccessEntity(req, transfer.fromType, transfer.fromId)) {
      return res.status(403).json({ message: 'No access to source holder for difference resolution' });
    }

    for (const row of transfer.items || []) {
      const returnedQty = Number(row.returnedQty || 0);
      if (returnedQty <= 0) continue;

      if (resolution === 'mark_wasted') {
        if ((transfer.fromType === 'site' || transfer.fromType === 'online') && transfer.fromId) {
          await StockWastedEntry.create({
            siteId: transfer.fromId,
            siteName: transfer.fromName || (transfer.fromType === 'online' ? 'online' : 'site'),
            productId: row.productId,
            productName: row.productName,
            date: new Date(),
            quantity: Number(returnedQty || 0),
            notes: [
              `Transfer ${transfer.transferNumber} modified difference marked wasted`,
              `From: ${transfer.fromName}`,
              `To: ${transfer.toName}`,
              notes ? `Comments: ${notes}` : '',
            ].filter(Boolean).join(' | '),
            createdBy: req.user.id === 'super-admin' ? null : req.user.id,
            createdByName: req.user.name || '',
          });
        }
        await createStockLedgerRow({
          movementType: 'wastage',
          holderType: transfer.fromType,
          holderId: transfer.fromId,
          holderName: transfer.fromName,
          productId: row.productId,
          productName: row.productName,
          lotId: row.lotId,
          lotCode: row.lotCode,
          quantity: -returnedQty,
          unitCost: Number(row.unitCost || 0),
          referenceType: 'stock_transfer',
          referenceId: transfer._id,
          counterpartType: transfer.toType,
          counterpartId: transfer.toId,
          counterpartName: transfer.toName,
          remarks: `Sender resolved modified difference as wastage${notes ? ` | ${notes}` : ''}`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || '',
        });
      } else {
        const sourceLot = await StockLot.findById(row.lotId);
        if (sourceLot) {
          sourceLot.quantityAvailable = Number(sourceLot.quantityAvailable || 0) + returnedQty;
          await sourceLot.save();
        }
        await createStockLedgerRow({
          movementType: 'in',
          holderType: transfer.fromType,
          holderId: transfer.fromId,
          holderName: transfer.fromName,
          productId: row.productId,
          productName: row.productName,
          lotId: row.lotId,
          lotCode: row.lotCode,
          quantity: returnedQty,
          unitCost: Number(row.unitCost || 0),
          referenceType: 'stock_transfer_return',
          referenceId: transfer._id,
          counterpartType: transfer.toType,
          counterpartId: transfer.toId,
          counterpartName: transfer.toName,
          remarks: `Sender accepted back modified difference${notes ? ` | ${notes}` : ''}`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || '',
        });
      }
    }

    transfer.differenceStatus = resolution === 'mark_wasted' ? 'resolved_wasted' : 'resolved_returned';
    transfer.differenceNotes = notes || '';
    transfer.differenceResolvedAt = new Date();
    transfer.differenceResolvedBy = req.user.id === 'super-admin' ? null : req.user.id;
    transfer.differenceResolvedByName = req.user.name || '';
    await transfer.save();

    // Notify receiving-side users that sender resolved modified difference.
    try {
      const returnedItems = (transfer.items || [])
        .filter((i) => Number(i.returnedQty || 0) > 0)
        .map((i) => `${i.productName} x ${Number(i.returnedQty || 0)}`)
        .join(', ');
      const resolutionLabel = resolution === 'mark_wasted' ? 'MARKED_WASTED' : 'ACCEPTED_BACK';
      const subject = `Stock Transfer Difference ${resolutionLabel} - ${transfer.transferNumber}`;
      const text = [
        `Modified transfer difference has been resolved by sender.`,
        `Transfer#: ${transfer.transferNumber}`,
        `From: ${transfer.fromName}`,
        `To: ${transfer.toName}`,
        `Resolution: ${resolutionLabel}`,
        `Difference Items: ${returnedItems || '-'}`,
        notes ? `Remarks: ${notes}` : '',
        `Resolved By: ${req.user.name || req.user.username || 'User'}`,
      ].filter(Boolean).join('\n');
      await notifyStockTransferEntity(transfer.toType, transfer.toId, { subject, text });
    } catch (mailErr) {
      logger.warn('Stock transfer difference resolution email failed', { error: mailErr?.message || String(mailErr), transferNumber: transfer.transferNumber });
    }

    return res.status(200).json({ success: true, transfer });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCancelStockTransfer(req, res) {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'pending') return res.status(400).json({ message: 'Only pending transfer can be cancelled' });

    const isAdmin = req.user.role === 'admin';
    const isInitiator = transfer.createdBy && String(transfer.createdBy) === String(req.user.id);
    if (!isAdmin && !isInitiator) {
      return res.status(403).json({ message: 'Only initiator can cancel this transfer' });
    }

    // Restore quantities to original source lots.
    for (const row of transfer.items || []) {
      const sourceLot = await StockLot.findById(row.lotId);
      if (sourceLot) {
        sourceLot.quantityAvailable = Number(sourceLot.quantityAvailable || 0) + Number(row.requestedQty || 0);
        await sourceLot.save();
      }
      await createStockLedgerRow({
        movementType: 'in',
        holderType: transfer.fromType,
        holderId: transfer.fromId,
        holderName: transfer.fromName,
        productId: row.productId,
        productName: row.productName,
        lotId: row.lotId,
        lotCode: row.lotCode,
        quantity: Number(row.requestedQty || 0),
        unitCost: Number(row.unitCost || 0),
        referenceType: 'stock_transfer_cancel',
        referenceId: transfer._id,
        counterpartType: transfer.toType,
        counterpartId: transfer.toId,
        counterpartName: transfer.toName,
        remarks: 'Transfer cancelled by initiator',
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || '',
      });
    }

    transfer.status = 'cancelled';
    transfer.receiverRemarks = 'Cancelled by initiator';
    transfer.responseAt = new Date();
    transfer.respondedBy = req.user.id === 'super-admin' ? null : req.user.id;
    transfer.respondedByName = req.user.name || '';
    await transfer.save();

    // Notify receiving-side users that sender cancelled the transfer.
    try {
      const itemsText = (transfer.items || []).map((i) => `${i.productName} x ${Number(i.requestedQty || 0)}`).join(', ');
      const subject = `Stock Transfer CANCELLED - ${transfer.transferNumber}`;
      const text = [
        `A stock transfer has been cancelled by sender.`,
        `Transfer#: ${transfer.transferNumber}`,
        `From: ${transfer.fromName}`,
        `To: ${transfer.toName}`,
        `Items: ${itemsText}`,
        `Cancelled By: ${req.user.name || req.user.username || 'User'}`,
      ].join('\n');
      await notifyStockTransferEntity(transfer.toType, transfer.toId, { subject, text });
    } catch (mailErr) {
      logger.warn('Stock transfer cancel email failed', { error: mailErr?.message || String(mailErr), transferNumber: transfer.transferNumber });
    }

    return res.status(200).json({ success: true, transfer });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAdjustHolderStock(req, res) {
  try {
    const {
      holderType,
      holderId,
      productId,
      lotId = null,
      operation = 'add',
      quantity,
      unitCost = 0,
      notes = '',
    } = req.body;

    const qty = Number(quantity);
    if (!holderType || !holderId || !productId || !['add', 'remove'].includes(operation) || Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'holderType, holderId, productId, operation(add/remove), quantity are required' });
    }

    const holder = await resolveEntity(holderType, holderId, { allowOnlineName: true });
    if (!holder) return res.status(404).json({ message: 'Holder not found' });
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Access denied for selected holder' });

    const product = await Product.findById(productId).select('name');
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (operation === 'add') {
      let targetLot = null;
      if (lotId) {
        targetLot = await StockLot.findById(lotId);
        if (!targetLot) return res.status(404).json({ message: 'Lot not found' });
        if (
          String(targetLot.holderType) !== String(holder.type) ||
          String(targetLot.holderId) !== String(holder.id) ||
          String(targetLot.productId) !== String(product._id)
        ) {
          return res.status(400).json({ message: 'Selected lot does not belong to chosen holder/product' });
        }
        targetLot.quantityInitial = Number(targetLot.quantityInitial || 0) + qty;
        targetLot.quantityAvailable = Number(targetLot.quantityAvailable || 0) + qty;
        if (Number(unitCost || 0) > 0) targetLot.unitCost = Number(unitCost || 0);
        await targetLot.save();
      } else {
        const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        const rand = String(Math.floor(100 + Math.random() * 900));
        const lotCode = `ADJ-${String(holder.type || 'H').toUpperCase()}-${datePart}-${rand}`;
        targetLot = await StockLot.create({
          holderType: holder.type,
          holderId: holder.id,
          holderName: holder.name,
          productId: product._id,
          productName: product.name,
          lotCode,
          quantityInitial: qty,
          quantityAvailable: qty,
          unitCost: Number(unitCost || 0),
          sourceRefType: 'manual_adjustment',
          sourceRefId: null,
          notes: notes || 'Manual stock add',
        });
      }

      await createStockLedgerRow({
        movementType: 'adjustment',
        holderType: holder.type,
        holderId: holder.id,
        holderName: holder.name,
        productId: product._id,
        productName: product.name,
        lotId: targetLot._id,
        lotCode: targetLot.lotCode,
        quantity: qty,
        unitCost: Number(unitCost || targetLot.unitCost || 0),
        referenceType: 'manual_adjustment',
        referenceId: targetLot._id,
        remarks: notes || 'Manual stock add',
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || '',
      });

      return res.status(200).json({ success: true, message: 'Stock added', lot: targetLot });
    }

    // remove
    let remaining = qty;
    const touchedLots = [];
    if (lotId) {
      const sourceLot = await StockLot.findById(lotId);
      if (!sourceLot) return res.status(404).json({ message: 'Lot not found' });
      if (
        String(sourceLot.holderType) !== String(holder.type) ||
        String(sourceLot.holderId) !== String(holder.id) ||
        String(sourceLot.productId) !== String(product._id)
      ) {
        return res.status(400).json({ message: 'Selected lot does not belong to chosen holder/product' });
      }
      if (Number(sourceLot.quantityAvailable || 0) < remaining) return res.status(400).json({ message: 'Insufficient stock in selected lot' });
      sourceLot.quantityAvailable = Number(sourceLot.quantityAvailable || 0) - remaining;
      await sourceLot.save();
      touchedLots.push({ lot: sourceLot, qty: remaining });
      remaining = 0;
    } else {
      const lots = await StockLot.find({
        holderType: holder.type,
        holderId: holder.id,
        productId: product._id,
        quantityAvailable: { $gt: 0 },
      }).sort({ receivedAt: 1, createdAt: 1 });

      const availableTotal = lots.reduce((sum, l) => sum + Number(l.quantityAvailable || 0), 0);
      if (availableTotal < remaining) return res.status(400).json({ message: 'Insufficient stock across lots' });

      for (const l of lots) {
        if (remaining <= 0) break;
        const take = Math.min(Number(l.quantityAvailable || 0), remaining);
        if (take <= 0) continue;
        l.quantityAvailable = Number(l.quantityAvailable || 0) - take;
        await l.save();
        touchedLots.push({ lot: l, qty: take });
        remaining -= take;
      }
    }

    for (const t of touchedLots) {
      await createStockLedgerRow({
        movementType: 'adjustment',
        holderType: holder.type,
        holderId: holder.id,
        holderName: holder.name,
        productId: product._id,
        productName: product.name,
        lotId: t.lot._id,
        lotCode: t.lot.lotCode,
        quantity: -Number(t.qty || 0),
        unitCost: Number(unitCost || t.lot.unitCost || 0),
        referenceType: 'manual_adjustment',
        referenceId: t.lot._id,
        remarks: notes || 'Manual stock remove',
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || '',
      });
    }

    return res.status(200).json({ success: true, message: 'Stock removed', touchedLots: touchedLots.map((t) => ({ lotId: t.lot._id, lotCode: t.lot.lotCode, qty: t.qty })) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetSalesDashboardSummary(req, res) {
  try {
    const { dateFrom, dateTo } = req.query;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const makeRange = (from, to) => {
      if (!from && !to) return null;
      const range = {};
      if (from) {
        const s = new Date(from);
        s.setHours(0, 0, 0, 0);
        range.$gte = s;
      }
      if (to) {
        const e = new Date(to);
        e.setHours(23, 59, 59, 999);
        range.$lte = e;
      }
      return Object.keys(range).length ? range : null;
    };

    const selectedRange = makeRange(dateFrom, dateTo);
    const salesExpenseStartDate = new Date(2026, 5, 9); // Sales-side live expense tracking started on 09-Jun-2026.
    salesExpenseStartDate.setHours(0, 0, 0, 0);
    const applySalesExpenseCutoff = (range) => {
      const adjusted = { ...(range || {}) };
      if (!adjusted.$gte || adjusted.$gte < salesExpenseStartDate) adjusted.$gte = salesExpenseStartDate;
      return adjusted;
    };

    let allowedSiteIds = null;
    let allowOnline = true;
    let activeSites = await Site.find({ isActive: true }).select('_id name').sort({ name: 1 });
    if (req.user.role !== 'admin') {
      allowedSiteIds = (req.user.siteAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
      activeSites = activeSites.filter((s) => allowedSiteIds.some((id) => String(id) === String(s._id)));
      const allowedSites = activeSites;
      allowOnline = allowedSites.some((s) => String(s.name || '').trim().toLowerCase() === 'online');
    }
    const siteIdToName = new Map(activeSites.map((s) => [String(s._id), s.name]));
    const onlineSite = activeSites.find((s) => String(s.name || '').trim().toLowerCase() === 'online') || null;
    const warehouseHolders = req.user.role === 'admin'
      ? await Warehouse.find({ isActive: true }).select('_id name')
      : await Warehouse.find({ _id: { $in: (req.user.warehouseAccess || []).map((id) => new mongoose.Types.ObjectId(String(id))) }, isActive: true }).select('_id name');
    const wholesellerHolders = req.user.role === 'admin'
      ? await Wholeseller.find({ isActive: true }).select('_id name')
      : await Wholeseller.find({ _id: { $in: (req.user.wholesellerAccess || []).map((id) => new mongoose.Types.ObjectId(String(id))) }, isActive: true }).select('_id name');
    const activeSiteIds = activeSites.map((s) => new mongoose.Types.ObjectId(String(s._id)));
    const activeWarehouseIds = warehouseHolders.map((w) => new mongoose.Types.ObjectId(String(w._id)));
    const activeWholesellerIds = wholesellerHolders.map((w) => new mongoose.Types.ObjectId(String(w._id)));

    const activeHolderAccessMatch = () => ({
      $or: [
        { holderType: 'site', holderId: { $in: activeSiteIds } },
        { holderType: 'online', holderId: { $in: activeSiteIds } },
        { holderType: 'warehouse', holderId: { $in: activeWarehouseIds } },
        { holderType: 'wholeseller', holderId: { $in: activeWholesellerIds } },
        { siteId: { $in: activeSiteIds } }, // backward compatibility for old expense rows
      ],
    });

    const baseSiteMatch = (range) => {
      const match = {
        $or: [
          { entryType: { $in: ['sale', 'return'] }, ...(range ? { date: range } : {}) },
          { entryType: { $exists: false }, ...(range ? { date: range } : {}) },
          { entryType: 'pay_later', paymentStatus: 'paid', ...(range ? { paymentReceivedAt: range } : {}) },
        ],
      };
      if (req.user.role !== 'admin') {
        const siteIds = (req.user.siteAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
        const warehouseIds = (req.user.warehouseAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
        match.$and = [{
          $or: [
            { siteId: { $in: siteIds } },
            { holderType: 'site', holderId: { $in: siteIds } },
            { holderType: 'online', holderId: { $in: siteIds } },
            { holderType: 'warehouse', holderId: { $in: warehouseIds } },
          ],
        }];
      }
      return match;
    };

    const salesGroupPipeline = (range) => ([
      { $match: baseSiteMatch(range) },
      {
        $addFields: {
          effectiveHolderType: { $ifNull: ['$holderType', 'site'] },
          effectiveHolderId: { $ifNull: ['$holderId', '$siteId'] },
        },
      },
      {
        $group: {
          _id: {
            holderType: '$effectiveHolderType',
            holderId: '$effectiveHolderId',
          },
          salesAmount: {
            $sum: {
              $cond: [
                { $eq: ['$entryType', 'return'] },
                { $multiply: ['$netAmount', -1] },
                '$netAmount',
              ],
            },
          },
          salesQty: {
            $sum: {
              $cond: [
                { $eq: ['$entryType', 'return'] },
                { $multiply: ['$quantity', -1] },
                '$quantity',
              ],
            },
          },
        },
      },
    ]);

    const baseExpenseMatch = (range) => {
      const match = activeHolderAccessMatch();
      match.date = applySalesExpenseCutoff(range);
      return match;
    };

    const expenseGroupPipeline = (range) => ([
      { $match: baseExpenseMatch(range) },
      {
        $addFields: {
          effectiveHolderType: {
            $ifNull: [
              '$holderType',
              {
                $cond: [{ $eq: [{ $toLower: { $ifNull: ['$siteName', ''] } }, 'online'] }, 'online', 'site'],
              },
            ],
          },
          effectiveHolderId: { $ifNull: ['$holderId', '$siteId'] },
        },
      },
      {
        $group: {
          _id: {
            holderType: '$effectiveHolderType',
            holderId: '$effectiveHolderId',
          },
          expenseAmount: { $sum: '$amount' },
        },
      },
    ]);

    const baseDepositMatch = (range) => {
      const match = activeHolderAccessMatch();
      if (range) match.date = range;
      return match;
    };

    const depositGroupPipeline = (range) => ([
      { $match: baseDepositMatch(range) },
      {
        $group: {
          _id: {
            holderType: '$holderType',
            holderId: '$holderId',
            status: '$status',
          },
          amount: { $sum: '$amount' },
        },
      },
    ]);

    const [
      salesOverall,
      salesDaily,
      salesRange,
      expenseOverall,
      expenseDaily,
      expenseRange,
      pendingReceivables,
      giftRows,
      depositsOverall,
      depositsDaily,
      depositsRange,
    ] = await Promise.all([
      SalePointEntry.aggregate(salesGroupPipeline(null)),
      SalePointEntry.aggregate(salesGroupPipeline({ $gte: dayStart, $lte: dayEnd })),
      selectedRange ? SalePointEntry.aggregate(salesGroupPipeline(selectedRange)) : Promise.resolve([]),
      ExpenseEntry.aggregate(expenseGroupPipeline(null)),
      ExpenseEntry.aggregate(expenseGroupPipeline({ $gte: dayStart, $lte: dayEnd })),
      selectedRange ? ExpenseEntry.aggregate(expenseGroupPipeline(selectedRange)) : Promise.resolve([]),
      SalePointEntry.aggregate([
        {
          $match: {
            entryType: 'pay_later',
            paymentStatus: 'pending',
            ...(allowedSiteIds ? { siteId: { $in: allowedSiteIds } } : {}),
          },
        },
        { $group: { _id: null, amount: { $sum: '$receivableAmount' }, quantity: { $sum: '$quantity' } } },
      ]),
      SalePointEntry.aggregate([
        {
          $match: {
            entryType: 'gift',
            ...(allowedSiteIds ? { siteId: { $in: allowedSiteIds } } : {}),
          },
        },
        { $group: { _id: '$giftSourceName', quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$unitPrice', '$quantity'] } } } },
        { $sort: { quantity: -1 } },
      ]),
      CompanyCashDeposit.aggregate(depositGroupPipeline(null)),
      CompanyCashDeposit.aggregate(depositGroupPipeline({ $gte: dayStart, $lte: dayEnd })),
      selectedRange ? CompanyCashDeposit.aggregate(depositGroupPipeline(selectedRange)) : Promise.resolve([]),
    ]);

    const onlineOrderMatch = {
      status: { $nin: ['rejected', 'cancelled', 'returned'] },
    };
    if (allowedSiteIds && !allowOnline) {
      // non-admin user without online site access should not see online order sales
      onlineOrderMatch._id = null;
    }

    const orderAggPipeline = (range) => {
      const match = { ...onlineOrderMatch };
      if (range) match.createdAt = range;
      return [
        { $match: match },
        {
          $group: {
            _id: null,
            salesAmount: { $sum: { $ifNull: ['$paymentDetails.payableAmount', '$totalCost'] } },
            salesQty: {
              $sum: {
                $reduce: {
                  input: { $ifNull: ['$items', []] },
                  initialValue: 0,
                  in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
                },
              },
            },
          },
        },
      ];
    };

    const [onlineOverallAgg, onlineDailyAgg, onlineRangeAgg] = await Promise.all([
      Order.aggregate(orderAggPipeline(null)),
      Order.aggregate(orderAggPipeline({ $gte: dayStart, $lte: dayEnd })),
      selectedRange ? Order.aggregate(orderAggPipeline(selectedRange)) : Promise.resolve([]),
    ]);

    const onlineOverall = onlineOverallAgg[0] || { salesAmount: 0, salesQty: 0 };
    const onlineDaily = onlineDailyAgg[0] || { salesAmount: 0, salesQty: 0 };
    const onlineRange = onlineRangeAgg[0] || { salesAmount: 0, salesQty: 0 };

    const allHolderKeys = new Set(activeSites.map((s) => `site:${String(s._id)}`));
    const holderNameMap = new Map();
    activeSites.forEach((s) => {
      holderNameMap.set(`site:${String(s._id)}`, s.name);
      holderNameMap.set(`online:${String(s._id)}`, s.name);
    });
    warehouseHolders.forEach((w) => {
      holderNameMap.set(`warehouse:${String(w._id)}`, w.name);
      allHolderKeys.add(`warehouse:${String(w._id)}`);
    });
    wholesellerHolders.forEach((w) => {
      holderNameMap.set(`wholeseller:${String(w._id)}`, w.name);
      allHolderKeys.add(`wholeseller:${String(w._id)}`);
    });

    const toMap = (rows, valueKey) => {
      const m = new Map();
      rows.forEach((r) => m.set(String(r._id || '').trim(), Number(r[valueKey] || 0)));
      return m;
    };
    const toExpenseMap = (rows) => {
      const m = new Map();
      rows.forEach((r) => {
        const type = String(r?._id?.holderType || '').trim();
        const id = String(r?._id?.holderId || '').trim();
        if (!type || !id) return;
        m.set(`${type}:${id}`, Number(r.expenseAmount || 0));
      });
      return m;
    };
    const toDepositMap = (rows) => {
      const m = new Map();
      rows.forEach((r) => {
        const type = String(r?._id?.holderType || '').trim();
        const id = String(r?._id?.holderId || '').trim();
        const status = String(r?._id?.status || '').trim();
        if (!type || !id || !status) return;
        const key = `${type}:${id}`;
        const current = m.get(key) || { accepted: 0, pending: 0, rejected: 0 };
        current[status] = Number(current[status] || 0) + Number(r.amount || 0);
        m.set(key, current);
      });
      return m;
    };
    const toDualMap = (rows) => {
      const m = new Map();
      rows.forEach((r) => {
        const type = String(r?._id?.holderType || '').trim();
        const id = String(r?._id?.holderId || '').trim();
        if (!type || !id) return;
        m.set(`${type}:${id}`, {
        salesAmount: Number(r.salesAmount || 0),
        salesQty: Number(r.salesQty || 0),
        });
      });
      return m;
    };

    const salesOverallMap = toDualMap(salesOverall);
    const salesDailyMap = toDualMap(salesDaily);
    const salesRangeMap = toDualMap(salesRange);
    const expenseOverallMap = toExpenseMap(expenseOverall);
    const expenseDailyMap = toExpenseMap(expenseDaily);
    const expenseRangeMap = toExpenseMap(expenseRange);
    const depositOverallMap = toDepositMap(depositsOverall);
    const depositDailyMap = toDepositMap(depositsDaily);
    const depositRangeMap = toDepositMap(depositsRange);

    if (allowOnline && onlineSite?._id) {
      const onlineSiteId = String(onlineSite._id);
      const onlineKey = `site:${onlineSiteId}`;
      const existingOverall = salesOverallMap.get(onlineKey) || { salesAmount: 0, salesQty: 0 };
      const existingDaily = salesDailyMap.get(onlineKey) || { salesAmount: 0, salesQty: 0 };
      const existingRange = salesRangeMap.get(onlineKey) || { salesAmount: 0, salesQty: 0 };
      salesOverallMap.set(onlineKey, {
        salesAmount: Number(existingOverall.salesAmount || 0) + Number(onlineOverall.salesAmount || 0),
        salesQty: Number(existingOverall.salesQty || 0) + Number(onlineOverall.salesQty || 0),
      });
      salesDailyMap.set(onlineKey, {
        salesAmount: Number(existingDaily.salesAmount || 0) + Number(onlineDaily.salesAmount || 0),
        salesQty: Number(existingDaily.salesQty || 0) + Number(onlineDaily.salesQty || 0),
      });
      if (selectedRange) {
        salesRangeMap.set(onlineKey, {
          salesAmount: Number(existingRange.salesAmount || 0) + Number(onlineRange.salesAmount || 0),
          salesQty: Number(existingRange.salesQty || 0) + Number(onlineRange.salesQty || 0),
        });
      }
      allHolderKeys.add(`site:${onlineSiteId}`);
    }

    const siteCards = Array.from(allHolderKeys)
      .filter(Boolean)
      .sort((a, b) => String(holderNameMap.get(a) || '').localeCompare(String(holderNameMap.get(b) || '')))
      .map((holderKey) => {
        const [holderType, siteId] = String(holderKey).split(':');
        const siteName = holderNameMap.get(holderKey) || siteIdToName.get(siteId) || 'Unknown Site';
        const ovSales = salesOverallMap.get(holderKey) || { salesAmount: 0, salesQty: 0 };
        const dySales = salesDailyMap.get(holderKey) || { salesAmount: 0, salesQty: 0 };
        const rgSales = salesRangeMap.get(holderKey) || { salesAmount: 0, salesQty: 0 };
        const ovExp = Number(expenseOverallMap.get(holderKey) || 0);
        const dyExp = Number(expenseDailyMap.get(holderKey) || 0);
        const rgExp = Number(expenseRangeMap.get(holderKey) || 0);
        const ovDep = depositOverallMap.get(holderKey) || { accepted: 0, pending: 0, rejected: 0 };
        const dyDep = depositDailyMap.get(holderKey) || { accepted: 0, pending: 0, rejected: 0 };
        const rgDep = depositRangeMap.get(holderKey) || { accepted: 0, pending: 0, rejected: 0 };
        return {
          holderType,
          siteId,
          siteName,
          overall: {
            salesAmount: ovSales.salesAmount,
            expenseAmount: ovExp,
            acceptedDepositAmount: Number(ovDep.accepted || 0),
            pendingDepositAmount: Number(ovDep.pending || 0),
            cashAvailable: ovSales.salesAmount - ovExp - Number(ovDep.accepted || 0) - Number(ovDep.pending || 0),
            netProfit: ovSales.salesAmount - ovExp,
            quantity: ovSales.salesQty,
          },
          daily: {
            salesAmount: dySales.salesAmount,
            expenseAmount: dyExp,
            acceptedDepositAmount: Number(dyDep.accepted || 0),
            pendingDepositAmount: Number(dyDep.pending || 0),
            cashAvailable: dySales.salesAmount - dyExp - Number(dyDep.accepted || 0) - Number(dyDep.pending || 0),
            netProfit: dySales.salesAmount - dyExp,
            quantity: dySales.salesQty,
          },
          range: {
            salesAmount: rgSales.salesAmount,
            expenseAmount: rgExp,
            acceptedDepositAmount: Number(rgDep.accepted || 0),
            pendingDepositAmount: Number(rgDep.pending || 0),
            cashAvailable: rgSales.salesAmount - rgExp - Number(rgDep.accepted || 0) - Number(rgDep.pending || 0),
            netProfit: rgSales.salesAmount - rgExp,
            quantity: rgSales.salesQty,
          },
        };
      });

    const sumField = (list, pathFn) => list.reduce((acc, item) => acc + Number(pathFn(item) || 0), 0);
    const totals = {
      overall: {
        salesAmount: sumField(siteCards, (c) => c.overall.salesAmount),
        expenseAmount: sumField(siteCards, (c) => c.overall.expenseAmount),
        acceptedDepositAmount: sumField(siteCards, (c) => c.overall.acceptedDepositAmount),
        pendingDepositAmount: sumField(siteCards, (c) => c.overall.pendingDepositAmount),
        cashAvailable: sumField(siteCards, (c) => c.overall.cashAvailable),
        netProfit: sumField(siteCards, (c) => c.overall.netProfit),
        quantity: sumField(siteCards, (c) => c.overall.quantity),
      },
      daily: {
        salesAmount: sumField(siteCards, (c) => c.daily.salesAmount),
        expenseAmount: sumField(siteCards, (c) => c.daily.expenseAmount),
        acceptedDepositAmount: sumField(siteCards, (c) => c.daily.acceptedDepositAmount),
        pendingDepositAmount: sumField(siteCards, (c) => c.daily.pendingDepositAmount),
        cashAvailable: sumField(siteCards, (c) => c.daily.cashAvailable),
        netProfit: sumField(siteCards, (c) => c.daily.netProfit),
        quantity: sumField(siteCards, (c) => c.daily.quantity),
      },
      range: {
        salesAmount: sumField(siteCards, (c) => c.range.salesAmount),
        expenseAmount: sumField(siteCards, (c) => c.range.expenseAmount),
        acceptedDepositAmount: sumField(siteCards, (c) => c.range.acceptedDepositAmount),
        pendingDepositAmount: sumField(siteCards, (c) => c.range.pendingDepositAmount),
        cashAvailable: sumField(siteCards, (c) => c.range.cashAvailable),
        netProfit: sumField(siteCards, (c) => c.range.netProfit),
        quantity: sumField(siteCards, (c) => c.range.quantity),
      },
      pendingReceivables: {
        amount: Number(pendingReceivables?.[0]?.amount || 0),
        quantity: Number(pendingReceivables?.[0]?.quantity || 0),
      },
      gifting: {
        quantity: giftRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        value: giftRows.reduce((sum, row) => sum + Number(row.value || 0), 0),
        bySource: giftRows.map((row) => ({
          sourceName: row._id || 'Unassigned',
          quantity: Number(row.quantity || 0),
          value: Number(row.value || 0),
        })),
      },
    };

    return res.status(200).json({
      selectedRange: selectedRange ? {
        from: dateFrom || null,
        to: dateTo || null,
      } : null,
      totals,
      siteCards,
    });
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
    if (!productHasSiteAssignment(product, siteId, site.name)) {
      return res.status(400).json({ message: 'Selected product does not belong to this site' });
    }
    const availableQty = await getSiteProductAvailableQty(siteId, product._id);
    if (availableQty < qty) {
      return res.status(400).json({ message: 'Insufficient stock available' });
    }

    await consumeSiteProductLots(siteId, product._id, qty);

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

    return res.status(201).json({ success: true, entry, remainingStock: Math.max(0, availableQty - qty) });
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

async function handleUpdateExpenseHead(req, res) {
  try {
    const { id } = req.params;
    const { name, colorCode, isActive } = req.body;
    const head = await ExpenseHead.findById(id);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });

    if (typeof name !== 'undefined') {
      const safeName = String(name || '').trim();
      if (!safeName) return res.status(400).json({ message: 'Expense head name is required' });
      const exists = await ExpenseHead.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${safeName}$`, 'i') },
      });
      if (exists) return res.status(400).json({ message: 'Expense head already exists' });
      head.name = safeName;
    }
    if (typeof colorCode !== 'undefined') head.colorCode = String(colorCode || '').trim() || '#6B7280';
    if (typeof isActive !== 'undefined') head.isActive = !!isActive;
    await head.save();

    if (typeof name !== 'undefined') {
      await ExpenseEntry.updateMany({ headId: head._id }, { $set: { headName: head.name } });
    }

    return res.status(200).json({ success: true, head });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteExpenseHead(req, res) {
  try {
    const { id } = req.params;
    const head = await ExpenseHead.findById(id);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });

    const itemCount = await ExpenseItem.countDocuments({ headId: id });
    if (itemCount > 0) {
      return res.status(400).json({ message: 'Cannot delete head with linked expense names. Remove/shift names first.' });
    }
    const entryCount = await ExpenseEntry.countDocuments({ headId: id });
    if (entryCount > 0) {
      return res.status(400).json({ message: 'Cannot delete head with expense history.' });
    }

    await ExpenseHead.findByIdAndDelete(id);
    return res.status(200).json({ success: true });
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

async function handleUpdateExpenseItem(req, res) {
  try {
    const { id } = req.params;
    const { headId, name, isActive } = req.body;
    const item = await ExpenseItem.findById(id);
    if (!item) return res.status(404).json({ message: 'Expense item not found' });

    const nextHeadId = headId || item.headId;
    const nextName = typeof name !== 'undefined' ? String(name || '').trim() : item.name;
    if (!nextName) return res.status(400).json({ message: 'Expense name is required' });

    const exists = await ExpenseItem.findOne({
      _id: { $ne: id },
      headId: nextHeadId,
      name: { $regex: new RegExp(`^${nextName}$`, 'i') },
    });
    if (exists) return res.status(400).json({ message: 'Expense name already exists in this head' });

    const head = await ExpenseHead.findById(nextHeadId);
    if (!head) return res.status(404).json({ message: 'Expense head not found' });

    item.headId = nextHeadId;
    item.name = nextName;
    if (typeof isActive !== 'undefined') item.isActive = !!isActive;
    await item.save();

    await ExpenseEntry.updateMany({ itemId: item._id }, { $set: { itemName: item.name, headId: head._id, headName: head.name } });

    return res.status(200).json({ success: true, item });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteExpenseItem(req, res) {
  try {
    const { id } = req.params;
    const item = await ExpenseItem.findById(id);
    if (!item) return res.status(404).json({ message: 'Expense item not found' });

    const used = await ExpenseEntry.countDocuments({ itemId: item._id });
    if (used > 0) return res.status(400).json({ message: 'Cannot delete expense name with existing history.' });

    await ExpenseItem.findByIdAndDelete(id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateExpenseEntry(req, res) {
  try {
    const { siteId, holderType, holderId, date, headId, itemId, itemName, amount, remarks = '' } = req.body;
    const value = Number(amount);
    if (!headId || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Invalid expense entry data' });
    }
    let holder = null;
    if (holderType && holderId) {
      holder = await resolveEntity(holderType, holderId, { allowOnlineName: true });
      if (!holder) return res.status(404).json({ message: 'Expense holder not found' });
      if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });
    } else if (siteId) {
      const site = await Site.findById(siteId);
      if (!site) return res.status(404).json({ message: 'Site not found' });
      holder = { type: String(site.name || '').trim().toLowerCase() === 'online' ? 'online' : 'site', id: site._id, name: site.name };
      if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Site access denied' });
    } else {
      return res.status(400).json({ message: 'holderType and holderId are required' });
    }
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
      siteId: holder.type === 'site' || holder.type === 'online' ? holder.id : null,
      siteName: holder.type === 'site' || holder.type === 'online' ? holder.name : '',
      holderType: holder.type,
      holderId: holder.id,
      holderName: holder.name,
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
    const { siteId, holderType, holderId, dateFrom, dateTo } = req.query;
    const query = {};
    const normalizedHolderType = normalizeEntityType(holderType);
    if (normalizedHolderType && holderId) {
      query.holderType = normalizedHolderType;
      query.holderId = holderId;
    } else if (siteId) {
      query.siteId = siteId;
    }
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
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      const wholesellerSet = new Set((req.user.wholesellerAccess || []).map(String));

      if (query.holderType && query.holderId) {
        if (!userCanAccessEntity(req, query.holderType, query.holderId)) {
          return res.status(403).json({ message: 'Holder access denied' });
        }
      } else if (siteId) {
        if (!siteSet.has(String(siteId))) return res.status(403).json({ message: 'Site access denied' });
      } else {
        query.$or = [
          { holderType: 'site', holderId: { $in: Array.from(siteSet) } },
          { holderType: 'online', holderId: { $in: Array.from(siteSet) } },
          { holderType: 'warehouse', holderId: { $in: Array.from(warehouseSet) } },
          { holderType: 'wholeseller', holderId: { $in: Array.from(wholesellerSet) } },
          { siteId: { $in: Array.from(siteSet) } }, // backward compatibility
        ];
      }
    }
    const entries = await ExpenseEntry.find(query).sort({ date: -1, createdAt: -1 }).limit(1000);
    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetExpenseHolders(req, res) {
  try {
    await ensureOnlineSite();
    let sites = await Site.find({ isActive: true }).sort({ name: 1 });
    let warehouses = await Warehouse.find({ isActive: true }).sort({ name: 1 });
    let wholesellers = await Wholeseller.find({ isActive: true }).sort({ name: 1 });

    if (req.user.role !== 'admin') {
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      const warehouseSet = new Set((req.user.warehouseAccess || []).map(String));
      const wholesellerSet = new Set((req.user.wholesellerAccess || []).map(String));
      sites = sites.filter((s) => siteSet.has(String(s._id)));
      warehouses = warehouses.filter((w) => warehouseSet.has(String(w._id)));
      wholesellers = wholesellers.filter((w) => wholesellerSet.has(String(w._id)));
    }

    return res.status(200).json({ sites, warehouses, wholesellers });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

function buildCompanyDepositAccessMatch(req) {
  if (req.user.role === 'admin') return {};
  const siteIds = (req.user.siteAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  const warehouseIds = (req.user.warehouseAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  const wholesellerIds = (req.user.wholesellerAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  return {
    $or: [
      { holderType: 'site', holderId: { $in: siteIds } },
      { holderType: 'online', holderId: { $in: siteIds } },
      { holderType: 'warehouse', holderId: { $in: warehouseIds } },
      { holderType: 'wholeseller', holderId: { $in: wholesellerIds } },
    ],
  };
}

async function calculateCashPositionForHolder(holder) {
  const holderId = new mongoose.Types.ObjectId(String(holder.id));
  const holderMatch = { holderType: holder.type, holderId };
  const saleMatch = {
    $and: [
      {
        $or: [
          { entryType: { $in: ['sale', 'return'] } },
          { entryType: { $exists: false } },
          { entryType: 'pay_later', paymentStatus: 'paid' },
        ],
      },
      holder.type === 'site'
        ? {
            $or: [
              { siteId: holderId, holderType: { $exists: false } },
              { siteId: holderId, holderType: 'site' },
              { holderType: 'site', holderId },
            ],
          }
        : { holderType: holder.type, holderId },
    ],
  };

  const [salesAgg, expensesAgg, depositsAgg] = await Promise.all([
    SalePointEntry.aggregate([
      { $match: saleMatch },
      {
        $group: {
          _id: null,
          amount: {
            $sum: {
              $cond: [
                { $eq: ['$entryType', 'return'] },
                { $multiply: ['$netAmount', -1] },
                '$netAmount',
              ],
            },
          },
          quantity: {
            $sum: {
              $cond: [
                { $eq: ['$entryType', 'return'] },
                { $multiply: ['$quantity', -1] },
                '$quantity',
              ],
            },
          },
        },
      },
    ]),
    ExpenseEntry.aggregate([
      { $match: holderMatch },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]),
    CompanyCashDeposit.aggregate([
      { $match: holderMatch },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const depositMap = depositsAgg.reduce((acc, row) => {
    acc[row._id] = { amount: Number(row.amount || 0), count: Number(row.count || 0) };
    return acc;
  }, {});
  const salesAmount = Number(salesAgg?.[0]?.amount || 0);
  const expenseAmount = Number(expensesAgg?.[0]?.amount || 0);
  const acceptedDepositAmount = Number(depositMap.accepted?.amount || 0);
  const pendingDepositAmount = Number(depositMap.pending?.amount || 0);
  const rejectedDepositAmount = Number(depositMap.rejected?.amount || 0);

  return {
    holderType: holder.type,
    holderId: String(holder.id),
    holderName: holder.name,
    salesAmount,
    salesQuantity: Number(salesAgg?.[0]?.quantity || 0),
    expenseAmount,
    acceptedDepositAmount,
    pendingDepositAmount,
    rejectedDepositAmount,
    cashAvailable: salesAmount - expenseAmount - acceptedDepositAmount - pendingDepositAmount,
    pendingDepositCount: Number(depositMap.pending?.count || 0),
  };
}

async function handleGetCashDepositPaymentMethods(req, res) {
  try {
    const rows = await PaymentMethod.find({ isActive: true }).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetCompanyCashPosition(req, res) {
  try {
    const { holderType, holderId } = req.query;
    const holder = await resolveEntity(holderType, holderId, { allowOnlineName: true });
    if (!holder) return res.status(404).json({ message: 'Holder not found' });
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });
    const summary = await calculateCashPositionForHolder(holder);
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateCompanyCashDeposit(req, res) {
  try {
    const { holderType, holderId, date, amount, paymentMethodId, remarks = '' } = req.body;
    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0 || !paymentMethodId) {
      return res.status(400).json({ message: 'Amount and account are required' });
    }
    const holder = await resolveEntity(holderType, holderId, { allowOnlineName: true });
    if (!holder) return res.status(404).json({ message: 'Holder not found' });
    if (!userCanAccessEntity(req, holder.type, holder.id)) return res.status(403).json({ message: 'Holder access denied' });
    const isCashDeposit = String(paymentMethodId) === 'deposited_in_cash';
    const method = isCashDeposit ? null : await PaymentMethod.findById(paymentMethodId);
    if (!isCashDeposit && (!method || !method.isActive)) return res.status(404).json({ message: 'Selected company account is not active' });

    const summary = await calculateCashPositionForHolder(holder);
    if (value > Number(summary.cashAvailable || 0)) {
      return res.status(400).json({ message: 'Deposit amount cannot exceed cash available for this holder' });
    }

    const row = await CompanyCashDeposit.create({
      holderType: holder.type,
      holderId: holder.id,
      holderName: holder.name,
      date: date ? new Date(date) : new Date(),
      amount: value,
      paymentMethodId: isCashDeposit ? null : method._id,
      paymentMethodName: isCashDeposit ? 'Deposited in Cash' : method.name,
      remarks,
      submittedBy: req.user.id === 'super-admin' ? null : req.user.id,
      submittedByName: req.user.name || req.user.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'sales',
      entityType: 'CompanyCashDeposit',
      entityId: row._id,
      entityLabel: `${holder.name} PKR ${value}`,
      details: { holderType: holder.type, holderName: holder.name, amount: value, account: isCashDeposit ? 'Deposited in Cash' : method.name },
    });
    return res.status(201).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetCompanyCashDeposits(req, res) {
  try {
    const { holderType, holderId, status, dateFrom, dateTo } = req.query;
    const query = {};
    const normalizedHolderType = normalizeEntityType(holderType);
    if (normalizedHolderType && holderId) {
      query.holderType = normalizedHolderType;
      query.holderId = holderId;
      if (!userCanAccessEntity(req, normalizedHolderType, holderId)) return res.status(403).json({ message: 'Holder access denied' });
    } else if (req.user.role !== 'admin') {
      Object.assign(query, buildCompanyDepositAccessMatch(req));
    }
    if (status && ['pending', 'accepted', 'rejected'].includes(String(status))) query.status = status;
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
    const rows = await CompanyCashDeposit.find(query).sort({ status: -1, date: -1, createdAt: -1 }).limit(1500);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleReviewCompanyCashDeposit(req, res) {
  try {
    const { status, reviewRemarks = '' } = req.body;
    if (!['accepted', 'rejected'].includes(String(status))) {
      return res.status(400).json({ message: 'Review status must be accepted or rejected' });
    }
    const row = await CompanyCashDeposit.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Deposit request not found' });
    if (!userCanAccessEntity(req, row.holderType, row.holderId)) return res.status(403).json({ message: 'Holder access denied' });
    if (row.status !== 'pending') return res.status(400).json({ message: 'Only pending deposit requests can be reviewed' });

    row.status = status;
    row.reviewRemarks = reviewRemarks;
    row.reviewedBy = req.user.id === 'super-admin' ? null : req.user.id;
    row.reviewedByName = req.user.name || req.user.username || '';
    row.reviewedAt = new Date();
    await row.save();
    await recordAction(req, {
      action: status,
      module: 'sales',
      entityType: 'CompanyCashDeposit',
      entityId: row._id,
      entityLabel: `${row.holderName} PKR ${row.amount}`,
      details: { holderType: row.holderType, holderName: row.holderName, amount: row.amount, reviewRemarks },
    });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateCompanyCashDeposit(req, res) {
  try {
    const row = await CompanyCashDeposit.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Deposit request not found' });
    if (row.status !== 'pending') return res.status(400).json({ message: 'Only pending deposit requests can be edited' });
    if (!userCanAccessEntity(req, row.holderType, row.holderId)) return res.status(403).json({ message: 'Holder access denied' });

    const isSubmitter = row.submittedBy && String(row.submittedBy) === String(req.user.id);
    if (req.user.role !== 'admin' && !isSubmitter) {
      return res.status(403).json({ message: 'Only the initiating user or super admin can edit this pending deposit' });
    }

    const { date, amount, paymentMethodId, remarks = '' } = req.body;
    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0 || !paymentMethodId) {
      return res.status(400).json({ message: 'Amount and account are required' });
    }

    const isCashDeposit = String(paymentMethodId) === 'deposited_in_cash';
    const method = isCashDeposit ? null : await PaymentMethod.findById(paymentMethodId);
    if (!isCashDeposit && (!method || !method.isActive)) return res.status(404).json({ message: 'Selected company account is not active' });

    const holder = { type: row.holderType, id: row.holderId, name: row.holderName };
    const summary = await calculateCashPositionForHolder(holder);
    const editableCashAvailable = Number(summary.cashAvailable || 0) + Number(row.amount || 0);
    if (value > editableCashAvailable) {
      return res.status(400).json({ message: 'Deposit amount cannot exceed cash available for this holder' });
    }

    const before = row.toObject();
    row.date = date ? new Date(date) : row.date;
    row.amount = value;
    row.paymentMethodId = isCashDeposit ? null : method._id;
    row.paymentMethodName = isCashDeposit ? 'Deposited in Cash' : method.name;
    row.remarks = remarks;
    await row.save();

    await recordAction(req, {
      action: 'update',
      module: 'sales',
      entityType: 'CompanyCashDeposit',
      entityId: row._id,
      entityLabel: `${row.holderName} PKR ${row.amount}`,
      details: { before, after: row.toObject() },
    });
    return res.status(200).json({ success: true, row });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

function buildSalesCashAccessMatch(req, siteField = 'siteId') {
  if (req.user.role === 'admin') return {};
  const siteIds = (req.user.siteAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  return { [siteField]: { $in: siteIds } };
}

async function handleGetSalesCashTransactions(req, res) {
  try {
    const { dateFrom, dateTo, type = '', limit = 2000 } = req.query;
    const makeRange = () => {
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
      return Object.keys(range).length ? range : null;
    };
    const range = makeRange();
    const wanted = String(type || '').trim();
    const include = (key) => !wanted || wanted === key;

    const jobs = [];
    if (include('sale')) {
      jobs.push(
        SalePointEntry.find({
          ...buildSalesCashAccessMatch(req, 'siteId'),
          ...(range ? { date: range } : {}),
          $or: [
            { entryType: { $in: ['sale', 'return'] } },
            { entryType: { $exists: false } },
            { entryType: 'pay_later', paymentStatus: 'paid' },
          ],
        }).sort({ createdAt: -1 }).limit(Number(limit || 2000))
      );
    } else jobs.push(Promise.resolve([]));

    if (include('expense')) {
      const expenseMatch = range ? { date: range } : {};
      if (req.user.role !== 'admin') {
        const siteIds = (req.user.siteAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
        const warehouseIds = (req.user.warehouseAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
        const wholesellerIds = (req.user.wholesellerAccess || []).map((id) => new mongoose.Types.ObjectId(String(id)));
        expenseMatch.$or = [
          { holderType: 'site', holderId: { $in: siteIds } },
          { holderType: 'online', holderId: { $in: siteIds } },
          { holderType: 'warehouse', holderId: { $in: warehouseIds } },
          { holderType: 'wholeseller', holderId: { $in: wholesellerIds } },
          { siteId: { $in: siteIds } },
        ];
      }
      jobs.push(ExpenseEntry.find(expenseMatch).sort({ createdAt: -1 }).limit(Number(limit || 2000)));
    } else jobs.push(Promise.resolve([]));

    if (include('deposit')) {
      const depositMatch = range ? { date: range } : {};
      if (req.user.role !== 'admin') Object.assign(depositMatch, buildCompanyDepositAccessMatch(req));
      jobs.push(CompanyCashDeposit.find(depositMatch).sort({ createdAt: -1 }).limit(Number(limit || 2000)));
    } else jobs.push(Promise.resolve([]));

    const [salesRows, expenseRows, depositRows] = await Promise.all(jobs);
    const saleTransactions = salesRows.map((row) => {
      const isReturn = row.entryType === 'return';
      const isPayLaterPaid = row.entryType === 'pay_later' && row.paymentStatus === 'paid';
      return {
        id: String(row._id),
        date: isPayLaterPaid ? (row.paymentReceivedAt || row.updatedAt || row.createdAt) : (row.date || row.createdAt),
        transactionType: isReturn ? 'sale_return' : isPayLaterPaid ? 'pay_later_received' : 'sale',
        holderType: 'site',
        holderName: row.siteName,
        description: `${row.productName} x ${row.quantity}`,
        amount: isReturn ? -Number(row.netAmount || 0) : Number(isPayLaterPaid ? row.receivableAmount || row.netAmount || 0 : row.netAmount || 0),
        status: isPayLaterPaid ? 'paid' : row.entryType || 'sale',
        enteredByName: isPayLaterPaid ? (row.paymentReceivedByName || row.createdByName || '-') : (row.createdByName || '-'),
        remarks: row.customerName ? `Customer: ${row.customerName}` : '',
      };
    });
    const expenseTransactions = expenseRows.map((row) => ({
      id: String(row._id),
      date: row.date || row.createdAt,
      transactionType: 'expense',
      holderType: row.holderType || (String(row.siteName || '').toLowerCase() === 'online' ? 'online' : 'site'),
      holderName: row.holderName || row.siteName || '',
      description: `${row.headName || 'Expense'} - ${row.itemName || ''}`.trim(),
      amount: -Number(row.amount || 0),
      status: 'expense',
      enteredByName: row.enteredByName || '-',
      remarks: row.remarks || '',
    }));
    const depositTransactions = depositRows.map((row) => ({
      id: String(row._id),
      date: row.date || row.createdAt,
      transactionType: 'company_deposit',
      holderType: row.holderType,
      holderName: row.holderName,
      description: `Deposit to ${row.paymentMethodName}`,
      amount: -Number(row.amount || 0),
      status: row.status,
      enteredByName: row.submittedByName || '-',
      remarks: [row.remarks, row.reviewRemarks ? `Review: ${row.reviewRemarks}` : ''].filter(Boolean).join(' | '),
    }));
    const rows = [...saleTransactions, ...expenseTransactions, ...depositTransactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, Math.min(Number(limit || 2000), 5000));
    return res.status(200).json(rows);
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
      .populate('warehouseAccess', 'name code city isActive')
      .populate('wholesellerAccess', 'name code city isActive')
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
      warehouseAccess = [],
      wholesellerAccess = [],
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
      warehouseAccess,
      wholesellerAccess,
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
      warehouseAccess,
      wholesellerAccess,
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
    user.warehouseAccess = Array.isArray(warehouseAccess) ? warehouseAccess : user.warehouseAccess;
    user.wholesellerAccess = Array.isArray(wholesellerAccess) ? wholesellerAccess : user.wholesellerAccess;
    user.farmBlockAccess = Array.isArray(farmBlockAccess) ? farmBlockAccess : user.farmBlockAccess;
    if (typeof isFarmUser === 'boolean') user.isFarmUser = isFarmUser;
    if (typeof isSalesUser === 'boolean') user.isSalesUser = isSalesUser;
    user.permissions = permissions ?? user.permissions;
    if (typeof isActive === 'boolean') user.isActive = isActive;

    const newPassword = String(password || '').trim();
    const newConfirmPassword = String(confirmPassword || '').trim();
    if (newPassword || newConfirmPassword) {
      if (!newPassword || !newConfirmPassword || newPassword !== newConfirmPassword) {
        return res.status(400).json({ message: 'Password confirmation does not match' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      user.password = newPassword;
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
    return res.status(410).json({ message: 'Legacy global stock adjustment is disabled. Use holder/lot-based adjustment.' });
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

async function handleStockLedger(req, res) {
  try {
    let query = {};
    const { holderType, holderId, movementType, productId, dateFrom, dateTo, limit = 1500, all } = req.query;
    const normalizedHolderType = normalizeEntityType(holderType);
    if (normalizedHolderType) query.holderType = normalizedHolderType;
    if (holderId) query.holderId = holderId;
    if (movementType) query.movementType = movementType;
    if (productId) query.productId = productId;
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
      query.createdAt = range;
    }
    if (req.user.role !== 'admin') {
      const siteIds = Array.from(new Set((req.user.siteAccess || []).map(String)));
      const warehouseIds = Array.from(new Set((req.user.warehouseAccess || []).map(String)));
      const wholesellerIds = Array.from(new Set((req.user.wholesellerAccess || []).map(String)));
      const accessOr = [
        { holderType: 'site', holderId: { $in: siteIds } },
        { holderType: 'online', holderId: { $in: siteIds } },
        { holderType: 'warehouse', holderId: { $in: warehouseIds } },
        { holderType: 'wholeseller', holderId: { $in: wholesellerIds } },
      ];
      query = query.$or ? { $and: [query, { $or: accessOr }] } : { ...query, $or: accessOr };
    }
    const queryBuilder = StockLedger.find(query).sort({ createdAt: -1 });
    if (String(all) !== 'true') {
      queryBuilder.limit(Math.min(Number(limit || 1500), 5000));
    }
    const rows = await queryBuilder;
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
    const rows = await PaymentMethod.find({ isActive: true, showToOnlineCustomers: true }).sort({ createdAt: -1 });
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
      showToOnlineCustomers = false,
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
      showToOnlineCustomers: Boolean(showToOnlineCustomers),
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
    if (payload.showToOnlineCustomers !== undefined) payload.showToOnlineCustomers = Boolean(payload.showToOnlineCustomers);
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

async function handleDeleteOrder(req, res) {
  try {
    const isSuperAdmin = req.user?.id === 'super-admin' || String(req.user?.username || '').toLowerCase() === 'admin';
    if (!isSuperAdmin) return res.status(403).json({ message: 'Only super admin can delete orders' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const restoredLots = [];
    if (order?.stockReservation?.onlineDispatchDeductedAt) {
      const onlineSite = await ensureOnlineSite();
      for (const item of (order.stockReservation.items || [])) {
        const qty = Number(item.reservedQty || item.requestedQty || 0);
        if (!item.productId || qty <= 0) continue;
        const product = await Product.findById(item.productId).select('name');
        const productName = product?.name || item.productName || 'Product';
        const lotCode = await makeSimpleLotCode(productName, qty);
        const lot = await StockLot.create({
          holderType: 'online',
          holderId: onlineSite._id,
          holderName: 'online',
          productId: item.productId,
          productName,
          lotCode,
          quantityInitial: qty,
          quantityAvailable: qty,
          unitCost: 0,
          sourceRefType: 'order_delete_restore',
          sourceRefId: order._id,
          notes: `Deleted order ${order.orderNumber} stock restoration`,
        });
        restoredLots.push(lot.lotCode);
        await createStockLedgerRow({
          movementType: 'in',
          holderType: 'online',
          holderId: onlineSite._id,
          holderName: 'online',
          productId: item.productId,
          productName,
          lotId: lot._id,
          lotCode: lot.lotCode,
          quantity: qty,
          unitCost: 0,
          referenceType: 'order_delete_restore',
          referenceId: order._id,
          remarks: `Deleted order ${order.orderNumber} and restored dispatched online stock`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || req.user.username || '',
        });
      }
    }

    if (order?.stockRequest?.requestId) {
      await OrderStockRequest.deleteOne({ _id: order.stockRequest.requestId });
    }
    await Order.deleteOne({ _id: order._id });
    await recordAction(req, {
      action: 'delete_order',
      module: 'Orders',
      entityType: 'Order',
      entityId: order._id,
      entityLabel: order.orderNumber,
      details: {
        orderNumber: order.orderNumber,
        status: order.status,
        customer: order.customer?.name || '',
        finalAmount: order.finalAmount,
        restoredLots,
      },
    });

    return res.status(200).json({ success: true, message: 'Order deleted successfully.', restoredLots });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateOrderStockRequest(req, res) {
  try {
    const siteId = req.body?.siteId || req.body?.sourceSiteId || '';
    if (!siteId) return res.status(400).json({ message: 'siteId is required' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'pending_confirmation') return res.status(400).json({ message: 'Only pending orders can request stock' });
    if (order.stockRequest?.status === 'pending') return res.status(400).json({ message: 'Stock request already pending' });
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Source site not found' });

    const items = (order.items || []).map((it) => ({
      productId: it.productId || null,
      productName: it.name,
      quantity: Number(it.quantity || 0),
    })).filter((x) => x.quantity > 0);

    const request = await OrderStockRequest.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      sourceSiteId: site._id,
      sourceSiteName: site.name,
      status: 'pending',
      items,
      requestedBy: req.user.id === 'super-admin' ? null : req.user.id,
      requestedByName: req.user.name || req.user.username || '',
    });

    order.stockRequest = {
      requestId: request._id,
      status: 'pending',
      sourceSiteId: site._id,
      sourceSiteName: site.name,
      requestedAt: new Date(),
      requestedByName: req.user.name || req.user.username || '',
      respondedAt: null,
      respondedByName: '',
    };
    await order.save();

    const stockTransferLink = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/stock-transfer`;
    const subject = `Stock Request - Order ${order.orderNumber}`;
    const text = `A stock request is awaiting your action for Order ${order.orderNumber}.\nSource Site: ${site.name}\nOpen after login: ${stockTransferLink}`;
    const html = `<p>A stock request is awaiting your action for Order <strong>${order.orderNumber}</strong>.</p><p>Source Site: <strong>${site.name}</strong></p><p><a href="${stockTransferLink}">Open Stock Transfer Page</a></p>`;
    await sendOrderStockRequestEmailsForSite(site._id, subject, text, html);

    return res.status(201).json({ success: true, request, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCancelOrderStockRequest(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.stockRequest?.status !== 'pending' || !order.stockRequest?.requestId) {
      return res.status(400).json({ message: 'No pending stock request to cancel' });
    }
    const request = await OrderStockRequest.findById(order.stockRequest.requestId);
    if (request && request.status === 'pending') {
      request.status = 'cancelled';
      request.respondedAt = new Date();
      request.respondedBy = req.user.id === 'super-admin' ? null : req.user.id;
      request.respondedByName = req.user.name || req.user.username || '';
      await request.save();
    }
    order.stockRequest.status = 'cancelled';
    order.stockRequest.respondedAt = new Date();
    order.stockRequest.respondedByName = req.user.name || req.user.username || '';
    await order.save();
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetPendingOrderStockRequests(req, res) {
  try {
    let rows = await OrderStockRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(500);
    if (req.user.role !== 'admin') {
      const siteSet = new Set((req.user.siteAccess || []).map(String));
      rows = rows.filter((r) => siteSet.has(String(r.sourceSiteId)));
    }
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRespondOrderStockRequest(req, res) {
  try {
    const { action, lotSelections = [] } = req.body;
    if (!['accepted', 'rejected'].includes(String(action || ''))) {
      return res.status(400).json({ message: 'Invalid action' });
    }
    const request = await OrderStockRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Stock request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Stock request already processed' });
    if (!userCanAccessEntity(req, 'site', request.sourceSiteId)) return res.status(403).json({ message: 'No access to source site' });
    const order = await Order.findById(request.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (action === 'accepted') {
      const online = await ensureOnlineSite();
      const consumedAll = [];
      const hasManualLotSelections = Array.isArray(lotSelections) && lotSelections.length > 0;
      if (hasManualLotSelections) {
        const normalizedSelections = lotSelections.map((s) => ({
          itemIndex: Number(s?.itemIndex),
          allocations: Array.isArray(s?.allocations) ? s.allocations.map((a) => ({
            lotId: String(a?.lotId || ''),
            quantity: Number(a?.quantity || 0),
          })) : [],
        }));
        for (let idx = 0; idx < (request.items || []).length; idx += 1) {
          const it = request.items[idx];
          const neededQty = Number(it.quantity || 0);
          const sel = normalizedSelections.find((x) => x.itemIndex === idx);
          if (!sel || !Array.isArray(sel.allocations) || sel.allocations.length === 0) {
            return res.status(400).json({ message: `Select lot quantities for ${it.productName}` });
          }
          const totalSelectedQty = sel.allocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
          if (Number(totalSelectedQty) !== Number(neededQty)) {
            return res.status(400).json({ message: `Selected lot quantities for ${it.productName} must equal requested quantity (${neededQty})` });
          }
          const lotUsageMap = new Map();
          for (const alloc of sel.allocations) {
            const allocQty = Number(alloc.quantity || 0);
            if (!alloc.lotId || allocQty <= 0 || !Number.isInteger(allocQty)) {
              return res.status(400).json({ message: `Invalid lot allocation for ${it.productName}` });
            }
            lotUsageMap.set(
              alloc.lotId,
              Number(lotUsageMap.get(alloc.lotId) || 0) + allocQty
            );
          }
          for (const [lotId, qtyToTake] of lotUsageMap.entries()) {
            const lot = await StockLot.findById(lotId);
            if (!lot) return res.status(404).json({ message: `Selected lot not found for ${it.productName}` });
            if (String(lot.holderType) !== 'site' || String(lot.holderId) !== String(request.sourceSiteId)) {
              return res.status(400).json({ message: `Selected lot does not belong to ${request.sourceSiteName}` });
            }
            if (String(lot.productName || '').trim().toLowerCase() !== String(it.productName || '').trim().toLowerCase()) {
              return res.status(400).json({ message: `Selected lot product mismatch for ${it.productName}` });
            }
            if (Number(lot.quantityAvailable || 0) < Number(qtyToTake)) {
              return res.status(400).json({ message: `Selected lot has insufficient quantity for ${it.productName}` });
            }
            lot.quantityAvailable = Number(lot.quantityAvailable || 0) - Number(qtyToTake);
            await lot.save();
            consumedAll.push({
              lotId: lot._id,
              lotCode: lot.lotCode,
              productId: lot.productId || it.productId || null,
              productName: lot.productName || it.productName,
              qty: Number(qtyToTake),
              unitCost: Number(lot.unitCost || 0),
            });
          }
        }
      } else {
        for (const it of request.items || []) {
          const consumed = await consumeSiteProductLotsByName(request.sourceSiteId, it.productName, Number(it.quantity || 0));
          if (!consumed.ok) {
            for (const c of consumedAll) {
              const lot = await StockLot.findById(c.lotId);
              if (lot) {
                lot.quantityAvailable = Number(lot.quantityAvailable || 0) + Number(c.qty || 0);
                await lot.save();
              }
            }
            return res.status(400).json({ message: `Insufficient stock for ${it.productName} at ${request.sourceSiteName}` });
          }
          consumedAll.push(...consumed.touched);
        }
      }

      for (const c of consumedAll) {
        await createStockLedgerRow({
          movementType: 'transfer_out',
          holderType: 'site',
          holderId: request.sourceSiteId,
          holderName: request.sourceSiteName,
          productId: c.productId || null,
          productName: c.productName,
          lotId: c.lotId,
          lotCode: c.lotCode,
          quantity: -Number(c.qty || 0),
          unitCost: Number(c.unitCost || 0),
          referenceType: 'order_stock_request',
          referenceId: request._id,
          counterpartType: 'online',
          counterpartId: online._id,
          counterpartName: 'online',
          remarks: `Order stock request accepted ${order.orderNumber}`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || '',
        });

        const generatedInLotCode = await makeSimpleLotCode(c.productName, Number(c.qty || 0));
        const existingLot = await StockLot.findOne({ holderType: 'online', holderId: online._id, lotCode: generatedInLotCode, productName: c.productName });
        if (existingLot) {
          existingLot.quantityInitial = Number(existingLot.quantityInitial || 0) + Number(c.qty || 0);
          existingLot.quantityAvailable = Number(existingLot.quantityAvailable || 0) + Number(c.qty || 0);
          await existingLot.save();
        } else {
          await StockLot.create({
            holderType: 'online',
            holderId: online._id,
            holderName: 'online',
            productId: c.productId || null,
            productName: c.productName,
            lotCode: generatedInLotCode,
            quantityInitial: Number(c.qty || 0),
            quantityAvailable: Number(c.qty || 0),
            unitCost: Number(c.unitCost || 0),
            sourceRefType: 'order_stock_request',
            sourceRefId: request._id,
            notes: `Online stock received for order ${order.orderNumber}`,
          });
        }
      }

      // Also write a stock-transfer transaction record so this flow is visible
      // in the main Stock Transfer history table.
      await StockTransfer.create({
        transferNumber: makeTransferNumber(),
        fromType: 'site',
        fromId: request.sourceSiteId,
        fromName: request.sourceSiteName || 'Site',
        toType: 'online',
        toId: online._id,
        toName: 'online',
        status: 'accepted',
        items: consumedAll.map((c) => ({
          productId: c.productId || null,
          productName: c.productName || '',
          lotId: c.lotId,
          lotCode: c.lotCode,
          requestedQty: Number(c.qty || 0),
          acceptedQty: Number(c.qty || 0),
          returnedQty: 0,
          unitCost: Number(c.unitCost || 0),
          notes: `Online order stock request ${order.orderNumber}`,
        })),
        senderRemarks: `Auto-created from order stock request ${order.orderNumber}`,
        receiverRemarks: `Accepted for online order ${order.orderNumber}`,
        responseAt: new Date(),
        createdBy: request.requestedBy || null,
        createdByName: request.requestedByName || '',
        respondedBy: req.user.id === 'super-admin' ? null : req.user.id,
        respondedByName: req.user.name || req.user.username || '',
      });

      order.stockReservation = {
        isReserved: true,
        reservedSiteId: request.sourceSiteId,
        reservedSiteName: request.sourceSiteName,
        reservedAt: new Date(),
        reservedByName: req.user.name || req.user.username || '',
        items: (request.items || []).map((i) => ({
          productId: i.productId || null,
          productName: i.productName || '',
          requestedQty: Number(i.quantity || 0),
          reservedQty: Number(i.quantity || 0),
        })),
      };
      order.stockRequest = {
        ...(order.stockRequest || {}),
        status: 'accepted',
        respondedAt: new Date(),
        respondedByName: req.user.name || req.user.username || '',
      };
      await order.save();
    } else {
      order.stockRequest = {
        ...(order.stockRequest || {}),
        status: 'rejected',
        respondedAt: new Date(),
        respondedByName: req.user.name || req.user.username || '',
      };
      await order.save();
    }

    request.status = action;
    request.respondedAt = new Date();
    request.respondedBy = req.user.id === 'super-admin' ? null : req.user.id;
    request.respondedByName = req.user.name || req.user.username || '';
    await request.save();

    const deskName = request.requestedByName || 'order-desk';
    const subject = `[Order Desk: ${deskName}] Order ${order.orderNumber} Stock Request ${action === 'accepted' ? 'Accepted' : 'Rejected'}`;
    const text = action === 'accepted'
      ? `Stock request for order ${order.orderNumber} has been accepted by ${request.sourceSiteName}. You may now confirm the order.`
      : `Stock request for order ${order.orderNumber} has been rejected by ${request.sourceSiteName}. You can cancel or request from another store.`;
    const fallbackEmail = 'engr.dr.ahmed.sohaib@gmail.com';
    const recipients = new Set();

    // Always notify the original requester (if email exists)
    let targetEmail = '';
    if (request?.requestedBy) {
      const requesterUser = await userDetails.findById(request.requestedBy).select('email');
      targetEmail = String(requesterUser?.email || '').trim().toLowerCase();
    }
    if (targetEmail) recipients.add(targetEmail);

    // Also notify directed online admin users (stock-transfer manage + online access)
    const onlineSite = await ensureOnlineSite();
    const onlineRecipients = await getStockTransferRecipientsByEntity('online', onlineSite?._id);
    (onlineRecipients || []).forEach((em) => { if (em) recipients.add(String(em).trim().toLowerCase()); });

    if (!recipients.size) recipients.add(fallbackEmail);
    await sendMail({ to: Array.from(recipients).join(','), subject, text });

    return res.status(200).json({ success: true, request, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetOrderStockOptions(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const sites = await Site.find({ isActive: true }).sort({ name: 1 });
    const rows = await Promise.all(sites.map(async (s) => {
      const items = await Promise.all((order.items || []).map(async (it) => {
        const availableQty = await getSiteProductAvailableQtyByName(s._id, it.name);
        return {
          productName: it.name,
          requiredQty: Number(it.quantity || 0),
          availableQty,
          isEnough: availableQty >= Number(it.quantity || 0),
        };
      }));
      const canFulfill = items.every((i) => i.isEnough);
      return { siteId: s._id, siteName: s.name, canFulfill, items };
    }));
    return res.status(200).json({ orderId: order._id, options: rows });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleReserveOrderStock(req, res) {
  try {
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ message: 'siteId is required' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'pending_confirmation') return res.status(400).json({ message: 'Only pending orders can be reserved' });
    if (order.stockReservation?.isReserved) return res.status(400).json({ message: 'Order stock already reserved' });
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const consumedAll = [];
    for (const it of (order.items || [])) {
      const needed = Number(it.quantity || 0);
      const consumed = await consumeSiteProductLotsByName(site._id, it.name, needed);
      if (!consumed.ok) {
        // rollback previous consumptions by recreating available qty
        for (const c of consumedAll) {
          const lot = await StockLot.findById(c.lotId);
          if (lot) {
            lot.quantityAvailable = Number(lot.quantityAvailable || 0) + Number(c.qty || 0);
            await lot.save();
          }
        }
        return res.status(400).json({ message: `Insufficient stock for ${it.name} at ${site.name}` });
      }
      consumedAll.push(...consumed.touched);
    }

    for (const c of consumedAll) {
      await createStockLedgerRow({
        movementType: 'out',
        holderType: 'site',
        holderId: site._id,
        holderName: site.name,
        productId: c.productId || null,
        productName: c.productName,
        lotId: c.lotId,
        lotCode: c.lotCode,
        quantity: -Number(c.qty || 0),
        unitCost: Number(c.unitCost || 0),
        referenceType: 'online_order_reserve',
        referenceId: order._id,
        remarks: `Reserved for order ${order.orderNumber}`,
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
    }

    order.stockReservation = {
      isReserved: true,
      reservedSiteId: site._id,
      reservedSiteName: site.name,
      reservedAt: new Date(),
      reservedByName: req.user.name || req.user.username || '',
      items: (order.items || []).map((i) => ({
        productId: i.productId || null,
        productName: i.name || '',
        requestedQty: Number(i.quantity || 0),
        reservedQty: Number(i.quantity || 0),
      })),
    };
    await order.save();
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleConfirmOrder(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order?.stockReservation?.isReserved) {
      return res.status(400).json({ message: 'Reserve stock first before confirmation' });
    }
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
    if (order?.stockReservation?.isReserved && order?.stockReservation?.reservedSiteId) {
      for (const it of (order.stockReservation.items || [])) {
        const product = await Product.findById(it.productId).select('name');
        await addSiteProductReturnLot(
          order.stockReservation.reservedSiteId,
          order.stockReservation.reservedSiteName || 'Site',
          { _id: it.productId, name: product?.name || it.productName || 'Product' },
          Number(it.reservedQty || 0),
          0
        );
      }
      order.stockReservation.isReserved = false;
    }
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
    const { items = [], discountAmount = 0, paymentMethodId, fulfilmentSiteId } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Items are required' });
    if (!fulfilmentSiteId) return res.status(400).json({ message: 'fulfilmentSiteId is required' });

    const fulfilmentSite = await Site.findById(fulfilmentSiteId).select('name');
    if (!fulfilmentSite) return res.status(404).json({ message: 'Fulfilment site not found' });

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

      if (!productHasSiteAssignment(product, fulfilmentSite._id, fulfilmentSite.name)) {
        return res.status(400).json({ message: `${product.name} is not assigned to ${fulfilmentSite.name}` });
      }

      const availableQty = await getSiteProductAvailableQtyByName(fulfilmentSite._id, product.name);
      if (qty > Number(availableQty || 0)) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.name} at ${fulfilmentSite.name}. Available: ${Number(availableQty || 0)}`,
        });
      }

      normalizedItems.push({
        productId: product._id,
        name: product.name,
        price: Number(getProductSitePrice(product, fulfilmentSite._id, product.price) || 0),
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

async function handlePreviewFulfilmentSites(req, res) {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Items are required' });
    const normalizedItems = [];
    for (const it of items) {
      const productId = it?.productId;
      const qty = Number(it?.quantity || 0);
      if (!productId || qty < 1) return res.status(400).json({ message: 'Each item requires product and quantity' });
      const product = await Product.findById(productId).select('name');
      if (!product) return res.status(400).json({ message: `Product not found for item ${productId}` });
      normalizedItems.push({ productId: product._id, productName: product.name, quantity: qty });
    }

    const sites = await Site.find({ isActive: true }).sort({ name: 1 }).select('name');
    const rows = await Promise.all(sites.map(async (s) => {
      const details = await Promise.all(normalizedItems.map(async (it) => {
        const availableQty = await getSiteProductAvailableQtyByName(s._id, it.productName);
        return {
          productName: it.productName,
          requiredQty: it.quantity,
          availableQty,
          isEnough: availableQty >= it.quantity,
        };
      }));
      const canFulfill = details.every((d) => d.isEnough);
      return { siteId: s._id, siteName: s.name, canFulfill, items: details };
    }));
    return res.status(200).json({ options: rows });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFulfilmentSiteProducts(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json({ message: 'siteId is required' });
    const site = await Site.findById(siteId).select('name');
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const products = await Product.find({ isActive: true }).select('name price quantity locationPrices');
    const mapped = await Promise.all(
      products
        .filter((p) => productHasSiteAssignment(p, site._id, site.name))
        .map(async (p) => {
          const availableQty = await getSiteProductAvailableQtyByName(site._id, p.name);
          return {
            _id: p._id,
            name: p.name,
            price: getProductSitePrice(p, site._id, p.price),
            availableQty,
          };
        })
    );
    return res.status(200).json(mapped.filter((p) => Number(p.availableQty || 0) > 0));
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
    const shouldDeductOnlineStock =
      order?.stockReservation?.isReserved &&
      !order?.stockReservation?.onlineDispatchDeductedAt &&
      String(order?.stockRequest?.status || '').toLowerCase() === 'accepted';

    if (shouldDeductOnlineStock) {
      const onlineSite = await ensureOnlineSite();
      const consumedAll = [];
      for (const it of (order.items || [])) {
        const needed = Number(it.quantity || 0);
        if (needed <= 0) continue;
        const consumed = await consumeHolderProductLotsByName('online', onlineSite._id, it.name, needed);
        if (!consumed.ok) {
          for (const c of consumedAll) {
            const lot = await StockLot.findById(c.lotId);
            if (lot) {
              lot.quantityAvailable = Number(lot.quantityAvailable || 0) + Number(c.qty || 0);
              await lot.save();
            }
          }
          return res.status(400).json({ message: `Insufficient online stock for ${it.name}. Dispatch cannot be completed.` });
        }
        consumedAll.push(...consumed.touched);
      }

      for (const c of consumedAll) {
        await createStockLedgerRow({
          movementType: 'out',
          holderType: 'online',
          holderId: onlineSite._id,
          holderName: 'online',
          productId: c.productId || null,
          productName: c.productName,
          lotId: c.lotId,
          lotCode: c.lotCode,
          quantity: -Number(c.qty || 0),
          unitCost: Number(c.unitCost || 0),
          referenceType: 'online_order_dispatch',
          referenceId: order._id,
          remarks: `Dispatched online order ${order.orderNumber}`,
          createdBy: req.user.id === 'super-admin' ? null : req.user.id,
          createdByName: req.user.name || req.user.username || '',
        });
      }
      order.stockReservation.onlineDispatchDeductedAt = new Date();
      order.stockReservation.onlineDispatchDeductedByName = req.user.name || req.user.username || '';
    }
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
    try {
      await sendOrderAlertEmails(
        `Order Dispatched - ${order.orderNumber}`,
        `Order ${order.orderNumber} dispatched.\nTracking: ${trackingNumber}\nCourier: ${courier.name}\nCourier Contact: ${order.courier.courierHelpline}\nJM Contact: ${order.courier.jmmContactPersonName} ${order.courier.jmmContactNumber}`,
        order.customer?.email
      );
    } catch (mailErr) {
      logger.warn('Order dispatched but notification email failed', {
        orderNumber: order.orderNumber,
        error: mailErr?.message || String(mailErr),
      });
    }
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleAssignCourier(req, res) {
  try {
    const { id } = req.params;
    const { courierId, trackingNumber = '', paymentMode = 'cod' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const courier = await Courier.findById(courierId);
    if (!courier) return res.status(404).json({ message: 'Courier not found' });

    order.paymentMode = paymentMode;
    order.courier = {
      courierId: courier._id,
      courierName: courier.name,
      trackingNumber,
      courierHelpline: courier.contactNumber || '',
      jmmContactPersonName: courier.jmmContactPersonName || '',
      jmmContactNumber: courier.jmmContactNumber || '',
    };
    await order.save();
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
    if (order?.stockReservation?.isReserved && order?.stockReservation?.reservedSiteId) {
      for (const it of (order.stockReservation.items || [])) {
        const product = await Product.findById(it.productId).select('name');
        await addSiteProductReturnLot(
          order.stockReservation.reservedSiteId,
          order.stockReservation.reservedSiteName || 'Site',
          { _id: it.productId, name: product?.name || it.productName || 'Product' },
          Number(it.reservedQty || 0),
          0
        );
      }
      order.stockReservation.isReserved = false;
    }
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

async function handleResolveReturnedAsWasted(req, res) {
  try {
    const { id } = req.params;
    const { reason = 'Marked wasted after return' } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'returned') return res.status(400).json({ message: 'Only returned orders can be marked wasted' });

    const onlineSite = await ensureOnlineSite();
    for (const it of (order.items || [])) {
      await StockWastedEntry.create({
        siteId: onlineSite._id,
        siteName: 'online',
        productId: it.productId,
        productName: it.name || 'Product',
        date: new Date(),
        quantity: Number(it.quantity || 0),
        notes: `Returned order wasted (${order.orderNumber})${reason ? ` - ${reason}` : ''}`,
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
    }

    order.adminRemarks = `${order.adminRemarks || ''}\n[Return Resolution: WASTED] ${reason}`.trim();
    await order.save();
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleResolveReturnedToStore(req, res) {
  try {
    const { id } = req.params;
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ message: 'siteId is required' });
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'returned') return res.status(400).json({ message: 'Only returned orders can be returned to store' });
    const site = await Site.findById(siteId);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const online = await ensureOnlineSite();
    const transferItems = [];
    for (const it of (order.items || [])) {
      const lot = await addSiteProductReturnLot(
        site._id,
        site.name,
        { _id: it.productId, name: it.name },
        Number(it.quantity || 0),
        Number(it.price || 0)
      );
      transferItems.push({
        productId: it.productId || lot.productId || null,
        productName: it.name || lot.productName || 'Product',
        lotId: lot._id,
        lotCode: lot.lotCode,
        requestedQty: Number(it.quantity || 0),
        acceptedQty: Number(it.quantity || 0),
        returnedQty: 0,
        unitCost: Number(it.price || 0),
        notes: `Returned order ${order.orderNumber} restored to ${site.name}`,
      });
    }

    const transfer = await StockTransfer.create({
      transferNumber: makeTransferNumber(),
      fromType: 'online',
      fromId: online._id,
      fromName: `Returned Order ${order.orderNumber}`,
      toType: 'site',
      toId: site._id,
      toName: site.name,
      status: 'accepted',
      items: transferItems,
      senderRemarks: `Order return moved to store (${order.orderNumber})`,
      receiverRemarks: `Accepted return at ${site.name}`,
      responseAt: new Date(),
      createdBy: req.user.id === 'super-admin' ? null : req.user.id,
      createdByName: req.user.name || req.user.username || '',
      respondedBy: req.user.id === 'super-admin' ? null : req.user.id,
      respondedByName: req.user.name || req.user.username || '',
    });

    for (const row of transferItems) {
      await createStockLedgerRow({
        movementType: 'transfer_in',
        holderType: 'site',
        holderId: site._id,
        holderName: site.name,
        productId: row.productId,
        productName: row.productName,
        lotId: row.lotId,
        lotCode: row.lotCode,
        quantity: Number(row.acceptedQty || 0),
        unitCost: Number(row.unitCost || 0),
        referenceType: 'stock_transfer',
        referenceId: transfer._id,
        counterpartType: 'online',
        counterpartId: online._id,
        counterpartName: `Returned Order ${order.orderNumber}`,
        remarks: `Returned order restored to store`,
        createdBy: req.user.id === 'super-admin' ? null : req.user.id,
        createdByName: req.user.name || req.user.username || '',
      });
    }
    order.adminRemarks = `${order.adminRemarks || ''}\n[Return Resolution: RETURNED TO STORE] ${site.name}`.trim();
    await order.save();
    return res.status(200).json({ success: true, order, transfer });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleRedirectReturnedOrder(req, res) {
  try {
    const { id } = req.params;
    const {
      customer = {},
      courierId,
      trackingNumber = '',
      paymentMode = 'prepaid',
      paymentMethodName = '',
      remarks = '',
    } = req.body;
    const oldOrder = await Order.findById(id);
    if (!oldOrder) return res.status(404).json({ message: 'Order not found' });
    if (oldOrder.status !== 'returned') return res.status(400).json({ message: 'Only returned orders can be redirected' });
    const courier = await Courier.findById(courierId);
    if (!courier) return res.status(404).json({ message: 'Courier not found' });

    const redirected = await Order.create({
      orderNumber: await getNextOrderNumber(),
      customer: {
        name: customer.name || '',
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        otherCity: customer.otherCity || '',
        postalCode: customer.postalCode || '',
        mobile: customer.mobile || '',
      },
      items: oldOrder.items || [],
      subtotal: Number(oldOrder.subtotal || 0),
      shippingRate: Number(oldOrder.shippingRate || 0),
      shippingCost: Number(oldOrder.shippingCost || 0),
      totalCost: Number(oldOrder.totalCost || 0),
      discountAmount: Number(oldOrder.discountAmount || 0),
      finalAmount: Number(oldOrder.finalAmount || oldOrder.totalCost || 0),
      paymentMode,
      paymentDetails: {
        ...(oldOrder.paymentDetails || {}),
        methodName: paymentMethodName || oldOrder?.paymentDetails?.methodName || '',
      },
      status: 'dispatched',
      statusTimeline: { placedAt: new Date(), confirmedAt: new Date(), dispatchedAt: new Date() },
      courier: {
        courierId: courier._id,
        courierName: courier.name,
        trackingNumber,
        courierHelpline: courier.contactNumber || '',
        jmmContactPersonName: courier.jmmContactPersonName || '',
        jmmContactNumber: courier.jmmContactNumber || '',
      },
      adminRemarks: `Redirected from returned order ${oldOrder.orderNumber}${remarks ? ` | Remarks: ${remarks}` : ''}`,
    });
    oldOrder.adminRemarks = `${oldOrder.adminRemarks || ''}\n[Return Resolution: REDIRECTED] ${redirected.orderNumber}`.trim();
    await oldOrder.save();

    await sendOrderAlertEmails(
      `Order Confirmed & Dispatched - ${redirected.orderNumber}`,
      `Your order ${redirected.orderNumber} is confirmed and dispatched.\nTracking: ${trackingNumber}\nCourier: ${courier.name}`,
      redirected.customer?.email
    );
    return res.status(201).json({ success: true, redirectedOrder: redirected });
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

async function ensureDefaultFarmExpenseSetup() {
  let othersHead = await FarmExpenseHead.findOne({ name: { $regex: /^others$/i } });
  if (!othersHead) {
    othersHead = await FarmExpenseHead.create({ name: 'Others', colorCode: '#166534', isActive: true });
  }
  const othersItem = await FarmExpenseItem.findOne({ headId: othersHead._id, name: { $regex: /^others$/i } });
  if (!othersItem) {
    await FarmExpenseItem.create({ headId: othersHead._id, name: 'Others', isActive: true });
  }
}

async function handleGetFarmExpenseHeads(req, res) {
  try {
    await ensureDefaultFarmExpenseSetup();
    const rows = await FarmExpenseHead.find({}).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmExpenseHead(req, res) {
  try {
    const { name, colorCode = '#166534' } = req.body;
    const safeName = String(name || '').trim();
    if (!safeName) return res.status(400).json({ message: 'Farm expense head name is required' });
    const exists = await FarmExpenseHead.findOne({ name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Farm expense head already exists' });
    const row = await FarmExpenseHead.create({ name: safeName, colorCode, isActive: true });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmExpenseHead(req, res) {
  try {
    const { id } = req.params;
    const { name, colorCode, isActive } = req.body;
    const row = await FarmExpenseHead.findById(id);
    if (!row) return res.status(404).json({ message: 'Farm expense head not found' });
    if (name !== undefined) {
      const safeName = String(name || '').trim();
      if (!safeName) return res.status(400).json({ message: 'Farm expense head name is required' });
      const exists = await FarmExpenseHead.findOne({
        _id: { $ne: row._id },
        name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (exists) return res.status(400).json({ message: 'Farm expense head already exists' });
      row.name = safeName;
    }
    if (colorCode !== undefined) row.colorCode = String(colorCode || '#166534').trim();
    if (isActive !== undefined) row.isActive = !!isActive;
    await row.save();
    await FarmExpenseEntry.updateMany({ headId: row._id }, { $set: { headName: row.name } });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmExpenseHead(req, res) {
  try {
    const { id } = req.params;
    const itemCount = await FarmExpenseItem.countDocuments({ headId: id });
    if (itemCount > 0) return res.status(400).json({ message: 'Cannot delete head with linked farm expense names.' });
    const entryCount = await FarmExpenseEntry.countDocuments({ headId: id });
    if (entryCount > 0) return res.status(400).json({ message: 'Cannot delete head with farm expense history.' });
    const deleted = await FarmExpenseHead.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Farm expense head not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmExpenseItems(req, res) {
  try {
    await ensureDefaultFarmExpenseSetup();
    const { headId = '', activeOnly = '' } = req.query;
    const query = {};
    if (headId) query.headId = headId;
    if (String(activeOnly) === 'true') query.isActive = true;
    const rows = await FarmExpenseItem.find(query).sort({ name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmExpenseItem(req, res) {
  try {
    const { headId, name } = req.body;
    const safeName = String(name || '').trim();
    if (!headId || !safeName) return res.status(400).json({ message: 'headId and farm expense name are required' });
    const head = await FarmExpenseHead.findById(headId);
    if (!head) return res.status(404).json({ message: 'Farm expense head not found' });
    const exists = await FarmExpenseItem.findOne({ headId, name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Farm expense name already exists in this head' });
    const row = await FarmExpenseItem.create({ headId, name: safeName, isActive: true });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmExpenseItem(req, res) {
  try {
    const { id } = req.params;
    const { headId, name, isActive } = req.body;
    const row = await FarmExpenseItem.findById(id);
    if (!row) return res.status(404).json({ message: 'Farm expense name not found' });
    const nextHeadId = headId || row.headId;
    const safeName = String(name || row.name || '').trim();
    if (!safeName) return res.status(400).json({ message: 'Farm expense name is required' });
    const head = await FarmExpenseHead.findById(nextHeadId);
    if (!head) return res.status(404).json({ message: 'Farm expense head not found' });
    const exists = await FarmExpenseItem.findOne({
      _id: { $ne: row._id },
      headId: nextHeadId,
      name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (exists) return res.status(400).json({ message: 'Farm expense name already exists in this head' });
    row.headId = nextHeadId;
    row.name = safeName;
    if (isActive !== undefined) row.isActive = !!isActive;
    await row.save();
    await FarmExpenseEntry.updateMany({ itemId: row._id }, { $set: { itemName: row.name, headId: head._id, headName: head.name } });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmExpenseItem(req, res) {
  try {
    const { id } = req.params;
    const used = await FarmExpenseEntry.countDocuments({ itemId: id });
    if (used > 0) return res.status(400).json({ message: 'Cannot delete farm expense name with existing history.' });
    const deleted = await FarmExpenseItem.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Farm expense name not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmExpenseEntry(req, res) {
  try {
    const { entryType, date, headId, itemId, customItemName = '', staffId = '', amount, remarks = '' } = req.body;
    const type = String(entryType || '').trim();
    const value = Number(amount);
    if (!['fund', 'expense'].includes(type) || !date || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Invalid farm expense entry data' });
    }
    if (!staffId) return res.status(400).json({ message: 'Select the staff member for this farm entry' });
    const staff = await FarmHRStaff.findById(staffId);
    if (!staff) return res.status(404).json({ message: 'Farm staff not found' });
    let headName = type === 'fund' ? 'Farm Funds' : '';
    let itemName = type === 'fund' ? 'Funds Given' : '';
    let resolvedHeadId = null;
    let resolvedItemId = null;
    if (type === 'expense') {
      if (!headId) return res.status(400).json({ message: 'Farm expense head is required' });
      const head = await FarmExpenseHead.findById(headId);
      if (!head) return res.status(404).json({ message: 'Farm expense head not found' });
      resolvedHeadId = head._id;
      headName = head.name;
      if (itemId) {
        const item = await FarmExpenseItem.findById(itemId);
        if (!item) return res.status(404).json({ message: 'Farm expense name not found' });
        resolvedItemId = item._id;
        itemName = item.name;
      } else {
        itemName = String(customItemName || '').trim();
      }
      if (!itemName) return res.status(400).json({ message: 'Farm expense details are required' });
    }
    const row = await FarmExpenseEntry.create({
      entryType: type,
      date,
      headId: resolvedHeadId,
      headName,
      itemId: resolvedItemId,
      itemName,
      staffId: staff._id,
      staffName: staff.name,
      amount: value,
      remarks,
      enteredBy: req.user?._id || null,
      enteredByName: req.user?.name || req.user?.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'farm-expenses',
      entityType: 'FarmExpenseEntry',
      entityId: row._id,
      entityLabel: `${row.entryType} - ${row.staffName || 'Unassigned'} - ${row.amount}`,
      details: { entryType: row.entryType, staffName: row.staffName, headName: row.headName, itemName: row.itemName, amount: row.amount },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmExpenseEntry(req, res) {
  try {
    if (req.user?.id !== 'super-admin' && !req.user?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only super admin can edit farm expense transactions' });
    }
    const row = await FarmExpenseEntry.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Farm expense transaction not found' });
    const before = row.toObject();
    const { entryType, date, staffId = '', headId, itemId, customItemName = '', amount, remarks = '' } = req.body || {};
    const type = String(entryType || row.entryType || '').trim();
    const value = Number(amount ?? row.amount);
    if (!['fund', 'expense'].includes(type) || !date || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Invalid farm expense transaction data' });
    }
    if (!staffId) return res.status(400).json({ message: 'Select the staff member for this farm transaction' });
    const staff = await FarmHRStaff.findById(staffId);
    if (!staff) return res.status(404).json({ message: 'Farm staff not found' });

    let resolvedHeadId = null;
    let resolvedItemId = null;
    let headName = type === 'fund' ? 'Farm Funds' : '';
    let itemName = type === 'fund' ? 'Funds Given' : '';
    if (type === 'expense') {
      if (!headId) return res.status(400).json({ message: 'Farm expense head is required' });
      const head = await FarmExpenseHead.findById(headId);
      if (!head) return res.status(404).json({ message: 'Farm expense head not found' });
      resolvedHeadId = head._id;
      headName = head.name;
      if (itemId) {
        const item = await FarmExpenseItem.findById(itemId);
        if (!item) return res.status(404).json({ message: 'Farm expense name not found' });
        resolvedItemId = item._id;
        itemName = item.name;
      } else {
        itemName = String(customItemName || '').trim();
      }
      if (!itemName) return res.status(400).json({ message: 'Farm expense details are required' });
    }

    row.entryType = type;
    row.date = date;
    row.staffId = staff._id;
    row.staffName = staff.name;
    row.headId = resolvedHeadId;
    row.headName = headName;
    row.itemId = resolvedItemId;
    row.itemName = itemName;
    row.amount = value;
    row.remarks = remarks;
    await row.save();
    await recordAction(req, {
      action: 'update',
      module: 'farm-expenses',
      entityType: 'FarmExpenseEntry',
      entityId: row._id,
      entityLabel: `${row.entryType} - ${row.staffName || 'Unassigned'} - ${row.amount}`,
      details: { before, after: row.toObject() },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmExpenseEntries(req, res) {
  try {
    const { entryType = '', dateFrom = '', dateTo = '', withSummary = '' } = req.query;
    const query = {};
    if (['fund', 'expense'].includes(String(entryType))) query.entryType = entryType;
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) query.date.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
    const rows = await FarmExpenseEntry.find(query).sort({ date: -1, createdAt: -1 }).limit(1500);
    if (String(withSummary) !== 'true') return res.status(200).json(rows);
    const summaryRows = await FarmExpenseEntry.aggregate([
      { $match: query },
      {
        $group: {
          _id: { staffId: '$staffId', staffName: '$staffName' },
          fundsGiven: { $sum: { $cond: [{ $eq: ['$entryType', 'fund'] }, '$amount', 0] } },
          spent: { $sum: { $cond: [{ $eq: ['$entryType', 'expense'] }, '$amount', 0] } },
        },
      },
      { $sort: { '_id.staffName': 1 } },
    ]);
    return res.status(200).json({
      rows,
      summaryByStaff: summaryRows.map((r) => ({
        staffId: r._id.staffId,
        staffName: r._id.staffName || 'Unassigned',
        fundsGiven: Number(r.fundsGiven || 0),
        spent: Number(r.spent || 0),
        balance: Number(r.fundsGiven || 0) - Number(r.spent || 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmExpenseDashboard(req, res) {
  try {
    const { dateFrom = '', dateTo = '', financialYearId = '' } = req.query;
    const fy = financialYearId
      ? await FinancialYear.findById(financialYearId)
      : await FinancialYear.findOne({ isCurrent: true, isActive: true });
    const range = {};
    if (fy) {
      range.$gte = new Date(fy.startDate);
      range.$lte = new Date(fy.endDate);
      range.$lte.setHours(23, 59, 59, 999);
    } else {
      if (dateFrom) range.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) range.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
    const dateMatch = Object.keys(range).length ? { date: range } : {};
    const [overall, selectedRange, byHead, hrOverall, hrRange] = await Promise.all([
      FarmExpenseEntry.aggregate([{ $group: { _id: '$entryType', amount: { $sum: '$amount' } } }]),
      FarmExpenseEntry.aggregate([{ $match: dateMatch }, { $group: { _id: '$entryType', amount: { $sum: '$amount' } } }]),
      FarmExpenseEntry.aggregate([
        { $match: { entryType: 'expense', ...dateMatch } },
        { $group: { _id: '$headName', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
      ]),
      FarmHRPayment.aggregate([{ $group: { _id: null, amount: { $sum: '$amount' } } }]),
      FarmHRPayment.aggregate([{ $match: Object.keys(range).length ? { paymentDate: range } : {} }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    ]);
    const toSummary = (rows, hrRows = []) => {
      const funds = Number(rows.find((r) => r._id === 'fund')?.amount || 0);
      const expenses = Number(rows.find((r) => r._id === 'expense')?.amount || 0) + Number(hrRows?.[0]?.amount || 0);
      return { funds, expenses, netAvailable: funds - expenses };
    };
    return res.status(200).json({
      financialYear: fy || null,
      overall: toSummary(overall, hrOverall),
      range: toSummary(selectedRange, hrRange),
      byHead: [
        ...byHead.map((r) => ({ headName: r._id || 'Other', amount: Number(r.amount || 0) })),
        { headName: 'HR Salary / Wages', amount: Number(hrRange?.[0]?.amount || 0) },
      ].filter((r) => Number(r.amount || 0) > 0),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFinancialYears(req, res) {
  try {
    const rows = await FinancialYear.find({}).sort({ startDate: -1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFinancialYear(req, res) {
  try {
    const { name, startDate, endDate, isCurrent = false, isActive = true } = req.body || {};
    const safeName = String(name || '').trim();
    if (!safeName || !startDate || !endDate) return res.status(400).json({ message: 'Name, start date, and end date are required' });
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ message: 'Invalid financial year dates' });
    }
    const exists = await FinancialYear.findOne({ name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (exists) return res.status(400).json({ message: 'Financial year already exists' });
    if (isCurrent) await FinancialYear.updateMany({}, { $set: { isCurrent: false } });
    const row = await FinancialYear.create({ name: safeName, startDate: start, endDate: end, isCurrent: !!isCurrent, isActive: !!isActive });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFinancialYear(req, res) {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, isCurrent, isActive } = req.body || {};
    const row = await FinancialYear.findById(id);
    if (!row) return res.status(404).json({ message: 'Financial year not found' });
    if (name !== undefined) {
      const safeName = String(name || '').trim();
      if (!safeName) return res.status(400).json({ message: 'Financial year name is required' });
      const exists = await FinancialYear.findOne({
        _id: { $ne: row._id },
        name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (exists) return res.status(400).json({ message: 'Financial year already exists' });
      row.name = safeName;
    }
    if (startDate !== undefined) row.startDate = new Date(startDate);
    if (endDate !== undefined) row.endDate = new Date(endDate);
    if (Number.isNaN(new Date(row.startDate).getTime()) || Number.isNaN(new Date(row.endDate).getTime()) || new Date(row.startDate) > new Date(row.endDate)) {
      return res.status(400).json({ message: 'Invalid financial year dates' });
    }
    if (isActive !== undefined) row.isActive = !!isActive;
    if (isCurrent !== undefined) {
      row.isCurrent = !!isCurrent;
      if (row.isCurrent) await FinancialYear.updateMany({ _id: { $ne: row._id } }, { $set: { isCurrent: false } });
    }
    await row.save();
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFinancialYear(req, res) {
  try {
    const row = await FinancialYear.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Financial year not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleSetCurrentFinancialYear(req, res) {
  try {
    const row = await FinancialYear.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Financial year not found' });
    await FinancialYear.updateMany({}, { $set: { isCurrent: false } });
    row.isCurrent = true;
    row.isActive = true;
    await row.save();
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function calculateFinancialSummaryByRange(startDate, endDate, financialYearId = '') {
  const range = { $gte: new Date(startDate), $lte: new Date(endDate) };
  range.$gte.setHours(0, 0, 0, 0);
  range.$lte.setHours(23, 59, 59, 999);
  const salesExpenseStartDate = new Date(2026, 5, 9); // Sales-side live expense tracking started on 09-Jun-2026.
  salesExpenseStartDate.setHours(0, 0, 0, 0);
  const salesExpenseRange = { ...range };
  if (salesExpenseRange.$gte < salesExpenseStartDate) salesExpenseRange.$gte = salesExpenseStartDate;

  const [activeSites, activeWarehouses, activeWholesellers] = await Promise.all([
    Site.find({ isActive: true }).select('_id name'),
    Warehouse.find({ isActive: true }).select('_id name'),
    Wholeseller.find({ isActive: true }).select('_id name'),
  ]);
  const activeSiteIds = activeSites.map((s) => new mongoose.Types.ObjectId(String(s._id)));
  const activeWarehouseIds = activeWarehouses.map((w) => new mongoose.Types.ObjectId(String(w._id)));
  const activeWholesellerIds = activeWholesellers.map((w) => new mongoose.Types.ObjectId(String(w._id)));
  const activeHolderMatch = {
    $or: [
      { holderType: 'site', holderId: { $in: activeSiteIds } },
      { holderType: 'online', holderId: { $in: activeSiteIds } },
      { holderType: 'warehouse', holderId: { $in: activeWarehouseIds } },
      { holderType: 'wholeseller', holderId: { $in: activeWholesellerIds } },
      { siteId: { $in: activeSiteIds } }, // backward compatibility for old sale/expense rows
    ],
  };

  const [salePointRows, onlineRows, salesExpenseRows, farmExpenseRows, farmHrRows, treeProductionRows, blockProductionRows, pendingReceivableRows, giftRows, cashDepositRows] = await Promise.all([
    SalePointEntry.aggregate([
      {
        $match: {
          $and: [
            activeHolderMatch,
            {
              $or: [
                { entryType: { $in: ['sale', 'return'] }, date: range },
                { entryType: { $exists: false }, date: range },
                { entryType: 'pay_later', paymentStatus: 'paid', paymentReceivedAt: range },
              ],
            },
          ],
        },
      },
      {
        $group: {
          _id: null,
          amount: {
            $sum: {
              $cond: [{ $eq: ['$entryType', 'return'] }, { $multiply: ['$netAmount', -1] }, '$netAmount'],
            },
          },
          quantity: {
            $sum: {
              $cond: [{ $eq: ['$entryType', 'return'] }, { $multiply: ['$quantity', -1] }, '$quantity'],
            },
          },
        },
      },
    ]),
    Order.aggregate([
      { $match: { createdAt: range, status: { $nin: ['rejected', 'cancelled', 'returned'] } } },
      {
        $group: {
          _id: null,
          amount: { $sum: { $ifNull: ['$paymentDetails.payableAmount', '$totalCost'] } },
          quantity: {
            $sum: {
              $reduce: {
                input: { $ifNull: ['$items', []] },
                initialValue: 0,
                in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
              },
            },
          },
        },
      },
    ]),
    ExpenseEntry.aggregate([{ $match: { $and: [activeHolderMatch, { date: salesExpenseRange }] } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    FarmExpenseEntry.aggregate([{ $match: { date: range, entryType: 'expense' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    FarmHRPayment.aggregate([{ $match: { paymentDate: range } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    FarmTreeLog.aggregate([
      { $match: { logDate: range, logType: { $in: ['production', 'harvest'] } } },
      {
        $group: {
          _id: null,
          quantity: { $sum: '$quantity' },
          gradeA: { $sum: '$gradeA' },
          gradeB: { $sum: '$gradeB' },
          gradeC: { $sum: '$gradeC' },
          gradeD: { $sum: '$gradeD' },
        },
      },
    ]),
    FarmBlockLog.aggregate([
      { $match: { logDate: range, logType: 'production' } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]),
    SalePointEntry.aggregate([
      { $match: { $and: [activeHolderMatch, { date: range, entryType: 'pay_later', paymentStatus: 'pending' }] } },
      { $group: { _id: null, amount: { $sum: '$receivableAmount' }, quantity: { $sum: '$quantity' } } },
    ]),
    SalePointEntry.aggregate([
      { $match: { $and: [activeHolderMatch, { date: range, entryType: 'gift' }] } },
      { $group: { _id: '$giftSourceName', quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$unitPrice', '$quantity'] } } } },
      { $sort: { quantity: -1 } },
    ]),
    CompanyCashDeposit.aggregate([
      { $match: { date: range } },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);
  const salePointRevenue = Number(salePointRows?.[0]?.amount || 0);
  const onlineRevenue = Number(onlineRows?.[0]?.amount || 0);
  const revenue = salePointRevenue + onlineRevenue;
  const salesExpenses = Number(salesExpenseRows?.[0]?.amount || 0);
  const farmHrExpenses = Number(farmHrRows?.[0]?.amount || 0);
  const farmExpenses = Number(farmExpenseRows?.[0]?.amount || 0) + farmHrExpenses;
  const treeProductionKg = Number(treeProductionRows?.[0]?.quantity || 0);
  const blockProductionKg = Number(blockProductionRows?.[0]?.quantity || 0);
  const farmProductionKg = treeProductionKg + blockProductionKg;
  const cashDeposits = cashDepositRows.reduce((acc, row) => {
    acc[row._id] = { amount: Number(row.amount || 0), count: Number(row.count || 0) };
    acc.total.amount += Number(row.amount || 0);
    acc.total.count += Number(row.count || 0);
    return acc;
  }, { pending: { amount: 0, count: 0 }, accepted: { amount: 0, count: 0 }, rejected: { amount: 0, count: 0 }, total: { amount: 0, count: 0 } });
  const usherSummary = financialYearId ? await calculateFarmUsherSummary(financialYearId) : null;
  const usher = usherSummary?.totals || {};
  const usherPaid = Number(usher.usherPaid || 0);
  return {
    revenue,
    salePointRevenue,
    onlineRevenue,
    salesExpenses,
    farmExpenses,
    farmHrExpenses,
    totalExpenses: salesExpenses + farmExpenses + usherPaid,
    net: revenue - salesExpenses - farmExpenses - usherPaid,
    quantity: Number(salePointRows?.[0]?.quantity || 0) + Number(onlineRows?.[0]?.quantity || 0),
    farmProductionKg,
    treeProductionKg,
    blockProductionKg,
    productionGrades: {
      gradeA: Number(treeProductionRows?.[0]?.gradeA || 0),
      gradeB: Number(treeProductionRows?.[0]?.gradeB || 0),
      gradeC: Number(treeProductionRows?.[0]?.gradeC || 0),
      gradeD: Number(treeProductionRows?.[0]?.gradeD || 0),
    },
    pendingReceivables: {
      amount: Number(pendingReceivableRows?.[0]?.amount || 0),
      quantity: Number(pendingReceivableRows?.[0]?.quantity || 0),
    },
    companyCashDeposits: cashDeposits,
    gifting: {
      quantity: giftRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      value: giftRows.reduce((sum, row) => sum + Number(row.value || 0), 0),
      bySource: giftRows.map((row) => ({
        sourceName: row._id || 'Unassigned',
        quantity: Number(row.quantity || 0),
        value: Number(row.value || 0),
      })),
    },
    usher: {
      totalYieldValue: Number(usher.totalYieldValue || 0),
      totalPayable: Number(usher.totalPayableUsher || 0),
      paid: usherPaid,
      remaining: Number(usher.usherRemaining || 0),
      percentage: Number(usher.usherPercentage || 5),
    },
  };
}

async function handleGetAdminFinancialDashboard(req, res) {
  try {
    const { financialYearId = '' } = req.query;
    const years = await FinancialYear.find({ isActive: true }).sort({ startDate: -1 });
    const selectedYear = financialYearId
      ? await FinancialYear.findById(financialYearId)
      : years.find((y) => y.isCurrent) || years[0] || null;
    const selectedSummary = selectedYear ? await calculateFinancialSummaryByRange(selectedYear.startDate, selectedYear.endDate, selectedYear._id) : null;
    const yearlyRows = await Promise.all(years.map(async (year) => ({
      financialYear: year,
      summary: await calculateFinancialSummaryByRange(year.startDate, year.endDate, year._id),
    })));
    return res.status(200).json({ years, selectedYear, selectedSummary, yearlyRows });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetOwners(req, res) {
  try {
    const rows = await Owner.find({}).sort({ isActive: -1, name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateOwner(req, res) {
  try {
    const { name, contactNumber = '', email = '', sharePercentage } = req.body || {};
    const share = Number(sharePercentage);
    if (!String(name || '').trim() || Number.isNaN(share) || share < 0 || share > 100) {
      return res.status(400).json({ message: 'Owner name and valid share percentage are required' });
    }
    const row = await Owner.create({
      name: String(name).trim(),
      contactNumber,
      email,
      sharePercentage: share,
      isActive: true,
      createdBy: req.user?._id || null,
      createdByName: req.user?.name || req.user?.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'owners',
      entityType: 'Owner',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, sharePercentage: row.sharePercentage },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateOwner(req, res) {
  try {
    const row = await Owner.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Owner not found' });
    const { name, contactNumber = '', email = '', sharePercentage } = req.body || {};
    const share = Number(sharePercentage);
    if (!String(name || '').trim() || Number.isNaN(share) || share < 0 || share > 100) {
      return res.status(400).json({ message: 'Owner name and valid share percentage are required' });
    }
    row.name = String(name).trim();
    row.contactNumber = contactNumber;
    row.email = email;
    row.sharePercentage = share;
    await row.save();
    await recordAction(req, {
      action: 'update',
      module: 'owners',
      entityType: 'Owner',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, sharePercentage: row.sharePercentage },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteOwner(req, res) {
  try {
    const row = await Owner.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Owner not found' });
    await row.deleteOne();
    await recordAction(req, {
      action: 'delete',
      module: 'owners',
      entityType: 'Owner',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, sharePercentage: row.sharePercentage },
    });
    return res.status(200).json({ success: true, message: 'Owner removed' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetOwnerShareReport(req, res) {
  try {
    const fy = await resolveFinancialYear(req.query?.financialYearId || '');
    if (!fy) return res.status(200).json({ financialYear: null, summary: null, rows: [] });
    const [summary, owners] = await Promise.all([
      calculateFinancialSummaryByRange(fy.startDate, fy.endDate, fy._id),
      Owner.find({ isActive: true }).sort({ name: 1 }),
    ]);
    const net = Number(summary?.net || 0);
    const usherRemaining = Number(summary?.usher?.remaining || 0);
    const rows = owners.map((owner) => ({
      ownerId: owner._id,
      name: owner.name,
      contactNumber: owner.contactNumber,
      email: owner.email,
      sharePercentage: Number(owner.sharePercentage || 0),
      ownerNetShare: net * (Number(owner.sharePercentage || 0) / 100),
      remainingUsherDueShare: usherRemaining * (Number(owner.sharePercentage || 0) / 100),
    }));
    return res.status(200).json({
      financialYear: fy,
      summary,
      rows,
      totalSharePercentage: rows.reduce((sum, row) => sum + Number(row.sharePercentage || 0), 0),
      totalOwnerNetShare: rows.reduce((sum, row) => sum + Number(row.ownerNetShare || 0), 0),
      totalRemainingUsherDueShare: rows.reduce((sum, row) => sum + Number(row.remainingUsherDueShare || 0), 0),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function resolveFinancialYear(financialYearId = '') {
  if (financialYearId) return FinancialYear.findById(financialYearId);
  return FinancialYear.findOne({ isCurrent: true, isActive: true });
}

const normalizeVarietyName = (name) => String(name || 'Unassigned').trim() || 'Unassigned';
const gradeKeys = ['gradeA', 'gradeB', 'gradeC', 'gradeD'];

async function calculateFarmUsherSummary(financialYearId = '') {
  const fy = await resolveFinancialYear(financialYearId);
  if (!fy) return { financialYear: null, setting: null, varieties: [], productionByVariety: [], totals: {} };

  const range = { $gte: new Date(fy.startDate), $lte: new Date(fy.endDate) };
  range.$gte.setHours(0, 0, 0, 0);
  range.$lte.setHours(23, 59, 59, 999);
  const [setting, varieties, treeLogs, blockProductionRows, paidRows] = await Promise.all([
    FarmUsherSetting.findOne({ financialYearId: fy._id }),
    FarmVariety.find({ isActive: true }).sort({ name: 1 }),
    FarmTreeLog.find({ logDate: range, logType: { $in: ['production', 'harvest'] } }).select('treeId gradeA gradeB gradeC gradeD quantity'),
    FarmBlockLog.aggregate([
      { $match: { logDate: range, logType: 'production' } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]),
    FarmUsherEntry.aggregate([
      { $match: { financialYearId: fy._id } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]),
  ]);
  const treeIds = [...new Set(treeLogs.map((row) => String(row.treeId || '')).filter(Boolean))];
  const trees = await FarmTree.find({ _id: { $in: treeIds.map((id) => new mongoose.Types.ObjectId(id)) } }).select('_id varieties');
  const treeVarietyMap = new Map(trees.map((tree) => [String(tree._id), (tree.varieties || []).map(normalizeVarietyName).filter(Boolean)]));
  const priceMap = new Map((setting?.gradePrices || []).map((row) => [normalizeVarietyName(row.varietyName).toLowerCase(), row]));
  const productionMap = new Map();

  const ensureProduction = (varietyName) => {
    const key = normalizeVarietyName(varietyName);
    if (!productionMap.has(key)) {
      productionMap.set(key, { varietyName: key, gradeA: 0, gradeB: 0, gradeC: 0, gradeD: 0, totalKg: 0, totalValue: 0 });
    }
    return productionMap.get(key);
  };

  treeLogs.forEach((log) => {
    const varietyNames = treeVarietyMap.get(String(log.treeId || '')) || ['Unassigned'];
    const shareCount = Math.max(varietyNames.length, 1);
    const gradeValues = {
      gradeA: Number(log.gradeA || 0),
      gradeB: Number(log.gradeB || 0),
      gradeC: Number(log.gradeC || 0),
      gradeD: Number(log.gradeD || 0),
    };
    const loggedGradeTotal = gradeKeys.reduce((sum, key) => sum + gradeValues[key], 0);
    if (!loggedGradeTotal && Number(log.quantity || 0) > 0) gradeValues.gradeA = Number(log.quantity || 0);
    varietyNames.forEach((varietyName) => {
      const row = ensureProduction(varietyName);
      gradeKeys.forEach((key) => {
        row[key] += gradeValues[key] / shareCount;
      });
    });
  });

  const defaultRows = varieties.map((v) => normalizeVarietyName(v.name));
  defaultRows.forEach(ensureProduction);
  const productionByVariety = [...productionMap.values()].map((row) => {
    const prices = priceMap.get(row.varietyName.toLowerCase()) || {};
    row.totalKg = gradeKeys.reduce((sum, key) => sum + Number(row[key] || 0), 0);
    row.totalValue = gradeKeys.reduce((sum, key) => sum + Number(row[key] || 0) * Number(prices[key] || 0), 0);
    row.prices = {
      gradeA: Number(prices.gradeA || 0),
      gradeB: Number(prices.gradeB || 0),
      gradeC: Number(prices.gradeC || 0),
      gradeD: Number(prices.gradeD || 0),
    };
    return row;
  }).sort((a, b) => a.varietyName.localeCompare(b.varietyName));

  const treeProductionKg = productionByVariety.reduce((sum, row) => sum + Number(row.totalKg || 0), 0);
  const blockProductionKg = Number(blockProductionRows?.[0]?.quantity || 0);
  const totalYieldValue = productionByVariety.reduce((sum, row) => sum + Number(row.totalValue || 0), 0);
  const usherPercentage = Number(setting?.usherPercentage ?? 5);
  const totalPayableUsher = totalYieldValue * (usherPercentage / 100);
  const usherPaid = Number(paidRows?.[0]?.amount || 0);

  return {
    financialYear: fy,
    setting: setting || {
      financialYearId: fy._id,
      financialYearName: fy.name,
      usherPercentage: 5,
      gradePrices: [],
    },
    varieties,
    productionByVariety,
    totals: {
      treeProductionKg,
      blockProductionKg,
      totalProductionKg: treeProductionKg + blockProductionKg,
      totalYieldValue,
      usherPercentage,
      totalPayableUsher,
      usherPaid,
      usherRemaining: totalPayableUsher - usherPaid,
    },
  };
}

async function handleGetFarmUsherSummary(req, res) {
  try {
    const summary = await calculateFarmUsherSummary(req.query?.financialYearId || '');
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleSaveFarmUsherSetting(req, res) {
  try {
    const { financialYearId, usherPercentage = 5, gradePrices = [] } = req.body || {};
    const fy = await resolveFinancialYear(financialYearId);
    if (!fy) return res.status(400).json({ message: 'Financial year is required' });
    const cleanPrices = (Array.isArray(gradePrices) ? gradePrices : []).map((row) => ({
      varietyId: row.varietyId || null,
      varietyName: normalizeVarietyName(row.varietyName),
      gradeA: Number(row.gradeA || 0),
      gradeB: Number(row.gradeB || 0),
      gradeC: Number(row.gradeC || 0),
      gradeD: Number(row.gradeD || 0),
    }));
    const row = await FarmUsherSetting.findOneAndUpdate(
      { financialYearId: fy._id },
      {
        financialYearId: fy._id,
        financialYearName: fy.name,
        usherPercentage: Number(usherPercentage || 0),
        gradePrices: cleanPrices,
        updatedBy: req.user?._id || null,
        updatedByName: req.user?.name || req.user?.username || '',
      },
      { new: true, upsert: true, runValidators: true }
    );
    await recordAction(req, {
      action: 'update',
      module: 'farm-usher',
      entityType: 'FarmUsherSetting',
      entityId: row._id,
      entityLabel: fy.name,
      details: { financialYearName: fy.name, usherPercentage: row.usherPercentage, gradePrices: row.gradePrices },
    });
    const summary = await calculateFarmUsherSummary(fy._id);
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmUsherEntries(req, res) {
  try {
    const fy = await resolveFinancialYear(req.query?.financialYearId || '');
    if (!fy) return res.status(200).json({ financialYear: null, rows: [], totalPaid: 0 });
    const rows = await FarmUsherEntry.find({ financialYearId: fy._id }).sort({ date: -1, createdAt: -1 }).limit(1500);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return res.status(200).json({ financialYear: fy, rows, totalPaid });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmUsherBeneficiaries(req, res) {
  try {
    const { activeOnly = '' } = req.query || {};
    const query = {};
    if (String(activeOnly) === 'true') query.isActive = true;
    const rows = await FarmUsherBeneficiary.find(query).sort({ isActive: -1, name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmUsherBeneficiary(req, res) {
  try {
    const { name, contactNumber = '', address = '', isRelative = false } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Beneficiary name is required' });
    const row = await FarmUsherBeneficiary.create({
      name: String(name).trim(),
      contactNumber,
      address,
      isRelative: Boolean(isRelative),
      isActive: true,
      createdBy: req.user?._id || null,
      createdByName: req.user?.name || req.user?.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'farm-usher-beneficiaries',
      entityType: 'FarmUsherBeneficiary',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, contactNumber: row.contactNumber, isRelative: row.isRelative },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmUsherBeneficiary(req, res) {
  try {
    const row = await FarmUsherBeneficiary.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Beneficiary not found' });
    const { name, contactNumber = '', address = '', isRelative = false } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Beneficiary name is required' });
    row.name = String(name).trim();
    row.contactNumber = contactNumber;
    row.address = address;
    row.isRelative = Boolean(isRelative);
    await row.save();
    await FarmUsherEntry.updateMany(
      { beneficiaryId: row._id },
      { $set: { personName: row.name, contactNumber: row.contactNumber, isRelative: row.isRelative } }
    );
    await recordAction(req, {
      action: 'update',
      module: 'farm-usher-beneficiaries',
      entityType: 'FarmUsherBeneficiary',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, contactNumber: row.contactNumber, isRelative: row.isRelative },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleToggleFarmUsherBeneficiary(req, res) {
  try {
    const row = await FarmUsherBeneficiary.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Beneficiary not found' });
    row.isActive = !row.isActive;
    await row.save();
    await recordAction(req, {
      action: row.isActive ? 'activate' : 'deactivate',
      module: 'farm-usher-beneficiaries',
      entityType: 'FarmUsherBeneficiary',
      entityId: row._id,
      entityLabel: row.name,
      details: { isActive: row.isActive },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmUsherBeneficiary(req, res) {
  try {
    const row = await FarmUsherBeneficiary.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Beneficiary not found' });
    const used = await FarmUsherEntry.countDocuments({ beneficiaryId: row._id });
    if (used > 0) return res.status(400).json({ message: 'Beneficiary has Usher entries. Mark inactive instead.' });
    await row.deleteOne();
    await recordAction(req, {
      action: 'delete',
      module: 'farm-usher-beneficiaries',
      entityType: 'FarmUsherBeneficiary',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name },
    });
    return res.status(200).json({ success: true, message: 'Beneficiary deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmUsherReport(req, res) {
  try {
    const fy = await resolveFinancialYear(req.query?.financialYearId || '');
    if (!fy) return res.status(200).json({ financialYear: null, summary: null, rows: [] });
    const summary = await calculateFarmUsherSummary(fy._id);
    const rows = await FarmUsherEntry.aggregate([
      { $match: { financialYearId: fy._id } },
      {
        $group: {
          _id: { beneficiaryId: '$beneficiaryId', personName: '$personName', contactNumber: '$contactNumber', isRelative: '$isRelative' },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1, '_id.personName': 1 } },
    ]);
    const reportRows = rows.map((row) => ({
      beneficiaryId: row._id.beneficiaryId,
      personName: row._id.personName || 'Other',
      contactNumber: row._id.contactNumber || '',
      isRelative: Boolean(row._id.isRelative),
      amount: Number(row.amount || 0),
      count: Number(row.count || 0),
    }));
    return res.status(200).json({
      financialYear: fy,
      summary,
      rows: reportRows,
      totalPaid: reportRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmUsherEntry(req, res) {
  try {
    const { financialYearId, date, beneficiaryId = '', personName, contactNumber = '', amount, details = '' } = req.body || {};
    const value = Number(amount);
    const fy = await resolveFinancialYear(financialYearId);
    let beneficiary = null;
    if (beneficiaryId && beneficiaryId !== 'other') {
      beneficiary = await FarmUsherBeneficiary.findById(beneficiaryId);
      if (!beneficiary || !beneficiary.isActive) return res.status(400).json({ message: 'Select an active beneficiary' });
    }
    const finalName = beneficiary ? beneficiary.name : String(personName || '').trim();
    const finalContact = beneficiary ? beneficiary.contactNumber : contactNumber;
    if (!fy || !date || !finalName || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Financial year, date, beneficiary/person name, and valid amount are required' });
    }
    const row = await FarmUsherEntry.create({
      financialYearId: fy._id,
      financialYearName: fy.name,
      date,
      beneficiaryId: beneficiary?._id || null,
      personName: finalName,
      contactNumber: finalContact,
      isRelative: Boolean(beneficiary?.isRelative || false),
      amount: value,
      details,
      enteredBy: req.user?._id || null,
      enteredByName: req.user?.name || req.user?.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'farm-usher-entries',
      entityType: 'FarmUsherEntry',
      entityId: row._id,
      entityLabel: `${row.personName} - ${row.amount}`,
      details: { financialYearName: row.financialYearName, personName: row.personName, amount: row.amount },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmUsherEntry(req, res) {
  try {
    const row = await FarmUsherEntry.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Usher entry not found' });
    const { financialYearId, date, beneficiaryId = '', personName, contactNumber = '', amount, details = '' } = req.body || {};
    const value = Number(amount);
    const fy = await resolveFinancialYear(financialYearId);
    let beneficiary = null;
    if (beneficiaryId && beneficiaryId !== 'other') {
      beneficiary = await FarmUsherBeneficiary.findById(beneficiaryId);
      if (!beneficiary || !beneficiary.isActive) return res.status(400).json({ message: 'Select an active beneficiary' });
    }
    const finalName = beneficiary ? beneficiary.name : String(personName || '').trim();
    const finalContact = beneficiary ? beneficiary.contactNumber : contactNumber;
    if (!fy || !date || !finalName || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Financial year, date, beneficiary/person name, and valid amount are required' });
    }
    const previous = { financialYearName: row.financialYearName, date: row.date, personName: row.personName, amount: row.amount, details: row.details };
    row.financialYearId = fy._id;
    row.financialYearName = fy.name;
    row.date = date;
    row.beneficiaryId = beneficiary?._id || null;
    row.personName = finalName;
    row.contactNumber = finalContact;
    row.isRelative = Boolean(beneficiary?.isRelative || false);
    row.amount = value;
    row.details = details;
    await row.save();
    await recordAction(req, {
      action: 'update',
      module: 'farm-usher-entries',
      entityType: 'FarmUsherEntry',
      entityId: row._id,
      entityLabel: `${row.personName} - ${row.amount}`,
      details: { previous, updated: { financialYearName: row.financialYearName, date: row.date, personName: row.personName, amount: row.amount, details: row.details } },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmUsherEntry(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only Super Admin can delete Usher entries' });
    const row = await FarmUsherEntry.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Usher entry not found' });
    const details = { financialYearName: row.financialYearName, date: row.date, personName: row.personName, amount: row.amount, details: row.details };
    await row.deleteOne();
    await recordAction(req, {
      action: 'delete',
      module: 'farm-usher-entries',
      entityType: 'FarmUsherEntry',
      entityId: row._id,
      entityLabel: `${row.personName} - ${row.amount}`,
      details,
    });
    return res.status(200).json({ success: true, message: 'Usher entry deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmHRStaff(req, res) {
  try {
    const { includeLeft = 'true' } = req.query || {};
    const query = {};
    if (String(includeLeft) !== 'true') query.status = 'active';
    const rows = await FarmHRStaff.find(query).sort({ status: 1, name: 1 });
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmHRStaff(req, res) {
  try {
    const { name, joiningDate, designation, employmentType = 'contract', salaryAmount = 0, remarks = '' } = req.body || {};
    if (!String(name || '').trim() || !joiningDate || !String(designation || '').trim()) {
      return res.status(400).json({ message: 'Name, joining date, and designation are required' });
    }
    const row = await FarmHRStaff.create({
      name: String(name).trim(),
      joiningDate,
      designation: String(designation).trim(),
      employmentType,
      salaryAmount: Number(salaryAmount || 0),
      remarks,
      status: 'active',
    });
    await recordAction(req, {
      action: 'create',
      module: 'farm-hr',
      entityType: 'FarmHRStaff',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, designation: row.designation, employmentType: row.employmentType, salaryAmount: row.salaryAmount },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmHRStaff(req, res) {
  try {
    const row = await FarmHRStaff.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Farm HR staff not found' });
    const allowed = ['name', 'joiningDate', 'designation', 'employmentType', 'salaryAmount', 'remarks'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) row[key] = key === 'salaryAmount' ? Number(req.body[key] || 0) : req.body[key];
    });
    await row.save();
    await FarmHRPayment.updateMany({ staffId: row._id }, { $set: { staffName: row.name } });
    await FarmExpenseEntry.updateMany({ staffId: row._id }, { $set: { staffName: row.name } });
    await recordAction(req, {
      action: 'update',
      module: 'farm-hr',
      entityType: 'FarmHRStaff',
      entityId: row._id,
      entityLabel: row.name,
      details: { name: row.name, designation: row.designation, employmentType: row.employmentType, salaryAmount: row.salaryAmount },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleMarkFarmHRStaffLeft(req, res) {
  try {
    const row = await FarmHRStaff.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Farm HR staff not found' });
    row.status = 'left';
    row.leftDate = req.body?.leftDate || new Date();
    if (req.body?.remarks) row.remarks = req.body.remarks;
    await row.save();
    await recordAction(req, {
      action: 'mark-left',
      module: 'farm-hr',
      entityType: 'FarmHRStaff',
      entityId: row._id,
      entityLabel: row.name,
      details: { leftDate: row.leftDate, remarks: row.remarks },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleResumeFarmHRStaff(req, res) {
  try {
    const row = await FarmHRStaff.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Farm HR staff not found' });
    row.status = 'active';
    row.leftDate = null;
    await row.save();
    await recordAction(req, {
      action: 'resume',
      module: 'farm-hr',
      entityType: 'FarmHRStaff',
      entityId: row._id,
      entityLabel: row.name,
      details: { status: row.status },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetFarmHRPayments(req, res) {
  try {
    const { staffId = '', financialYearId = '' } = req.query || {};
    const query = {};
    if (staffId) query.staffId = staffId;
    const fy = await resolveFinancialYear(financialYearId);
    if (fy) {
      query.paymentDate = { $gte: new Date(fy.startDate), $lte: new Date(fy.endDate) };
      query.paymentDate.$lte.setHours(23, 59, 59, 999);
    }
    const rows = await FarmHRPayment.find(query).sort({ paymentDate: -1, createdAt: -1 }).limit(1500);
    return res.status(200).json({ financialYear: fy || null, rows });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleCreateFarmHRPayment(req, res) {
  try {
    const { staffId, financialYearId = '', paymentDate, amount, remarks = '' } = req.body || {};
    const value = Number(amount);
    if (!staffId || !paymentDate || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Staff, payment date, and valid amount are required' });
    }
    const staff = await FarmHRStaff.findById(staffId);
    if (!staff) return res.status(404).json({ message: 'Farm HR staff not found' });
    const fy = await resolveFinancialYear(financialYearId);
    const row = await FarmHRPayment.create({
      staffId: staff._id,
      staffName: staff.name,
      financialYearId: fy?._id || null,
      financialYearName: fy?.name || '',
      paymentDate,
      amount: value,
      remarks,
      enteredBy: req.user?._id || null,
      enteredByName: req.user?.name || req.user?.username || '',
    });
    await recordAction(req, {
      action: 'create',
      module: 'farm-hr-expenses',
      entityType: 'FarmHRPayment',
      entityId: row._id,
      entityLabel: `${row.staffName} - ${row.amount}`,
      details: { staffName: row.staffName, financialYearName: row.financialYearName, amount: row.amount, remarks: row.remarks },
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleUpdateFarmHRPayment(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only Super Admin can edit HR payment history' });
    const row = await FarmHRPayment.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'HR payment not found' });

    const { staffId, financialYearId = '', paymentDate, amount, remarks = '' } = req.body || {};
    const value = Number(amount);
    if (!staffId || !paymentDate || Number.isNaN(value) || value < 0) {
      return res.status(400).json({ message: 'Staff, payment date, and valid amount are required' });
    }
    const staff = await FarmHRStaff.findById(staffId);
    if (!staff) return res.status(404).json({ message: 'Farm HR staff not found' });
    const fy = await resolveFinancialYear(financialYearId);

    const previous = {
      staffName: row.staffName,
      financialYearName: row.financialYearName,
      paymentDate: row.paymentDate,
      amount: row.amount,
      remarks: row.remarks,
    };
    row.staffId = staff._id;
    row.staffName = staff.name;
    row.financialYearId = fy?._id || null;
    row.financialYearName = fy?.name || '';
    row.paymentDate = paymentDate;
    row.amount = value;
    row.remarks = remarks;
    await row.save();

    await recordAction(req, {
      action: 'update',
      module: 'farm-hr-expenses',
      entityType: 'FarmHRPayment',
      entityId: row._id,
      entityLabel: `${row.staffName} - ${row.amount}`,
      details: { previous, updated: { staffName: row.staffName, financialYearName: row.financialYearName, paymentDate: row.paymentDate, amount: row.amount, remarks: row.remarks } },
    });
    return res.status(200).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleDeleteFarmHRPayment(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only Super Admin can delete HR payment history' });
    const row = await FarmHRPayment.findById(req.params.id);
    if (!row) return res.status(404).json({ message: 'HR payment not found' });
    const details = {
      staffName: row.staffName,
      financialYearName: row.financialYearName,
      paymentDate: row.paymentDate,
      amount: row.amount,
      remarks: row.remarks,
    };
    await row.deleteOne();
    await recordAction(req, {
      action: 'delete',
      module: 'farm-hr-expenses',
      entityType: 'FarmHRPayment',
      entityId: row._id,
      entityLabel: `${row.staffName} - ${row.amount}`,
      details,
    });
    return res.status(200).json({ success: true, message: 'HR payment deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function handleGetActionLogs(req, res) {
  try {
    const { module = '', dateFrom = '', dateTo = '', limit = 500 } = req.query || {};
    const query = {};
    if (module) query.module = module;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) query.createdAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
    const rows = await ActionLog.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit || 500), 2000));
    return res.status(200).json(rows);
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

async function handleSendWhatsAppTestMessage(req, res) {
  try {
    const to = String(req.body?.to || '').replace(/\D/g, '');
    const messageType = String(req.body?.messageType || 'template');
    const textMessage = String(req.body?.message || '').trim();
    const contentSid = String(req.body?.contentSid || '').trim();
    const contentVariables = String(req.body?.contentVariables || '').trim();
    if (!to) {
      return res.status(400).json({ message: 'Recipient WhatsApp number is required.' });
    }
    if (messageType === 'text' && !textMessage) {
      return res.status(400).json({ message: 'Text message is required.' });
    }
    const result = await sendWhatsAppMessage({
      to,
      messageType,
      message: messageType === 'text' ? textMessage : '',
      contentSid,
      contentVariables,
    });

    return res.json({
      success: true,
      message: 'WhatsApp test message sent.',
      provider: result.provider,
      meta: result.meta,
    });
  } catch (err) {
    logger.error('Error sending WhatsApp test message', { error: err?.message || String(err) });
    return res.status(err?.status || 500).json({
      message: err?.message || 'Server error while sending WhatsApp test message.',
      meta: err?.meta,
    });
  }
}

async function handleWhatsAppWebhookVerify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  logger.warn('WhatsApp webhook verification failed', { mode, hasToken: !!token });
  return res.sendStatus(403);
}

function extractWhatsAppButton(message = {}) {
  if (message.type === 'button') {
    return {
      text: message.button?.text || '',
      payload: message.button?.payload || '',
    };
  }
  if (message.type === 'interactive') {
    const buttonReply = message.interactive?.button_reply || {};
    const listReply = message.interactive?.list_reply || {};
    return {
      text: buttonReply.title || listReply.title || '',
      payload: buttonReply.id || listReply.id || '',
    };
  }
  return { text: '', payload: '' };
}

function extractOrderNumberFromWhatsAppText(...parts) {
  const combined = parts.filter(Boolean).join(' ');
  const match = combined.match(/\b(JMM-[A-Z][0-9]{3}|[0-9]{6})\b/i);
  return match ? match[1].toUpperCase() : '';
}

function getWhatsAppOrderAction(...parts) {
  const combined = parts.filter(Boolean).join(' ').toLowerCase();
  if (/\b(confirm|confirmed|yes|approve|approved)\b/.test(combined)) return 'confirmed';
  if (/\b(cancel|cancelled|canceled|no|reject|rejected)\b/.test(combined)) return 'cancelled';
  return '';
}

async function applyWhatsAppOrderReply(eventRow, message) {
  const text = message.text?.body || eventRow.text || '';
  const action = getWhatsAppOrderAction(eventRow.buttonText, eventRow.buttonPayload, text);
  const orderNumber = extractOrderNumberFromWhatsAppText(eventRow.buttonPayload, text, eventRow.buttonText);
  if (!action || !orderNumber) return eventRow;

  const order = await Order.findOne({ orderNumber });
  if (!order) {
    eventRow.orderNumber = orderNumber;
    eventRow.actionTaken = 'order_not_found';
    await eventRow.save();
    return eventRow;
  }

  eventRow.orderId = order._id;
  eventRow.orderNumber = order.orderNumber;
  if (['delivered', 'returned', 'cancelled'].includes(order.status)) {
    eventRow.actionTaken = `ignored_order_${order.status}`;
    await eventRow.save();
    return eventRow;
  }

  order.customerConfirmation = {
    status: action,
    respondedAt: new Date(),
    responseSource: 'whatsapp',
    responseMessageId: eventRow.messageId || '',
    responseText: eventRow.buttonText || text || eventRow.buttonPayload || '',
  };

  if (action === 'cancelled' && ['pending_confirmation', 'confirmed'].includes(order.status)) {
    order.status = 'cancelled';
    order.adminRemarks = [order.adminRemarks, 'Customer cancelled via WhatsApp'].filter(Boolean).join(' | ');
    order.statusTimeline = {
      ...(order.statusTimeline || {}),
      placedAt: order?.statusTimeline?.placedAt || order.createdAt || new Date(),
      cancelledAt: new Date(),
    };
    eventRow.actionTaken = 'order_cancelled';
  } else if (action === 'confirmed') {
    eventRow.actionTaken = 'customer_confirmed';
  }

  await order.save();
  await eventRow.save();
  return eventRow;
}

async function handleWhatsAppWebhookEvent(req, res) {
  try {
    const body = req.body || {};
    logger.info('WhatsApp webhook event received', {
      object: body.object,
      entries: Array.isArray(body.entry) ? body.entry.length : 0,
    });

    const changes = (body.entry || []).flatMap((entry) => entry.changes || []);
    for (const change of changes) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const contactMap = new Map((value.contacts || []).map((c) => [String(c.wa_id || ''), c]));
      for (const message of (value.messages || [])) {
        const contact = contactMap.get(String(message.from || '')) || {};
        const button = extractWhatsAppButton(message);
        const eventRow = await WhatsAppEvent.create({
          eventType: 'message',
          direction: 'incoming',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          waId: contact.wa_id || message.from || '',
          contactName: contact.profile?.name || '',
          from: message.from || '',
          messageId: message.id || '',
          messageType: message.type || '',
          text: message.text?.body || '',
          buttonText: button.text,
          buttonPayload: button.payload,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : null,
          raw: message,
        });
        await applyWhatsAppOrderReply(eventRow, message);
        logger.info('WhatsApp incoming message', {
          from: message.from,
          id: message.id,
          type: message.type,
          text: message.text?.body,
          buttonText: button.text,
        });
      }
      for (const status of (value.statuses || [])) {
        await WhatsAppEvent.create({
          eventType: 'status',
          direction: 'outgoing',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          recipientId: status.recipient_id || '',
          messageId: status.id || '',
          status: status.status || '',
          timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : null,
          raw: status,
        });
        logger.info('WhatsApp message status', {
          id: status.id,
          status: status.status,
          recipientId: status.recipient_id,
          timestamp: status.timestamp,
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    logger.error('WhatsApp webhook event handling failed', { error: err?.message || String(err) });
    return res.sendStatus(200);
  }
}

function normalizeTwilioWhatsappNumber(value = '') {
  return String(value || '').replace(/^whatsapp:/i, '').replace(/^\+/, '').trim();
}

async function handleTwilioWhatsAppIncoming(req, res) {
  try {
    const body = req.body || {};
    const from = normalizeTwilioWhatsappNumber(body.From);
    const to = normalizeTwilioWhatsappNumber(body.To);
    const text = String(body.Body || '').trim();
    const messageId = body.MessageSid || body.SmsMessageSid || body.SmsSid || '';
    const messageType = Number(body.NumMedia || 0) > 0 ? 'media' : 'text';

    const eventRow = await WhatsAppEvent.create({
      eventType: 'message',
      direction: 'incoming',
      phoneNumberId: to,
      displayPhoneNumber: to,
      waId: from,
      from,
      recipientId: to,
      messageId,
      messageType,
      text,
      timestamp: new Date(),
      raw: body,
    });

    await applyWhatsAppOrderReply(eventRow, { text: { body: text }, type: messageType });
    logger.info('Twilio WhatsApp incoming message', {
      from,
      to,
      messageId,
      text,
    });

    return res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    logger.error('Twilio WhatsApp incoming webhook failed', { error: err?.message || String(err) });
    return res.status(200).type('text/xml').send('<Response></Response>');
  }
}

async function handleTwilioWhatsAppStatus(req, res) {
  try {
    const body = req.body || {};
    const from = normalizeTwilioWhatsappNumber(body.From);
    const to = normalizeTwilioWhatsappNumber(body.To);
    const messageId = body.MessageSid || body.SmsMessageSid || body.SmsSid || '';
    const status = body.MessageStatus || body.SmsStatus || body.MessageStatusCallbackEvent || '';

    await WhatsAppEvent.create({
      eventType: 'status',
      direction: 'outgoing',
      phoneNumberId: from,
      displayPhoneNumber: from,
      recipientId: to,
      messageId,
      status,
      timestamp: new Date(),
      raw: body,
    });

    logger.info('Twilio WhatsApp message status', {
      from,
      to,
      messageId,
      status,
      errorCode: body.ErrorCode,
      errorMessage: body.ErrorMessage,
    });

    return res.sendStatus(200);
  } catch (err) {
    logger.error('Twilio WhatsApp status webhook failed', { error: err?.message || String(err) });
    return res.sendStatus(200);
  }
}

async function handleTwilioWhatsAppFallback(req, res) {
  try {
    await WhatsAppEvent.create({
      eventType: 'unknown',
      direction: 'unknown',
      messageId: req.body?.MessageSid || req.body?.SmsMessageSid || req.body?.SmsSid || '',
      status: 'fallback',
      timestamp: new Date(),
      raw: req.body || {},
    });
    logger.warn('Twilio WhatsApp fallback webhook received', {
      messageId: req.body?.MessageSid || req.body?.SmsMessageSid || req.body?.SmsSid || '',
    });
    return res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    logger.error('Twilio WhatsApp fallback webhook failed', { error: err?.message || String(err) });
    return res.status(200).type('text/xml').send('<Response></Response>');
  }
}

async function handleGetWhatsAppEvents(req, res) {
  try {
    const {
      dateFrom = '',
      dateTo = '',
      eventType = '',
      q = '',
      limit = 500,
    } = req.query || {};
    const filter = {};
    if (eventType) filter.eventType = eventType;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) filter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
    if (q) {
      const regex = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { waId: regex },
        { from: regex },
        { recipientId: regex },
        { contactName: regex },
        { text: regex },
        { buttonText: regex },
        { buttonPayload: regex },
        { status: regex },
        { orderNumber: regex },
        { actionTaken: regex },
      ];
    }
    const rows = await WhatsAppEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 500, 2000))
      .lean();
    return res.status(200).json(rows);
  } catch (err) {
    logger.error('Error fetching WhatsApp events', { error: err?.message || String(err) });
    return res.status(500).json({ message: 'Server error', error: err.message });
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
    handleSession,
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
    handleStockStatusAll,
    handleGetStockProducts,
    handleGetStockHolders,
    handleGetStockTransferHolders,
    handleGetAssignedSites,
    handleGetSaleHolders,
    handleGetExpenseHolders,
    handleGetSiteStock,
    handleCreateSalePointEntry,
    handleCreateSaleCheckout,
    handleCreateSaleReturn,
    handleGetSalePointEntries,
    handleDeleteSalePointEntry,
    handleGetGiftEntries,
    handleGetPayLaterEntries,
    handleUpdatePayLaterAmount,
    handleMarkPayLaterPaid,
    handleGetSalesDashboardSummary,
    handleGetGiftSources,
    handleCreateGiftSource,
    handleUpdateGiftSource,
    handleDeleteGiftSource,
    handleGetWarehouses,
    handleCreateWarehouse,
    handleUpdateWarehouse,
    handleDeleteWarehouse,
    handleGetWholesellers,
    handleCreateWholeseller,
    handleUpdateWholeseller,
    handleDeleteWholeseller,
    handleGetStockLots,
    handleCreateStockLot,
    handleGetStockTransfers,
    handleCreateStockTransfer,
    handleRespondStockTransfer,
    handleCancelStockTransfer,
    handleResolveStockTransferDifference,
    handleCustomerDirectory,
    handleGetExpenseHeads,
    handleCreateExpenseHead,
    handleUpdateExpenseHead,
    handleDeleteExpenseHead,
    handleGetExpenseItems,
    handleCreateExpenseItem,
    handleUpdateExpenseItem,
    handleDeleteExpenseItem,
    handleGetCashDepositPaymentMethods,
    handleGetCompanyCashPosition,
    handleCreateCompanyCashDeposit,
    handleGetCompanyCashDeposits,
    handleUpdateCompanyCashDeposit,
    handleReviewCompanyCashDeposit,
    handleGetSalesCashTransactions,
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
    handleDeleteOrder,
    handleGetOrderStockOptions,
    handleReserveOrderStock,
    handleCreateOrderStockRequest,
    handleCancelOrderStockRequest,
    handleGetPendingOrderStockRequests,
    handleRespondOrderStockRequest,
    handleConfirmOrder,
    handleRejectOrder,
    handleModifyOrder,
    handlePreviewFulfilmentSites,
    handleGetFulfilmentSiteProducts,
    handleAssignCourier,
    handleDispatchOrder,
    handleCancelOrder,
    handleDeliverOrder,
    handleSendFeedbackReminder,
    handleReturnOrder,
    handleResolveReturnedAsWasted,
    handleResolveReturnedToStore,
    handleRedirectReturnedOrder,
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
    handleGetFarmExpenseHeads,
    handleCreateFarmExpenseHead,
    handleUpdateFarmExpenseHead,
    handleDeleteFarmExpenseHead,
    handleGetFarmExpenseItems,
    handleCreateFarmExpenseItem,
    handleUpdateFarmExpenseItem,
    handleDeleteFarmExpenseItem,
    handleCreateFarmExpenseEntry,
    handleGetFarmExpenseEntries,
    handleUpdateFarmExpenseEntry,
    handleGetFarmExpenseDashboard,
    handleGetFinancialYears,
    handleCreateFinancialYear,
    handleUpdateFinancialYear,
    handleDeleteFinancialYear,
    handleSetCurrentFinancialYear,
    handleGetAdminFinancialDashboard,
    handleGetFarmHRStaff,
    handleCreateFarmHRStaff,
    handleUpdateFarmHRStaff,
    handleMarkFarmHRStaffLeft,
    handleResumeFarmHRStaff,
    handleGetFarmHRPayments,
    handleCreateFarmHRPayment,
    handleUpdateFarmHRPayment,
    handleDeleteFarmHRPayment,
    handleGetFarmUsherSummary,
    handleSaveFarmUsherSetting,
    handleGetFarmUsherBeneficiaries,
    handleCreateFarmUsherBeneficiary,
    handleUpdateFarmUsherBeneficiary,
    handleToggleFarmUsherBeneficiary,
    handleDeleteFarmUsherBeneficiary,
    handleGetFarmUsherEntries,
    handleCreateFarmUsherEntry,
    handleUpdateFarmUsherEntry,
    handleDeleteFarmUsherEntry,
    handleGetFarmUsherReport,
    handleGetOwners,
    handleCreateOwner,
    handleUpdateOwner,
    handleDeleteOwner,
    handleGetOwnerShareReport,
    handleGetActionLogs,
    handleFarmDashboardSummary,
    handleGetOrderFeedbackMeta,
    handleSubmitOrderFeedback,
    handleFeedbackReport,
    handleCreateStockWastedEntry,
    handleGetStockWastedEntries,
    handleAdjustStock,
    handleAdjustHolderStock,
    handleStockAdjustments,
    handleStockLedger,
    handleUpdateShippingCosts,
    handleFetchingShippingCosts,
    handleContactQuery,
    handleSendWhatsAppTestMessage,
    handleGetWhatsAppEvents,
    handleWhatsAppWebhookVerify,
    handleWhatsAppWebhookEvent,
    handleTwilioWhatsAppIncoming,
    handleTwilioWhatsAppStatus,
    handleTwilioWhatsAppFallback,
    handleCheckout,
    
}

