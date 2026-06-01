import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const ManageExpense = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.manageExpense?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.manageExpense?.manage;
  const [heads, setHeads] = useState([]);
  const [items, setItems] = useState([]);
  const [headName, setHeadName] = useState('');
  const [colorCode, setColorCode] = useState('#6B7280');
  const [itemHeadId, setItemHeadId] = useState('');
  const [itemName, setItemName] = useState('');

  const load = async () => {
    const [headsRes, itemsRes] = await Promise.all([api.get('/expense-heads'), api.get('/expense-items/manage')]);
    setHeads(headsRes.data || []);
    setItems(itemsRes.data || []);
    if (!itemHeadId && headsRes.data?.length) setItemHeadId(headsRes.data[0]._id);
  };

  useEffect(() => {
    if (canView) load().catch(console.error);
  }, [canView]);

  const handleAddHead = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!headName.trim()) return toast.warn('Enter expense head name.');
    try {
      await api.post('/expense-heads', { name: headName.trim(), colorCode });
      toast.success('Expense head added.');
      setHeadName('');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add expense head.');
    }
  };

  const handleAddItem = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!itemHeadId || !itemName.trim()) return toast.warn('Select head and enter expense name.');
    try {
      await api.post('/expense-items', { headId: itemHeadId, name: itemName.trim() });
      toast.success('Expense name added.');
      setItemName('');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add expense name.');
    }
  };

  const handleEditHead = async (head) => {
    if (!canManage) return;
    const name = window.prompt('Update expense head name:', head.name || '');
    if (name === null) return;
    const color = window.prompt('Update color code (hex):', head.colorCode || '#6B7280');
    if (color === null) return;
    try {
      await api.put(`/expense-heads/${head._id}`, { name: String(name || '').trim(), colorCode: String(color || '').trim() || '#6B7280' });
      toast.success('Expense head updated.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update expense head.');
    }
  };

  const handleDeleteHead = async (head) => {
    if (!canManage) return;
    if (!window.confirm(`Delete expense head "${head.name}"?`)) return;
    try {
      await api.delete(`/expense-heads/${head._id}`);
      toast.success('Expense head removed.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove expense head.');
    }
  };

  const handleEditItem = async (item) => {
    if (!canManage) return;
    const name = window.prompt('Update expense name:', item.name || '');
    if (name === null) return;
    try {
      await api.put(`/expense-items/${item._id}`, { name: String(name || '').trim(), headId: item.headId });
      toast.success('Expense name updated.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update expense name.');
    }
  };

  const handleDeleteItem = async (item) => {
    if (!canManage) return;
    if (!window.confirm(`Delete expense name "${item.name}"?`)) return;
    try {
      await api.delete(`/expense-items/${item._id}`);
      toast.success('Expense name removed.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove expense name.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Expense</h2>

      <div className="overflow-x-auto bg-white rounded shadow mb-5">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Expense Head</th>
              <th className="border px-3 py-2">Color Code</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h._id}>
                <td className="border px-3 py-2">{h.name}</td>
                <td className="border px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: h.colorCode || '#6B7280' }} />
                    {h.colorCode}
                  </span>
                </td>
                <td className="border px-3 py-2">
                  <div className="flex gap-3">
                    <button onClick={() => handleEditHead(h)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDeleteHead(h)} className="text-red-600 hover:underline">Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {heads.length === 0 && (
              <tr><td colSpan={3} className="border px-3 py-3 text-center text-gray-500">No expense heads found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={headName} onChange={(e) => setHeadName(e.target.value)} placeholder="Expense head name" className="border p-2 rounded" />
        <input type="color" value={colorCode} onChange={(e) => setColorCode(e.target.value)} className="border p-1 rounded h-10" />
        <button onClick={handleAddHead} disabled={!canManage} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60">Add Expense Head</button>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={itemHeadId} onChange={(e) => setItemHeadId(e.target.value)} className="border p-2 rounded">
          <option value="">Select Expense Head</option>
          {heads.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Expense name" className="border p-2 rounded" />
        <button onClick={handleAddItem} disabled={!canManage} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">Add Expense Name</button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">Expense Names</div>
        <table className="min-w-full text-sm">
          <thead><tr><th className="border px-3 py-2">Head</th><th className="border px-3 py-2">Expense Name</th><th className="border px-3 py-2">Actions</th></tr></thead>
          <tbody>
            {items.map((it) => {
              const head = heads.find((h) => h._id === it.headId);
              return (
                <tr key={it._id}>
                  <td className="border px-3 py-2">{head?.name || '-'}</td>
                  <td className="border px-3 py-2">{it.name}</td>
                  <td className="border px-3 py-2">
                    <div className="flex gap-3">
                      <button onClick={() => handleEditItem(it)} className="text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleDeleteItem(it)} className="text-red-600 hover:underline">Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={3} className="border px-3 py-3 text-center text-gray-500">No expense names found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManageExpense;
