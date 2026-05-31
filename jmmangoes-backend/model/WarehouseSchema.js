const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, unique: true },
    contactNumber: { type: String, default: '', trim: true },
    contactPersonName: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Warehouse', warehouseSchema);

