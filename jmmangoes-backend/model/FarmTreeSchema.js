const mongoose = require('mongoose');

const farmTreeSchema = new mongoose.Schema(
  {
    blockId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmBlock', required: true },
    blockName: { type: String, required: true, trim: true },
    blockCode: { type: String, required: true, trim: true, uppercase: true },
    treeCode: { type: String, required: true, trim: true, uppercase: true, unique: true },
    treeId: { type: String, required: true, trim: true, unique: true },
    serialInBlock: { type: Number, default: 0, min: 0 },
    rowNumber: { type: Number, default: null, min: 1 },
    rowTreeNumber: { type: Number, default: null, min: 1 },
    qrCodeData: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    ageYears: { type: Number, default: 0, min: 0 },
    varieties: [{ type: String, trim: true }],
    plantingDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

farmTreeSchema.index({ blockId: 1, treeCode: 1 }, { unique: true });
farmTreeSchema.index(
  { blockId: 1, rowNumber: 1, rowTreeNumber: 1 },
  { unique: true, partialFilterExpression: { rowNumber: { $type: 'number' }, rowTreeNumber: { $type: 'number' } } }
);

module.exports = mongoose.model('FarmTree', farmTreeSchema);
