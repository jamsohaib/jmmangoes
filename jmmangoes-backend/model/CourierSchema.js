const mongoose = require('mongoose');

const courierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPersonName: { type: String, default: '', trim: true },
    contactNumber: { type: String, default: '', trim: true },
    jmmContactPersonName: { type: String, default: '', trim: true },
    jmmContactNumber: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Courier', courierSchema);

