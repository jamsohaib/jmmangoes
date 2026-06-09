const mongoose = require('mongoose');

const farmExpenseEntrySchema = new mongoose.Schema(
  {
    entryType: { type: String, enum: ['fund', 'expense'], required: true },
    date: { type: Date, required: true },
    headId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmExpenseHead', default: null },
    headName: { type: String, default: '', trim: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmExpenseItem', default: null },
    itemName: { type: String, default: '', trim: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'FarmHRStaff', default: null },
    staffName: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
    remarks: { type: String, default: '', trim: true },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    enteredByName: { type: String, default: '' },
  },
  { timestamps: true }
);

farmExpenseEntrySchema.index({ entryType: 1, date: -1 });

module.exports = mongoose.model('FarmExpenseEntry', farmExpenseEntrySchema);
