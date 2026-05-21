const mongoose = require('mongoose');

const salePointEntrySchema = new mongoose.Schema(
  {
    entryType: { type: String, enum: ['sale', 'return'], default: 'sale' },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    siteName: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    grossAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
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
