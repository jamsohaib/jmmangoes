const mongoose = require('mongoose');

const farmHRPaymentSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmHRStaff', required: true },
    staffName: { type: String, required: true, trim: true },
    financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', default: null },
    financialYearName: { type: String, default: '', trim: true },
    paymentDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    remarks: { type: String, default: '', trim: true },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    enteredByName: { type: String, default: '' },
  },
  { timestamps: true }
);

farmHRPaymentSchema.index({ staffId: 1, paymentDate: -1 });
farmHRPaymentSchema.index({ financialYearId: 1, paymentDate: -1 });

module.exports = mongoose.model('FarmHRPayment', farmHRPaymentSchema);
