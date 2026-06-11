const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true, lowercase: true },
    requiresReceipt: { type: Boolean, default: false },
    allowReceiptUpload: { type: Boolean, default: false },
    discountType: { type: String, enum: ['none', 'fixed', 'percentage'], default: 'none' },
    discountValue: { type: Number, default: 0, min: 0 },
    chargeType: { type: String, enum: ['none', 'fixed', 'percentage'], default: 'none' },
    chargeValue: { type: Number, default: 0, min: 0 },
    qrImageUrl: { type: String, default: '' },
    methodImageUrl: { type: String, default: '' },
    details: { type: String, default: '', trim: true },
    isCashOnDelivery: { type: Boolean, default: false },
    showToOnlineCustomers: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
