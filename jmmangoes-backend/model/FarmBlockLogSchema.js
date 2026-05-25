const mongoose = require('mongoose');

const farmBlockLogSchema = new mongoose.Schema(
  {
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmBlock', required: true },
    blockName: { type: String, required: true, trim: true },
    blockCode: { type: String, required: true, trim: true, uppercase: true },
    logType: {
      type: String,
      enum: ['irrigation', 'pesticide', 'maintenance', 'fertilizer', 'production'],
      required: true,
    },
    logDate: { type: Date, default: Date.now },
    year: { type: Number, default: () => new Date().getFullYear() },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: '', trim: true },
    details: { type: String, default: '', trim: true },
    maintenanceStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    maintenanceCompletedAt: { type: Date, default: null },
    maintenanceCompletedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    maintenanceCompletedByName: { type: String, default: '', trim: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

farmBlockLogSchema.index({ blockId: 1, logDate: -1 });

module.exports = mongoose.model('FarmBlockLog', farmBlockLogSchema);

