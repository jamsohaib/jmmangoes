const mongoose = require('mongoose');

const farmUsherBeneficiarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactNumber: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    isRelative: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

farmUsherBeneficiarySchema.index({ name: 1 });

module.exports = mongoose.model('FarmUsherBeneficiary', farmUsherBeneficiarySchema);
