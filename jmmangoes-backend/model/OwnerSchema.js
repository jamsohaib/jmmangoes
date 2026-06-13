const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactNumber: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    sharePercentage: { type: Number, required: true, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

ownerSchema.index({ name: 1 });

module.exports = mongoose.model('Owner', ownerSchema);
