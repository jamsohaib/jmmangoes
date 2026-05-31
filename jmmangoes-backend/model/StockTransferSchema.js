const mongoose = require('mongoose');

const stockTransferItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLot', required: true },
    lotCode: { type: String, required: true, trim: true },
    requestedQty: { type: Number, required: true, min: 0.0001 },
    acceptedQty: { type: Number, default: null, min: 0 },
    returnedQty: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
  },
  { _id: true }
);

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: { type: String, unique: true, index: true },
    fromType: { type: String, enum: ['site', 'warehouse', 'wholeseller', 'online'], required: true },
    fromId: { type: mongoose.Schema.Types.ObjectId, default: null },
    fromName: { type: String, required: true, trim: true },
    toType: { type: String, enum: ['site', 'warehouse', 'wholeseller', 'online'], required: true },
    toId: { type: mongoose.Schema.Types.ObjectId, default: null },
    toName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'modified', 'returned', 'cancelled'], default: 'pending' },
    items: { type: [stockTransferItemSchema], default: [] },
    senderRemarks: { type: String, default: '' },
    receiverRemarks: { type: String, default: '' },
    differenceStatus: {
      type: String,
      enum: ['none', 'pending_sender', 'resolved_returned', 'resolved_wasted'],
      default: 'none',
    },
    differenceNotes: { type: String, default: '' },
    differenceResolvedAt: { type: Date, default: null },
    differenceResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    differenceResolvedByName: { type: String, default: '' },
    responseAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
