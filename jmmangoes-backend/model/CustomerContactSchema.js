const mongoose = require('mongoose');

const customerContactSchema = new mongoose.Schema(
  {
    customerName: { type: String, default: '', trim: true },
    customerWhatsapp: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: '', trim: true, lowercase: true },
    source: { type: String, default: 'imported', trim: true },
    lastPurchaseSite: { type: String, default: 'online', trim: true },
    notes: { type: String, default: '', trim: true },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

customerContactSchema.index({ customerWhatsapp: 1 }, { unique: true });
customerContactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CustomerContact', customerContactSchema);
