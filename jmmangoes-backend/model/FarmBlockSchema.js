const mongoose = require('mongoose');

const farmBlockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true, uppercase: true },
    acreage: { type: Number, default: 1, min: 0 },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    gridRows: { type: Number, default: 1, min: 1 },
    gridCols: { type: Number, default: 1, min: 1 },
    clusterId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmCluster', default: null },
    clusterName: { type: String, default: '', trim: true },
    clusterCode: { type: String, default: '', trim: true, uppercase: true },
    clusterRow: { type: Number, default: null, min: 1 },
    clusterCol: { type: Number, default: null, min: 1 },
  },
  { timestamps: true }
);

farmBlockSchema.index(
  { clusterId: 1, clusterRow: 1, clusterCol: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clusterId: { $type: 'objectId' },
      clusterRow: { $type: 'number' },
      clusterCol: { $type: 'number' },
    },
  }
);

module.exports = mongoose.model('FarmBlock', farmBlockSchema);
