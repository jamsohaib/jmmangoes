
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  fatherName: {
    type: String,
    trim: true,
    default: ''
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  cnic: {
    type: String,
    trim: true,
    default: ''
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  resetPasswordTokenHash: {
    type: String,
    default: null,
  },
  resetPasswordExpiresAt: {
    type: Date,
    default: null,
  },
  role: { type: String, enum: ['user', 'admin','sales'], default: 'user' },
  isFarmUser: { type: Boolean, default: false },
  isSalesUser: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  siteAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  warehouseAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }],
  wholesellerAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Wholeseller' }],
  farmBlockAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FarmBlock' }],
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      productsPage: { view: false, manage: false },
      shippingRates: { view: false, manage: false },
      manageCities: { view: false, manage: false },
      adminSites: { view: false, manage: false },
      manageStocks: { view: false, manage: false },
      stockMovement: { view: false, manage: false },
      userManagement: { view: false, manage: false },
      salePoint: { view: false, manage: false },
      giftingRecords: { view: false, manage: false },
      giftSourceManagement: { view: false, manage: false },
      payLaterRecords: { view: false, manage: false },
      stockWasted: { view: false, manage: false },
      customerDirectory: { view: false, manage: false },
      manageExpense: { view: false, manage: false },
      addExpense: { view: false, manage: false },
      companyCashDeposits: { view: false, manage: false },
      emailAlerts: { view: false, manage: false },
      communications: { view: false, manage: false },
      paymentManager: { view: false, manage: false },
      orderManagement: { view: false, manage: false },
      courierManagement: { view: false, manage: false },
      feedbackReport: { view: false, manage: false },
      salesDashboard: { view: false, manage: false },
      salesCashTransactions: { view: false, manage: false },
      warehouseManagement: { view: false, manage: false },
      wholesellerManagement: { view: false, manage: false },
      stockTransfer: { view: false, manage: false },
      farmBlocks: { view: false, manage: false },
      farmBlockDetails: { view: false, manage: false },
      farmBlockLogs: { view: false, manage: false },
      farmDashboard: { view: false, manage: false },
      farmVarieties: { view: false, manage: false },
      farmTrees: { view: false, manage: false },
      farmTreeLogs: { view: false, manage: false },
      farmMaintenanceTasks: { view: false, manage: false },
      farmLogs: { view: false, manage: false },
      farmExpenseManage: { view: false, manage: false },
      farmExpenseAdd: { view: false, manage: false },
      farmExpenseDashboard: { view: false, manage: false },
      financialYears: { view: false, manage: false },
      adminFinancialDashboard: { view: false, manage: false },
      farmHR: { view: false, manage: false },
      farmHRExpenses: { view: false, manage: false },
      farmUsherManage: { view: false, manage: false },
      farmUsherEntries: { view: false, manage: false },
      farmUsherBeneficiaries: { view: false, manage: false },
      farmUsherReport: { view: false, manage: false },
      ownerManagement: { view: false, manage: false },
      ownerShareReport: { view: false, manage: false },
      analysisFarmProductionMap: { view: false, manage: false },
      actionLogs: { view: false, manage: false },
    }
  },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

