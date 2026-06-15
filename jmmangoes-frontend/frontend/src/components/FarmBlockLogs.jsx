import React, { useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyForm = {
  logType: 'irrigation',
  logDate: new Date().toISOString().slice(0, 10),
  quantity: '',
  unit: '',
  details: '',
};

const FarmBlockLogs = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmBlockLogs?.view || user?.permissions?.farmBlocks?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmBlockLogs?.manage || user?.permissions?.farmBlocks?.manage;

  const [blockName, setBlockName] = useState('');
  const [blockQr, setBlockQr] = useState('');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const loadBlock = async () => {
    if (!blockName.trim() && !blockQr.trim()) return toast.warn('Enter block name or QR text.');
    setLoading(true);
    try {
      const res = await api.get('/farm/block-details', { params: { blockName: blockName.trim(), blockQr: blockQr.trim() } });
      setSelectedBlock(res.data?.block || null);
      setRows(res.data?.blockLogs || []);
      if (res.data?.block) toast.success(`Loaded ${res.data.block.code} - ${res.data.block.name}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to fetch block');
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async (blockId) => {
    if (!blockId) return;
    const res = await api.get('/farm/block-logs', { params: { blockId } });
    setRows(res.data || []);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!selectedBlock?._id) return toast.warn('Select a block first.');
    try {
      await api.post('/farm/block-logs', {
        blockId: selectedBlock._id,
        ...form,
      });
      toast.success('Block log added');
      setForm(emptyForm);
      await refreshLogs(selectedBlock._id);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add block log');
    }
  };

  const columns = [
    { name: 'Date', selector: (r) => r.logDate || r.createdAt, sortable: true, cell: (r) => new Date(r.logDate || r.createdAt).toLocaleDateString() },
    { name: 'Type', selector: (r) => r.logType || '', sortable: true, cell: (r) => <span className="capitalize">{r.logType || ''}</span> },
    { name: 'Quantity', selector: (r) => Number(r.quantity || 0), sortable: true, right: true },
    { name: 'Unit', selector: (r) => r.unit || '-', sortable: true },
    { name: 'Details', selector: (r) => r.details || '-', grow: 2, wrap: true },
    { name: 'Created By', selector: (r) => r.createdByName || '-', sortable: true },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Block Logs</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Search Block</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="border p-2 rounded" placeholder="Block name" value={blockName} onChange={(e) => setBlockName(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Scan/paste block QR text" value={blockQr} onChange={(e) => setBlockQr(e.target.value)} />
          <button type="button" onClick={loadBlock} className="bg-green-600 text-white rounded px-4 py-2">{loading ? 'Loading...' : 'Load Block'}</button>
        </div>
        {selectedBlock ? (
          <p className="text-sm text-gray-600 mt-2">
            Selected Block: <strong>{selectedBlock.code}</strong> - {selectedBlock.name}
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Add Block Level Log</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select className="border p-2 rounded" value={form.logType} onChange={(e) => setForm((p) => ({ ...p, logType: e.target.value }))}>
            <option value="irrigation">Irrigation</option>
            <option value="pesticide">Pesticide</option>
            <option value="maintenance">Maintenance</option>
            <option value="fertilizer">Fertilizer</option>
            <option value="production">Production</option>
          </select>
          <input type="date" className="border p-2 rounded" value={form.logDate} onChange={(e) => setForm((p) => ({ ...p, logDate: e.target.value }))} />
          <input type="number" step="0.01" className="border p-2 rounded" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <input className="border p-2 rounded" placeholder="Unit (kg/liters/etc)" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
          <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={!canManage}>Save Log</button>
        </div>
        <textarea className="w-full border p-2 rounded mt-2" placeholder="Details / notes" value={form.details} onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))} />
      </form>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-2">Block Log History</h3>
        <DataTable columns={columns} data={rows} pagination highlightOnHover dense />
      </div>
    </div>
  );
};

export default FarmBlockLogs;

