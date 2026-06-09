const mongoose = require('mongoose');

const farmHRStaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    joiningDate: { type: Date, required: true },
    designation: { type: String, required: true, trim: true },
    employmentType: { type: String, enum: ['permanent', 'contract', 'daily_wage', 'seasonal'], default: 'contract' },
    salaryAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'left'], default: 'active' },
    leftDate: { type: Date, default: null },
    remarks: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

farmHRStaffSchema.index({ name: 1, joiningDate: 1 });

module.exports = mongoose.model('FarmHRStaff', farmHRStaffSchema);
