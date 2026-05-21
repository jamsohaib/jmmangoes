// models/Product.js
const mongoose = require('mongoose');

const locationPriceSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    siteName: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    price: Number,
    weight: Number, // in kgs
    quantity: Number,
    imageUrl: String,
    category: String,
    isActive: { type: Boolean, default: true },
    isAvailableForCart: { type: Boolean, default: true },
    productChannel: { type: String, enum: ['website', 'store'], default: 'website' },
    availableSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null },
    availableSiteName: { type: String, default: '' },
    locationPrices: { type: [locationPriceSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
