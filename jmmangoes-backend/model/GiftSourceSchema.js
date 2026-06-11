const mongoose = require('mongoose');

const giftSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    relation: { type: String, default: '', trim: true },
    contactNumber: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

giftSourceSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('GiftSource', giftSourceSchema);
