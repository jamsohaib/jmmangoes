const mongoose = require('mongoose');

const whatsAppEventSchema = new mongoose.Schema({
  eventType: { type: String, enum: ['message', 'status', 'unknown'], default: 'unknown', index: true },
  direction: { type: String, enum: ['incoming', 'outgoing', 'unknown'], default: 'unknown' },
  phoneNumberId: { type: String, default: '', index: true },
  displayPhoneNumber: { type: String, default: '' },
  waId: { type: String, default: '', index: true },
  contactName: { type: String, default: '' },
  from: { type: String, default: '' },
  recipientId: { type: String, default: '' },
  messageId: { type: String, default: '', index: true },
  messageType: { type: String, default: '' },
  text: { type: String, default: '' },
  buttonText: { type: String, default: '' },
  buttonPayload: { type: String, default: '' },
  status: { type: String, default: '' },
  timestamp: { type: Date, default: null },
  orderNumber: { type: String, default: '', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  actionTaken: { type: String, default: '' },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppEvent', whatsAppEventSchema);
