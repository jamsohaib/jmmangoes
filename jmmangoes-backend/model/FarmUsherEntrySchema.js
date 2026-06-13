const mongoose = require('mongoose');

const farmUsherEntrySchema = new mongoose.Schema(
  {
    financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    financialYearName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    beneficiaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmUsherBeneficiary', default: null },
    personName: { type: String, required: true, trim: true },
    contactNumber: { type: String, default: '', trim: true },
    isRelative: { type: Boolean, default: false },
    amount: { type: Number, required: true, min: 0 },
    details: { type: String, default: '', trim: true },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    enteredByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

farmUsherEntrySchema.index({ financialYearId: 1, date: -1 });

module.exports = mongoose.model('FarmUsherEntry', farmUsherEntrySchema);
