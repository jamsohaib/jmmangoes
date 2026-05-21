const mongoose = require('mongoose');

const orderAlertEmailSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrderAlertEmail', orderAlertEmailSchema);

