import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const blank = { name: '', description: '', isActive: true };

const FarmVarieties = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmVarieties?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmVarieties?.manage;
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');

  const load = async () => {
    const res = await api.get('/farm/varieties', { params: { includeInactive: true } });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) load().catch(() => toast.error('Failed to load varieties'));
  }, [canView]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editingId) {
        await api.put(`/farm/varieties/${editingId}`, form);
        toast.success('Variety updated');
      } else {
        await api.post('/farm/varieties', form);
        toast.success('Variety created');
      }
      setForm(blank);
      setEditingId('');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save variety');
    }
  };

  const edit = (row) => {
    setEditingId(row._id);
    setForm({
      name: row.name || '',
      description: row.description || '',
      isActive: row.isActive !== false,
    });
  };

  const remove = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this variety?')) return;
    try {
      await api.delete(`/farm/varieties/${id}`);
      toast.success('Variety deleted');
      if (editingId === id) {
        setEditingId('');
        setForm(blank);
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete variety');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Mango Varieties</h2>

      <form onSubmit={submit} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          className="border p-2 rounded"
          placeholder="Variety name (e.g. Chaunsa)"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          className="border p-2 rounded md:col-span-2"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.isActive}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
          />
          Active
        </label>
        <div className="md:col-span-2 flex gap-2">
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">
            {editingId ? 'Update Variety' : 'Add Variety'}
          </button>
          {editingId ? (
            <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditingId(''); setForm(blank); }}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Description</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id}>
                <td className="border px-3 py-2">{row.name}</td>
                <td className="border px-3 py-2">{row.description || '-'}</td>
                <td className="border px-3 py-2">{row.isActive ? 'Active' : 'Inactive'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2">
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => edit(row)}>Edit</button>
                    {canManage ? <button type="button" className="text-red-600 hover:underline" onClick={() => remove(row._id)}>Delete</button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan="4" className="border px-3 py-4 text-center text-gray-500">No varieties added.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FarmVarieties;

