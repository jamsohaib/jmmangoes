const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema(
  {
    headId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseHead', required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

expenseItemSchema.index({ headId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseItem', expenseItemSchema);

