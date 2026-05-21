// models/OrderSchema.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, index: true },
  customer: {
    name: String,
    email: String,
    address: String,
    city: String,
    otherCity: String,
    postalCode: String,
    mobile: String
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  shippingRate: { type: Number, required: true },
  shippingCost: { type: Number, required: true },
  totalCost: { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  finalAmount: { type: Number, default: 0 },
  paymentMode: { type: String, enum: ['prepaid', 'cod', 'free'], default: 'cod' },
  status: {
    type: String,
    enum: ['pending_confirmation', 'confirmed', 'rejected', 'dispatched', 'delivered', 'returned', 'cancelled'],
    default: 'pending_confirmation'
  },
  rejectionReason: { type: String, default: '' },
  courier: {
    courierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Courier', default: null },
    courierName: { type: String, default: '' },
    trackingNumber: { type: String, default: '' },
    courierHelpline: { type: String, default: '' },
    jmmContactPersonName: { type: String, default: '' },
    jmmContactNumber: { type: String, default: '' },
  },
  adminRemarks: { type: String, default: '' },
  feedback: {
    rating: { type: Number, min: 1, max: 5, default: null },
    comments: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
