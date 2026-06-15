import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date().toISOString().slice(0, 10);
const blank = { name: '', joiningDate: today, designation: '', employmentType: 'contract', salaryAmount: '', remarks: '' };

const FarmHR = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmHR?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmHR?.manage;
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');

  const loadStaff = async () => {
    const res = await api.get('/farm/hr/staff');
    setStaff(res.data || []);
  };

  useEffect(() => {
    if (canView) loadStaff().catch(() => toast.error('Failed to load farm HR.'));
  }, [canView]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!form.name.trim() || !form.joiningDate || !form.designation.trim()) return toast.warn('Name, joining date, and designation are required.');
    try {
      if (editingId) {
        await api.put(`/farm/hr/staff/${editingId}`, form);
        toast.success('Staff updated.');
      } else {
        await api.post('/farm/hr/staff', form);
        toast.success('Staff added.');
      }
      setForm(blank);
      setEditingId('');
      await loadStaff();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save staff.');
    }
  };

  const edit = (row) => {
    setEditingId(row._id);
    setForm({
      name: row.name || '',
      joiningDate: row.joiningDate ? new Date(row.joiningDate).toISOString().slice(0, 10) : today,
      designation: row.designation || '',
      employmentType: row.employmentType || 'contract',
      salaryAmount: row.salaryAmount ?? '',
      remarks: row.remarks || '',
    });
  };

  const markLeft = async (row) => {
    if (!window.confirm(`Mark ${row.name} as left?`)) return;
    try {
      await api.put(`/farm/hr/staff/${row._id}/left`, { leftDate: today });
      toast.success('Staff marked as left.');
      await loadStaff();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update staff status.');
    }
  };

  const resume = async (row) => {
    try {
      await api.put(`/farm/hr/staff/${row._id}/resume`);
      toast.success('Staff resumed work.');
      await loadStaff();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to resume staff.');
    }
  };

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((row) =>
      String(row.name || '').toLowerCase().includes(q) ||
      String(row.designation || '').toLowerCase().includes(q) ||
      String(row.employmentType || '').toLowerCase().includes(q) ||
      String(row.status || '').toLowerCase().includes(q)
    );
  }, [staff, search]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm HR</h2>
      <form onSubmit={submit} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Staff name" className="border p-2 rounded" />
        <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="border p-2 rounded" />
        <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Designation" className="border p-2 rounded" />
        <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className="border p-2 rounded">
          <option value="permanent">Permanent</option>
          <option value="contract">Contract</option>
          <option value="daily_wage">Daily Wages</option>
          <option value="seasonal">Seasonal</option>
        </select>
        <input type="number" min="0" step="0.01" value={form.salaryAmount} onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })} placeholder="Salary / wage amount" className="border p-2 rounded" />
        <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks" className="border p-2 rounded md:col-span-2" />
        <button disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">{editingId ? 'Update Staff' : 'Add Staff'}</button>
      </form>

      <div className="bg-white rounded shadow p-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { name: 'Name', selector: (row) => row.name || '-', sortable: true, wrap: true },
            { name: 'Joining Date', selector: (row) => row.joiningDate ? new Date(row.joiningDate).toLocaleDateString() : '-', sortable: true },
            { name: 'Designation', selector: (row) => row.designation || '-', sortable: true, wrap: true },
            { name: 'Type', selector: (row) => row.employmentType || '-', sortable: true, wrap: true },
            { name: 'Salary/Wage', selector: (row) => Number(row.salaryAmount || 0), sortable: true, cell: (row) => `PKR ${Number(row.salaryAmount || 0).toFixed(2)}` },
            { name: 'Status', selector: (row) => row.status || '-', sortable: true, cell: (row) => <span className={row.status === 'left' ? 'text-red-700' : 'text-green-700'}>{row.status}</span> },
            {
              name: 'Actions',
              cell: (row) => (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => edit(row)} className="text-blue-700 hover:underline">Edit</button>
                  {row.status === 'left'
                    ? <button type="button" onClick={() => resume(row)} disabled={!canManage} className="text-green-700 hover:underline disabled:opacity-50">Resume</button>
                    : <button type="button" onClick={() => markLeft(row)} disabled={!canManage} className="text-red-700 hover:underline disabled:opacity-50">Mark Left</button>}
                </div>
              ),
            },
          ]}
          data={filteredStaff}
          pagination
          dense
          highlightOnHover
          noDataComponent="No farm staff found."
        />
      </div>
    </div>
  );
};

export default FarmHR;
