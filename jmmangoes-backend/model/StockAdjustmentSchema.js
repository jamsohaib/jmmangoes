const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    siteName: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    adjustmentType: { type: String, enum: ['add', 'remove'], required: true },
    quantityChange: { type: Number, required: true },
    quantityBefore: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);

