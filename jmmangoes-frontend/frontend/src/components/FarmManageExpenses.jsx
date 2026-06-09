import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const FarmManageExpenses = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmExpenseManage?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmExpenseManage?.manage;
  const [heads, setHeads] = useState([]);
  const [items, setItems] = useState([]);
  const [headName, setHeadName] = useState('');
  const [colorCode, setColorCode] = useState('#166534');
  const [itemHeadId, setItemHeadId] = useState('');
  const [itemName, setItemName] = useState('');

  const loadData = async () => {
    const [headsRes, itemsRes] = await Promise.all([
      api.get('/farm/expense-heads'),
      api.get('/farm/expense-items'),
    ]);
    setHeads(headsRes.data || []);
    setItems(itemsRes.data || []);
  };

  useEffect(() => {
    if (canView) loadData().catch(() => toast.error('Failed to load farm expense setup.'));
  }, [canView]);

  const addHead = async () => {
    if (!headName.trim()) return toast.warn('Enter farm expense head name.');
    try {
      await api.post('/farm/expense-heads', { name: headName.trim(), colorCode });
      setHeadName('');
      toast.success('Farm expense head added.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add farm expense head.');
    }
  };

  const updateHead = async (head) => {
    const name = window.prompt('Update farm expense head name:', head.name || '');
    if (name === null) return;
    const color = window.prompt('Update color code:', head.colorCode || '#166534');
    if (color === null) return;
    try {
      await api.put(`/farm/expense-heads/${head._id}`, { name: String(name || '').trim(), colorCode: String(color || '').trim() || '#166534' });
      toast.success('Farm expense head updated.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update farm expense head.');
    }
  };

  const deleteHead = async (head) => {
    if (!window.confirm(`Delete farm expense head "${head.name}"?`)) return;
    try {
      await api.delete(`/farm/expense-heads/${head._id}`);
      toast.success('Farm expense head removed.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove farm expense head.');
    }
  };

  const addItem = async () => {
    if (!itemHeadId || !itemName.trim()) return toast.warn('Select head and enter farm expense name.');
    try {
      await api.post('/farm/expense-items', { headId: itemHeadId, name: itemName.trim() });
      setItemName('');
      toast.success('Farm expense name added.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add farm expense name.');
    }
  };

  const updateItem = async (item) => {
    const name = window.prompt('Update farm expense name:', item.name || '');
    if (name === null) return;
    try {
      await api.put(`/farm/expense-items/${item._id}`, { name: String(name || '').trim(), headId: item.headId });
      toast.success('Farm expense name updated.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update farm expense name.');
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete farm expense name "${item.name}"?`)) return;
    try {
      await api.delete(`/farm/expense-items/${item._id}`);
      toast.success('Farm expense name removed.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove farm expense name.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm Manage Expenses</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Add Farm Expense Head</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={headName} onChange={(e) => setHeadName(e.target.value)} placeholder="Expense head name" className="border p-2 rounded" />
            <input type="color" value={colorCode} onChange={(e) => setColorCode(e.target.value)} className="border p-1 rounded h-10" />
            <button onClick={addHead} disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">Add Head</button>
          </div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Add Farm Expense Name</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select value={itemHeadId} onChange={(e) => setItemHeadId(e.target.value)} className="border p-2 rounded">
              <option value="">Select Head</option>
              {heads.map((head) => <option key={head._id} value={head._id}>{head.name}</option>)}
            </select>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Expense name/detail" className="border p-2 rounded" />
            <button onClick={addItem} disabled={!canManage} className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60">Add Name</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow mb-4 overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold">Farm Expense Heads</div>
        <table className="min-w-full border-collapse">
          <thead><tr><th className="border px-3 py-2">Head</th><th className="border px-3 py-2">Color</th><th className="border px-3 py-2">Actions</th></tr></thead>
          <tbody>
            {heads.map((head) => (
              <tr key={head._id}>
                <td className="border px-3 py-2">{head.name}</td>
                <td className="border px-3 py-2"><span className="inline-block w-6 h-6 rounded align-middle mr-2" style={{ background: head.colorCode }} />{head.colorCode}</td>
                <td className="border px-3 py-2 space-x-2">
                  <button type="button" onClick={() => updateHead(head)} disabled={!canManage} className="text-blue-700 hover:underline disabled:opacity-60">Edit</button>
                  <button type="button" onClick={() => deleteHead(head)} disabled={!canManage} className="text-red-700 hover:underline disabled:opacity-60">Delete</button>
                </td>
              </tr>
            ))}
            {!heads.length ? <tr><td colSpan="3" className="border px-3 py-3 text-center text-gray-500">No farm expense heads found.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold">Farm Expense Names</div>
        <table className="min-w-full border-collapse">
          <thead><tr><th className="border px-3 py-2">Head</th><th className="border px-3 py-2">Expense Name</th><th className="border px-3 py-2">Actions</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const head = heads.find((h) => h._id === item.headId);
              return (
                <tr key={item._id}>
                  <td className="border px-3 py-2">{head?.name || '-'}</td>
                  <td className="border px-3 py-2">{item.name}</td>
                  <td className="border px-3 py-2 space-x-2">
                    <button type="button" onClick={() => updateItem(item)} disabled={!canManage} className="text-blue-700 hover:underline disabled:opacity-60">Edit</button>
                    <button type="button" onClick={() => deleteItem(item)} disabled={!canManage} className="text-red-700 hover:underline disabled:opacity-60">Delete</button>
                  </td>
                </tr>
              );
            })}
            {!items.length ? <tr><td colSpan="3" className="border px-3 py-3 text-center text-gray-500">No farm expense names found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FarmManageExpenses;
