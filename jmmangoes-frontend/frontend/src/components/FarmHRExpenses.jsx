import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date().toISOString().slice(0, 10);

const FarmHRExpenses = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmHRExpenses?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmHRExpenses?.manage;
  const isSuperAdmin = user?.role === 'admin';
  const [staff, setStaff] = useState([]);
  const [years, setYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const selectedStaff = useMemo(() => staff.find((s) => s._id === selectedStaffId), [staff, selectedStaffId]);

  const loadSetup = async () => {
    const [staffRes, yearsRes] = await Promise.all([
      api.get('/farm/hr/staff'),
      api.get('/financial-years'),
    ]);
    const yearRows = yearsRes.data || [];
    setStaff(staffRes.data || []);
    setYears(yearRows);
    if (!financialYearId) {
      const current = yearRows.find((y) => y.isCurrent) || yearRows[0];
      if (current?._id) setFinancialYearId(current._id);
    }
  };

  const loadPayments = async () => {
    const res = await api.get('/farm/hr/payments', { params: { staffId: selectedStaffId, financialYearId } });
    setPayments(res.data?.rows || []);
  };

  useEffect(() => {
    if (canView) loadSetup().catch(() => toast.error('Failed to load farm HR setup.'));
  }, [canView]);

  useEffect(() => {
    if (canView) loadPayments().catch(() => toast.error('Failed to load HR payments.'));
  }, [canView, selectedStaffId, financialYearId]);

  const savePayment = async () => {
    if (busyAction) return;
    const value = Number(amount);
    if (!selectedStaffId || !paymentDate || Number.isNaN(value) || value < 0) return toast.warn('Select HR, date, and valid amount.');
    try {
      setBusyAction(editingPaymentId ? 'update-payment' : 'create-payment');
      const payload = {
        staffId: selectedStaffId,
        financialYearId,
        paymentDate,
        amount: value,
        remarks,
      };
      if (editingPaymentId) {
        await api.put(`/farm/hr/payments/${editingPaymentId}`, payload);
      } else {
        await api.post('/farm/hr/payments', payload);
      }
      setEditingPaymentId('');
      setAmount('');
      setRemarks('');
      toast.success(editingPaymentId ? 'HR payment updated.' : 'HR salary credit/payment saved.');
      await loadPayments();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save HR payment.');
    } finally {
      setBusyAction('');
    }
  };

  const startEditPayment = (row) => {
    setEditingPaymentId(row._id);
    setSelectedStaffId(String(row.staffId || ''));
    setFinancialYearId(String(row.financialYearId || financialYearId || ''));
    setPaymentDate(row.paymentDate ? new Date(row.paymentDate).toISOString().slice(0, 10) : today);
    setAmount(String(Number(row.amount || 0)));
    setRemarks(row.remarks || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingPaymentId('');
    setAmount('');
    setRemarks('');
    setPaymentDate(today);
  };

  const deletePayment = async (row) => {
    if (busyAction) return;
    const ok = window.confirm(`Delete HR payment of PKR ${Number(row.amount || 0).toFixed(2)} for ${row.staffName || 'this staff member'}?`);
    if (!ok) return;
    try {
      setBusyAction(`delete-${row._id}`);
      await api.delete(`/farm/hr/payments/${row._id}`);
      toast.success('HR payment deleted.');
      if (editingPaymentId === row._id) cancelEdit();
      await loadPayments();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete HR payment.');
    } finally {
      setBusyAction('');
    }
  };

  const totalPaid = useMemo(() => payments.reduce((sum, row) => sum + Number(row.amount || 0), 0), [payments]);
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((row) =>
      String(row.staffName || '').toLowerCase().includes(q) ||
      String(row.financialYearName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q) ||
      String(row.enteredByName || '').toLowerCase().includes(q)
    );
  }, [payments, search]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm HR Expenses</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Add Salary Credit / HR Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="border p-2 rounded">
            <option value="">Select HR / Staff</option>
            {staff.map((row) => <option key={row._id} value={row._id}>{row.name} - {row.designation}</option>)}
          </select>
          <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded">
            <option value="">Current Financial Year</option>
            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
          </select>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="border p-2 rounded" />
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="border p-2 rounded" />
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" className="border p-2 rounded md:col-span-3" />
          <div className="flex flex-wrap gap-2">
            <button onClick={savePayment} disabled={!canManage || Boolean(busyAction)} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">
              {busyAction === 'create-payment' || busyAction === 'update-payment' ? 'Saving...' : editingPaymentId ? 'Update Payment' : 'Save Salary Credit'}
            </button>
            {editingPaymentId ? (
              <button onClick={cancelEdit} disabled={Boolean(busyAction)} className="bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-60">Cancel Edit</button>
            ) : null}
          </div>
        </div>
        {selectedStaff ? (
          <p className="text-sm text-gray-600 mt-3">
            Selected: {selectedStaff.name} / {selectedStaff.designation} / {selectedStaff.employmentType} / Salary-Wage PKR {Number(selectedStaff.salaryAmount || 0).toFixed(2)}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-600">Selected Financial Year HR Payments</div>
          <div className="text-2xl font-bold">PKR {totalPaid.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-600">Payment Records</div>
          <div className="text-2xl font-bold">{payments.length}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">HR Payment History</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payments..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { name: 'Date', selector: (row) => row.paymentDate ? new Date(row.paymentDate).toLocaleString() : '-', sortable: true, wrap: true },
            { name: 'Staff', selector: (row) => row.staffName || '-', sortable: true, wrap: true },
            { name: 'Financial Year', selector: (row) => row.financialYearName || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => `PKR ${Number(row.amount || 0).toFixed(2)}` },
            { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true },
            { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
            ...(isSuperAdmin ? [{
              name: 'Actions',
              button: true,
              minWidth: '170px',
              cell: (row) => (
                <div className="flex flex-wrap gap-2 py-1">
                  <button onClick={() => startEditPayment(row)} disabled={Boolean(busyAction)} className="bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-60">Edit</button>
                  <button onClick={() => deletePayment(row)} disabled={Boolean(busyAction)} className="bg-red-700 text-white px-3 py-1 rounded disabled:opacity-60">
                    {busyAction === `delete-${row._id}` ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              ),
            }] : []),
          ]}
          data={filteredPayments}
          pagination
          dense
          highlightOnHover
          noDataComponent="No HR payments found."
        />
      </div>
    </div>
  );
};

export default FarmHRExpenses;
