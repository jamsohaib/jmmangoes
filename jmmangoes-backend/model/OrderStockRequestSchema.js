const mongoose = require('mongoose');

const orderStockRequestItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderStockRequestSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
    sourceSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    sourceSiteName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending', index: true },
    items: { type: [orderStockRequestItemSchema], default: [] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedByName: { type: String, default: '' },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedByName: { type: String, default: '' },
    respondedAt: { type: Date, default: null },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrderStockRequest', orderStockRequestSchema);

