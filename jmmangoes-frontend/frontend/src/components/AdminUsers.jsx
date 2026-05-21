import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const permissionKeys = [
  { key: 'productsPage', label: 'Products Page' },
  { key: 'shippingRates', label: 'Shipping Rates' },
  { key: 'manageCities', label: 'Manage Cities' },
  { key: 'adminSites', label: 'Sites' },
  { key: 'manageStocks', label: 'Manage Stocks' },
  { key: 'salePoint', label: 'Sale Point' },
  { key: 'stockWasted', label: 'Stock Wasted' },
  { key: 'customerDirectory', label: 'Customer Directory' },
  { key: 'manageExpense', label: 'Manage Expense' },
  { key: 'addExpense', label: 'Add Expenses' },
  { key: 'emailAlerts', label: 'Email Alerts' },
  { key: 'courierManagement', label: 'Courier Management' },
  { key: 'orderManagement', label: 'Order Management' },
  { key: 'feedbackReport', label: 'Feedback Report' },
  { key: 'userManagement', label: 'User Management' },
];

const blankPermissions = permissionKeys.reduce((acc, p) => {
  acc[p.key] = { view: false, manage: false };
  return acc;
}, {});

const createEmptyForm = () => ({
  name: '',
  fatherName: '',
  contactNumber: '',
  cnic: '',
  username: '',
  email: '',
  role: 'user',
  password: '',
  confirmPassword: '',
  siteAccess: [],
  permissions: JSON.parse(JSON.stringify(blankPermissions)),
  isActive: true,
});

const AdminUsers = () => {
  const authUser = useAuthStore((state) => state.user);
  const canView = authUser?.role === 'admin' || authUser?.permissions?.userManagement?.view;
  const canManage = authUser?.role === 'admin' || authUser?.permissions?.userManagement?.manage;
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(createEmptyForm());
  const [editingId, setEditingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = async () => {
    const [usersRes, sitesRes] = await Promise.all([api.get('/users'), api.get('/sites')]);
    setUsers(usersRes.data || []);
    setSites((sitesRes.data || []).filter((s) => s.isActive));
  };

  useEffect(() => {
    if (canView) loadData().catch(console.error);
  }, [canView]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.post('/users', form);
      toast.success('User created.');
      setForm(createEmptyForm());
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create user.');
    }
  };

  const openEdit = (u) => {
    setEditingId(u._id);
    setForm({
      ...createEmptyForm(),
      name: u.name || '',
      fatherName: u.fatherName || '',
      contactNumber: u.contactNumber || '',
      cnic: u.cnic || '',
      username: u.username || '',
      email: u.email || '',
      role: u.role || 'user',
      siteAccess: (u.siteAccess || []).map((s) => (typeof s === 'string' ? s : s._id)),
      permissions: { ...blankPermissions, ...(u.permissions || {}) },
      isActive: u.isActive !== false,
      password: '',
      confirmPassword: '',
    });
    setModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      const payload = { ...form };
      if (!String(payload.email || '').trim()) {
        delete payload.email;
      }
      if (!payload.password && !payload.confirmPassword) {
        delete payload.password;
        delete payload.confirmPassword;
      }
      await api.put(`/users/${editingId}`, payload);
      toast.success('User updated.');
      setModalOpen(false);
      setEditingId('');
      setForm(createEmptyForm());
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update user.');
    }
  };

  const handleDelete = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user.');
    }
  };

  const handleToggle = async (u) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/users/${u._id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? 'User disabled.' : 'User enabled.');
      await loadData();
    } catch {
      toast.error('Failed to update user status.');
    }
  };

  const toggleSiteAccess = (siteId) => {
    setForm((prev) => ({
      ...prev,
      siteAccess: prev.siteAccess.includes(siteId)
        ? prev.siteAccess.filter((id) => id !== siteId)
        : [...prev.siteAccess, siteId],
    }));
  };

  const setPermission = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: {
          ...(prev.permissions?.[key] || { view: false, manage: false }),
          [field]: value,
        },
      },
    }));
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">User Management</h2>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Username</th>
              <th className="border px-3 py-2">Contact</th>
              <th className="border px-3 py-2">Role</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="border px-3 py-2">{u.name}</td>
                <td className="border px-3 py-2">{u.username}</td>
                <td className="border px-3 py-2">{u.contactNumber || '-'}</td>
                <td className="border px-3 py-2">{u.role}</td>
                <td className="border px-3 py-2">{u.isActive ? 'Active' : 'Disabled'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(u)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleToggle(u)} className="text-yellow-700 hover:underline">{u.isActive ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => handleDelete(u._id)} className="text-red-600 hover:underline">Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded shadow p-4 space-y-3" autoComplete="off">
        <h3 className="text-xl font-semibold">Create User</h3>
        <input className="w-full border p-2 rounded" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="w-full border p-2 rounded" placeholder="Father Name (optional)" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
        <input className="w-full border p-2 rounded" placeholder="Contact Number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} required />
        <input className="w-full border p-2 rounded" placeholder="CNIC (optional)" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
        <input className="w-full border p-2 rounded" placeholder="Username (cannot be changed later)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input type="text" autoComplete="off" className="w-full border p-2 rounded" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" autoComplete="new-password" className="w-full border p-2 rounded" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <input type="password" autoComplete="new-password" className="w-full border p-2 rounded" placeholder="Confirm Password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
        <div>
          <div className="font-semibold mb-1">Site Access</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {sites.map((s) => (
              <label key={s._id} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.siteAccess.includes(s._id)} onChange={() => toggleSiteAccess(s._id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1">Page Permissions</div>
          <div className="space-y-2">
            {permissionKeys.map((p) => (
              <div key={p.key} className="flex flex-wrap items-center gap-3">
                <span className="min-w-40">{p.label}</span>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={!!form.permissions?.[p.key]?.view} onChange={(e) => setPermission(p.key, 'view', e.target.checked)} />
                  Show
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={!!form.permissions?.[p.key]?.manage} onChange={(e) => setPermission(p.key, 'manage', e.target.checked)} />
                  Manage
                </label>
              </div>
            ))}
          </div>
        </div>
        <button className="bg-green-600 text-white px-4 py-2 rounded">Create User</button>
      </form>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow w-full max-w-2xl p-4 max-h-[90vh] overflow-auto">
            <h3 className="text-xl font-semibold mb-3">Edit User</h3>
            <form className="space-y-3" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Name</label>
                <input className="w-full border p-2 rounded" placeholder="Enter name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Father Name</label>
                <input className="w-full border p-2 rounded" placeholder="Enter father name (optional)" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Contact Number</label>
                <input className="w-full border p-2 rounded" placeholder="Enter contact number" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">CNIC</label>
                <input className="w-full border p-2 rounded" placeholder="Enter CNIC (optional)" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Username</label>
                <input className="w-full border p-2 rounded bg-gray-100" placeholder="Username" value={form.username} disabled />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Email</label>
                <input type="text" autoComplete="off" className="w-full border p-2 rounded" placeholder="Enter email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Reset Password</label>
                <input type="password" autoComplete="new-password" className="w-full border p-2 rounded" placeholder="Enter new password (optional)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password unchanged.</p>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Confirm Reset Password</label>
                <input type="password" autoComplete="new-password" className="w-full border p-2 rounded" placeholder="Confirm new password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
              </div>

              <div>
                <div className="font-semibold mb-1">Site Access</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {sites.map((s) => (
                    <label key={s._id} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.siteAccess.includes(s._id)} onChange={() => toggleSiteAccess(s._id)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-1">Page Permissions</div>
                <div className="space-y-2">
                  {permissionKeys.map((p) => (
                    <div key={p.key} className="flex flex-wrap items-center gap-3">
                      <span className="min-w-40">{p.label}</span>
                      <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={!!form.permissions?.[p.key]?.view} onChange={(e) => setPermission(p.key, 'view', e.target.checked)} />
                        Show
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={!!form.permissions?.[p.key]?.manage} onChange={(e) => setPermission(p.key, 'manage', e.target.checked)} />
                        Manage
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </form>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 rounded bg-green-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
