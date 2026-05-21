const mongoose = require('mongoose');

const expenseHeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    colorCode: { type: String, default: '#6B7280', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseHead', expenseHeadSchema);

