const mongoose = require('mongoose');

const companyCashDepositSchema = new mongoose.Schema(
  {
    holderType: { type: String, enum: ['site', 'online', 'warehouse', 'wholeseller'], required: true },
    holderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    holderName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
    paymentMethodName: { type: String, required: true, trim: true },
    remarks: { type: String, default: '', trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    reviewRemarks: { type: String, default: '', trim: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedByName: { type: String, default: '', trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '', trim: true },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

companyCashDepositSchema.index({ holderType: 1, holderId: 1, status: 1, date: -1 });
companyCashDepositSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CompanyCashDeposit', companyCashDepositSchema);
