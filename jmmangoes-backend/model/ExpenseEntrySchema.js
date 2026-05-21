const mongoose = require('mongoose');

const expenseEntrySchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    siteName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    headId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseHead', required: true },
    headName: { type: String, required: true, trim: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseItem', default: null },
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    remarks: { type: String, default: '', trim: true },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    enteredByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseEntry', expenseEntrySchema);

