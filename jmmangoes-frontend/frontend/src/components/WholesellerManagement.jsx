import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const blank = { name: '', code: '', contactNumber: '', contactPersonName: '', address: '', city: '', isActive: true };

const WholesellerManagement = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.wholesellerManagement?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.wholesellerManagement?.manage;
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');

  const load = async () => {
    const res = await api.get('/wholesellers');
    setRows(res.data || []);
  };

  useEffect(() => { if (canView) load().catch(() => toast.error('Failed to load wholesellers')); }, [canView]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editingId) await api.put(`/wholesellers/${editingId}`, form);
      else await api.post('/wholesellers', form);
      toast.success(editingId ? 'Wholeseller updated' : 'Wholeseller created');
      setForm(blank);
      setEditingId('');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save wholeseller');
    }
  };

  const remove = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Delete wholeseller?')) return;
    await api.delete(`/wholesellers/${id}`);
    await load();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Wholeseller Management</h2>
      <form onSubmit={submit} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <input className="border p-2 rounded" placeholder="Wholeseller Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Wholeseller Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Contact Number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Contact Person" value={form.contactPersonName} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} />
        <input className="border p-2 rounded" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active</label>
        <div className="md:col-span-2 flex gap-2">
          <button className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Update' : 'Create'}</button>
          {editingId ? <button type="button" className="border px-4 py-2 rounded" onClick={() => { setEditingId(''); setForm(blank); }}>Cancel</button> : null}
        </div>
      </form>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead><tr><th className="border px-2 py-1">Code</th><th className="border px-2 py-1">Name</th><th className="border px-2 py-1">City</th><th className="border px-2 py-1">Status</th><th className="border px-2 py-1">Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="border px-2 py-1">{r.code}</td>
                <td className="border px-2 py-1">{r.name}</td>
                <td className="border px-2 py-1">{r.city || '-'}</td>
                <td className="border px-2 py-1">{r.isActive ? 'Active' : 'Inactive'}</td>
                <td className="border px-2 py-1"><div className="flex gap-2"><button className="text-blue-700 hover:underline" onClick={() => { setEditingId(r._id); setForm({ name: r.name || '', code: r.code || '', contactNumber: r.contactNumber || '', contactPersonName: r.contactPersonName || '', address: r.address || '', city: r.city || '', isActive: r.isActive !== false }); }}>Edit</button>{canManage ? <button className="text-red-700 hover:underline" onClick={() => remove(r._id)}>Delete</button> : null}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WholesellerManagement;

