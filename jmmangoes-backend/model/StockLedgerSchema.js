const mongoose = require('mongoose');

const stockLedgerSchema = new mongoose.Schema(
  {
    movementType: { type: String, enum: ['in', 'out', 'transfer_out', 'transfer_in', 'adjustment', 'wastage'], required: true },
    holderType: { type: String, enum: ['site', 'warehouse', 'wholeseller', 'online'], required: true },
    holderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    holderName: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLot', default: null },
    lotCode: { type: String, default: '' },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    referenceType: { type: String, default: '' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    counterpartType: { type: String, default: '' },
    counterpartId: { type: mongoose.Schema.Types.ObjectId, default: null },
    counterpartName: { type: String, default: '' },
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

stockLedgerSchema.index({ holderType: 1, holderId: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('StockLedger', stockLedgerSchema);

