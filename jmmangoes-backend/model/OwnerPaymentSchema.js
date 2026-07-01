const mongoose = require('mongoose');

const ownerPaymentSchema = new mongoose.Schema(
  {
    financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true, index: true },
    financialYearName: { type: String, default: '', trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, index: true },
    ownerName: { type: String, required: true, trim: true },
    paymentDate: { type: Date, default: Date.now, index: true },
    amount: { type: Number, required: true, min: 0 },
    details: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

ownerPaymentSchema.index({ financialYearId: 1, ownerId: 1, paymentDate: -1 });

module.exports = mongoose.model('OwnerPayment', ownerPaymentSchema);
