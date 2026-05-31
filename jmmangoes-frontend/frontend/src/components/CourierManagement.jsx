import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const empty = { name: '', contactPersonName: '', contactNumber: '', jmmContactPersonName: '', jmmContactNumber: '' };

const CourierManagement = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.courierManagement?.view || user?.permissions?.orderManagement?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.courierManagement?.manage;
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);

  const load = async () => {
    try {
      const res = await api.get('/couriers');
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      toast.error(err?.response?.data?.message || 'Failed to load couriers.');
    }
  };
  useEffect(() => { if (canView) load(); }, [canView]);

  const add = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    await api.post('/couriers', form);
    setForm(empty);
    toast.success('Courier added.');
    await load();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;
  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Courier Management</h2>
      <div className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <input className="border p-2 rounded" placeholder="Courier Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Courier Contact Person" value={form.contactPersonName} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Courier Contact Number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
        <input className="border p-2 rounded" placeholder="JM Contact Person" value={form.jmmContactPersonName} onChange={(e) => setForm({ ...form, jmmContactPersonName: e.target.value })} />
        <input className="border p-2 rounded" placeholder="JM Contact Number" value={form.jmmContactNumber} onChange={(e) => setForm({ ...form, jmmContactNumber: e.target.value })} />
        <button onClick={add} className="bg-green-600 text-white px-4 py-2 rounded">Add Courier</button>
      </div>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr><th className="border px-3 py-2">Name</th><th className="border px-3 py-2">Courier Contact</th><th className="border px-3 py-2">JM Contact</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r._id}><td className="border px-3 py-2">{r.name}</td><td className="border px-3 py-2">{r.contactPersonName} ({r.contactNumber})</td><td className="border px-3 py-2">{r.jmmContactPersonName} ({r.jmmContactNumber})</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CourierManagement;
