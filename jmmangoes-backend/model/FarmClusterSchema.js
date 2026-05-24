const mongoose = require('mongoose');

const farmClusterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true, uppercase: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    gridRows: { type: Number, default: 1, min: 1 },
    gridCols: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FarmCluster', farmClusterSchema);

