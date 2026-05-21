const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    contactPersonName: { type: String, trim: true, default: '' },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

siteSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Site', siteSchema);
