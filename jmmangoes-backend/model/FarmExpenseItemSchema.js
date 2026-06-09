const mongoose = require('mongoose');

const farmExpenseItemSchema = new mongoose.Schema(
  {
    headId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmExpenseHead', required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

farmExpenseItemSchema.index({ headId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('FarmExpenseItem', farmExpenseItemSchema);
