import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const initialForm = {
  name: '',
  contactNumber: '',
  contactPersonName: '',
  address: '',
  city: '',
  isActive: true,
};

const AdminSites = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.adminSites?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.adminSites?.manage;
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);

  const loadSites = async () => {
    const res = await api.get('/sites');
    setSites(res.data || []);
  };

  useEffect(() => {
    if (canView) loadSites().catch(console.error);
  }, [canView]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editing) {
        await api.put(`/sites/${editing}`, form);
        toast.success('Site updated.');
      } else {
        await api.post('/sites', form);
        toast.success('Site added.');
      }
      setForm(initialForm);
      setEditing(null);
      await loadSites();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save site.');
    }
  };

  const onEdit = (site) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (site.name.toLowerCase() === 'online') {
      toast.warn('Online site is system-managed.');
      return;
    }
    setEditing(site._id);
    setForm({
      name: site.name || '',
      contactNumber: site.contactNumber || '',
      contactPersonName: site.contactPersonName || '',
      address: site.address || '',
      city: site.city || '',
      isActive: site.isActive !== false,
    });
  };

  const onDelete = async (site) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (site.name.toLowerCase() === 'online') {
      toast.warn('Online site cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete site "${site.name}"?`)) return;
    try {
      await api.delete(`/sites/${site._id}`);
      toast.success('Site deleted.');
      await loadSites();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete site.');
    }
  };

  const onToggle = async (site) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (site.name.toLowerCase() === 'online') {
      toast.warn('Online site status cannot be changed.');
      return;
    }
    try {
      await api.put(`/sites/${site._id}`, { isActive: !site.isActive });
      toast.success(`Site ${site.isActive ? 'disabled' : 'enabled'}.`);
      await loadSites();
    } catch (err) {
      toast.error('Failed to update site status.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Sites</h2>
      <p className="mb-3 text-sm text-gray-700">
        Add only physical sites here. The default <strong>online</strong> site is system-managed for website rates.
      </p>
      <form onSubmit={onSubmit} className="bg-white p-4 rounded shadow space-y-3 mb-5">
        <input className="w-full border p-2 rounded" placeholder="Site name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="w-full border p-2 rounded" placeholder="Contact number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} required />
        <input className="w-full border p-2 rounded" placeholder="Contact person name (optional)" value={form.contactPersonName} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} />
        <input className="w-full border p-2 rounded" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
        <input className="w-full border p-2 rounded" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        <button className="bg-green-600 text-white px-4 py-2 rounded">{editing ? 'Update Site' : 'Add Site'}</button>
      </form>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Contact</th>
              <th className="border px-3 py-2">Person</th>
              <th className="border px-3 py-2">Address</th>
              <th className="border px-3 py-2">City</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site._id}>
                <td className="border px-3 py-2">{site.name} {site.name.toLowerCase() === 'online' ? '(Default)' : ''}</td>
                <td className="border px-3 py-2">{site.contactNumber}</td>
                <td className="border px-3 py-2">{site.contactPersonName || '-'}</td>
                <td className="border px-3 py-2">{site.address}</td>
                <td className="border px-3 py-2">{site.city}</td>
                <td className="border px-3 py-2">{site.isActive ? 'Active' : 'Disabled'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(site)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => onToggle(site)} className="text-yellow-700 hover:underline">{site.isActive ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => onDelete(site)} className="text-red-600 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSites;
