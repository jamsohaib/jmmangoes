const mongoose = require('mongoose');

const farmTreeLogSchema = new mongoose.Schema(
  {
    treeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmTree', required: true },
    treeCode: { type: String, required: true, trim: true },
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmBlock', required: true },
    blockName: { type: String, required: true, trim: true },
    logType: {
      type: String,
      enum: ['production', 'fertilizer', 'disease', 'maintenance', 'watering', 'irrigation', 'harvest'],
      required: true,
    },
    logDate: { type: Date, default: Date.now },
    year: { type: Number, default: () => new Date().getFullYear() },
    quantity: { type: Number, default: 0, min: 0 },
    quality: { type: String, default: '', trim: true },
    fertilizerType: { type: String, default: '', trim: true },
    fertilizerQuantity: { type: Number, default: 0, min: 0 },
    diseaseName: { type: String, default: '', trim: true },
    maintenanceJob: { type: String, default: '', trim: true },
    gradeA: { type: Number, default: 0, min: 0 },
    gradeB: { type: Number, default: 0, min: 0 },
    gradeC: { type: Number, default: 0, min: 0 },
    gradeD: { type: Number, default: 0, min: 0 },
    remarks: { type: String, default: '', trim: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

farmTreeLogSchema.index({ treeId: 1, logDate: -1 });

module.exports = mongoose.model('FarmTreeLog', farmTreeLogSchema);

