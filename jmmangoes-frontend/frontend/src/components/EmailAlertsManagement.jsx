import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const EmailAlertsManagement = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.emailAlerts?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.emailAlerts?.manage;
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState('');

  const load = async () => {
    const res = await api.get('/order-alert-emails');
    setRows(res.data || []);
  };

  useEffect(() => { if (canView) load().catch(console.error); }, [canView]);

  const add = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.post('/order-alert-emails', { email });
      setEmail('');
      toast.success('Email added.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add email.');
    }
  };

  const remove = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Remove this email?')) return;
    await api.delete(`/order-alert-emails/${id}`);
    await load();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Email Alerts Management</h2>
      <div className="bg-white rounded shadow p-4 mb-4 flex gap-2">
        <input className="border p-2 rounded flex-1" placeholder="Enter alert email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={add} className="bg-green-600 text-white px-4 py-2 rounded">Add</button>
      </div>
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr><th className="border px-3 py-2">Email</th><th className="border px-3 py-2">Action</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r._id}><td className="border px-3 py-2">{r.email}</td><td className="border px-3 py-2"><button onClick={() => remove(r._id)} className="text-red-600 hover:underline">Remove</button></td></tr>)}
            {rows.length === 0 && <tr><td colSpan={2} className="border px-3 py-3 text-center text-gray-500">No emails added.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmailAlertsManagement;

