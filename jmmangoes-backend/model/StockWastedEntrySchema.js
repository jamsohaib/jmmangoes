const mongoose = require('mongoose');

const stockWastedEntrySchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    siteName: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockWastedEntry', stockWastedEntrySchema);

