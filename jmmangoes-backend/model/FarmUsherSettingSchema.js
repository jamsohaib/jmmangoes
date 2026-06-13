const mongoose = require('mongoose');

const farmUsherGradePriceSchema = new mongoose.Schema(
  {
    varietyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmVariety', default: null },
    varietyName: { type: String, required: true, trim: true },
    gradeA: { type: Number, default: 0, min: 0 },
    gradeB: { type: Number, default: 0, min: 0 },
    gradeC: { type: Number, default: 0, min: 0 },
    gradeD: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const farmUsherSettingSchema = new mongoose.Schema(
  {
    financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true, unique: true },
    financialYearName: { type: String, required: true, trim: true },
    usherPercentage: { type: Number, default: 5, min: 0 },
    gradePrices: [farmUsherGradePriceSchema],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FarmUsherSetting', farmUsherSettingSchema);
