const mongoose = require('mongoose');

const actionLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    module: { type: String, default: '', trim: true },
    entityType: { type: String, default: '', trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityLabel: { type: String, default: '', trim: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    performedByName: { type: String, default: '', trim: true },
    performedByRole: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

actionLogSchema.index({ createdAt: -1 });
actionLogSchema.index({ module: 1, createdAt: -1 });

module.exports = mongoose.model('ActionLog', actionLogSchema);
