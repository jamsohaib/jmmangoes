const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  productId: mongoose.Schema.Types.ObjectId,
  quantity: Number,
});

module.exports = mongoose.model('CartItem', cartItemSchema);
