
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
  role: { type: String, enum: ['user', 'admin','sales'], default: 'user' },
  isActive: { type: Boolean, default: true },
  siteAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      productsPage: { view: false, manage: false },
      shippingRates: { view: false, manage: false },
      manageCities: { view: false, manage: false },
      adminSites: { view: false, manage: false },
      manageStocks: { view: false, manage: false },
      userManagement: { view: false, manage: false },
      salePoint: { view: false, manage: false },
      stockWasted: { view: false, manage: false },
      customerDirectory: { view: false, manage: false },
      manageExpense: { view: false, manage: false },
      addExpense: { view: false, manage: false },
      emailAlerts: { view: false, manage: false },
      paymentManager: { view: false, manage: false },
      orderManagement: { view: false, manage: false },
      courierManagement: { view: false, manage: false },
      feedbackReport: { view: false, manage: false },
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

