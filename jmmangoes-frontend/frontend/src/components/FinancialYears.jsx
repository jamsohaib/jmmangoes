import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const blank = { name: '', startDate: '', endDate: '', isCurrent: false, isActive: true };
const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

const FinancialYears = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.financialYears?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.financialYears?.manage;
  const [years, setYears] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');

  const loadYears = async () => {
    const res = await api.get('/financial-years');
    setYears(res.data || []);
  };

  useEffect(() => {
    if (canView) loadYears().catch(() => toast.error('Failed to load financial years.'));
  }, [canView]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!form.name.trim() || !form.startDate || !form.endDate) return toast.warn('Enter name, start date, and end date.');
    try {
      if (editingId) {
        await api.put(`/financial-years/${editingId}`, form);
        toast.success('Financial year updated.');
      } else {
        await api.post('/financial-years', form);
        toast.success('Financial year created.');
      }
      setForm(blank);
      setEditingId('');
      await loadYears();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save financial year.');
    }
  };

  const edit = (year) => {
    setEditingId(year._id);
    setForm({
      name: year.name || '',
      startDate: asDateInput(year.startDate),
      endDate: asDateInput(year.endDate),
      isCurrent: !!year.isCurrent,
      isActive: year.isActive !== false,
    });
  };

  const setCurrent = async (year) => {
    if (!window.confirm(`Set "${year.name}" as current financial year?`)) return;
    try {
      await api.put(`/financial-years/${year._id}/current`);
      toast.success('Current financial year updated.');
      await loadYears();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to set current financial year.');
    }
  };

  const remove = async (year) => {
    if (!window.confirm(`Delete financial year "${year.name}"?`)) return;
    try {
      await api.delete(`/financial-years/${year._id}`);
      toast.success('Financial year deleted.');
      await loadYears();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete financial year.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Financial Years</h2>
      <div className="bg-white rounded shadow p-4 mb-4">
        <p className="text-sm text-gray-600 mb-3">
          Financial years generally start in September and end in August, but you can set exact start and end dates.
        </p>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. FY 2026-2027" className="border p-2 rounded md:col-span-2" />
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="border p-2 rounded" />
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="border p-2 rounded" />
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
            Current
          </label>
          <button className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60" disabled={!canManage}>{editingId ? 'Update' : 'Create'}</button>
        </form>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead><tr><th className="border px-3 py-2">Name</th><th className="border px-3 py-2">Start</th><th className="border px-3 py-2">End</th><th className="border px-3 py-2">Current</th><th className="border px-3 py-2">Actions</th></tr></thead>
          <tbody>
            {years.map((year) => (
              <tr key={year._id}>
                <td className="border px-3 py-2">{year.name}</td>
                <td className="border px-3 py-2">{asDateInput(year.startDate)}</td>
                <td className="border px-3 py-2">{asDateInput(year.endDate)}</td>
                <td className="border px-3 py-2">{year.isCurrent ? 'Yes' : 'No'}</td>
                <td className="border px-3 py-2 space-x-2">
                  <button type="button" onClick={() => edit(year)} className="text-blue-700 hover:underline">Edit</button>
                  <button type="button" onClick={() => setCurrent(year)} disabled={!canManage || year.isCurrent} className="text-green-700 hover:underline disabled:opacity-50">Set Current</button>
                  <button type="button" onClick={() => remove(year)} disabled={!canManage} className="text-red-700 hover:underline disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {!years.length ? <tr><td colSpan="5" className="border px-3 py-4 text-center text-gray-500">No financial years created.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FinancialYears;
