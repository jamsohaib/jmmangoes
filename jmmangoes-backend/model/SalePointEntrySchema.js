const mongoose = require('mongoose');

const salePointEntrySchema = new mongoose.Schema(
  {
    entryType: { type: String, enum: ['sale', 'return', 'gift', 'pay_later'], default: 'sale' },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null },
    siteName: { type: String, default: '', trim: true },
    holderType: { type: String, enum: ['site', 'warehouse', 'wholeseller', 'online'], default: 'site' },
    holderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    holderName: { type: String, default: '', trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    grossAmount: { type: Number, required: true, min: 0 },
    priceIncreaseAmount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    receivableAmount: { type: Number, default: 0, min: 0 },
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
    paymentMethodName: { type: String, default: '', trim: true },
    paymentMethodCode: { type: String, default: '', trim: true },
    paymentStatus: { type: String, enum: ['not_applicable', 'pending', 'paid'], default: 'not_applicable' },
    paymentReceivedAt: { type: Date, default: null },
    paymentReceivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paymentReceivedByName: { type: String, default: '', trim: true },
    giftSourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftSource', default: null },
    giftSourceName: { type: String, default: '', trim: true },
    netAmount: { type: Number, required: true },
    customerName: { type: String, default: '', trim: true },
    customerWhatsapp: { type: String, default: '', trim: true },
    customerEmail: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalePointEntry', salePointEntrySchema);
