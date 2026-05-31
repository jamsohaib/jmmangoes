const mongoose = require('mongoose');

const stockLotSchema = new mongoose.Schema(
  {
    holderType: { type: String, enum: ['site', 'warehouse', 'wholeseller', 'online'], required: true },
    holderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    holderName: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    lotCode: { type: String, required: true, trim: true },
    receivedAt: { type: Date, default: Date.now },
    unitCost: { type: Number, default: 0, min: 0 },
    quantityInitial: { type: Number, required: true, min: 0 },
    quantityAvailable: { type: Number, required: true, min: 0 },
    sourceRefType: { type: String, default: '' },
    sourceRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

stockLotSchema.index({ holderType: 1, holderId: 1, productId: 1 });
stockLotSchema.index({ lotCode: 1 });

module.exports = mongoose.model('StockLot', stockLotSchema);

