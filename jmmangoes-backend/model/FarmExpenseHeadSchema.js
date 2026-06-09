const mongoose = require('mongoose');

const farmExpenseHeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    colorCode: { type: String, default: '#166534', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FarmExpenseHead', farmExpenseHeadSchema);
