const mongoose = require('mongoose');

const cityOverrideSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    // optional: add index for fast lookup
    index: true,
  },
  cost: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const shippingSettingsSchema = new mongoose.Schema({
  zoneAUnitCost: {
    type: Number,
    required: true,
    min: 0,
  },
  cityOverrides: {
    type: [cityOverrideSchema],
    default: [],
  },
  allowedCities: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true, // automatically add createdAt and updatedAt
});

// export the model
module.exports = mongoose.model('ShippingSettings', shippingSettingsSchema);
