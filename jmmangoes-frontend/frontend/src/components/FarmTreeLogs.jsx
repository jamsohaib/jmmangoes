import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const logTypes = [
  { value: 'production', label: 'Production' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'disease', label: 'Disease' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'watering', label: 'Watering' },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'harvest', label: 'Harvest' },
];

const blank = {
  treeId: '',
  logType: 'production',
  logDate: '',
  year: new Date().getFullYear(),
  quantity: '',
  quality: '',
  fertilizerType: '',
  fertilizerQuantity: '',
  diseaseName: '',
  maintenanceJob: '',
  gradeA: '',
  gradeB: '',
  gradeC: '',
  gradeD: '',
  remarks: '',
};

const FarmTreeLogs = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmLogs?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmLogs?.manage;
  const [searchParams, setSearchParams] = useSearchParams();
  const [trees, setTrees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');

  const downloadCsv = () => {
    if (!logs.length) return toast.warn('No logs to export.');
    const header = ['Date', 'Type', 'Year', 'Quantity', 'GradeA', 'GradeB', 'GradeC', 'GradeD', 'FertilizerType', 'FertilizerQty', 'Disease', 'Maintenance', 'Quality', 'Remarks'];
    const lines = logs.map((r) => [
      r.logDate ? new Date(r.logDate).toISOString().slice(0, 10) : '',
      r.logType || '',
      r.year || '',
      r.quantity ?? 0,
      r.gradeA ?? 0,
      r.gradeB ?? 0,
      r.gradeC ?? 0,
      r.gradeD ?? 0,
      r.fertilizerType || '',
      r.fertilizerQuantity ?? 0,
      r.diseaseName || '',
      r.maintenanceJob || '',
      r.quality || '',
      (r.remarks || '').replaceAll('\n', ' '),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const treeLabel = selectedTree ? `${selectedTree.treeCode}_${selectedTree.treeId}` : 'all';
    a.download = `farm_tree_logs_${treeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printPdf = () => {
    if (!logs.length) return toast.warn('No logs to print.');
    const title = selectedTree ? `${selectedTree.blockName} / ${selectedTree.treeCode} (${selectedTree.treeId})` : 'Tree Logs';
    const rows = logs.map((r) => `
      <tr>
        <td>${r.logDate ? new Date(r.logDate).toLocaleDateString() : '-'}</td>
        <td>${r.logType || ''}</td>
        <td>${r.year || ''}</td>
        <td>${r.quantity ?? 0}</td>
        <td>${r.gradeA ?? 0}/${r.gradeB ?? 0}/${r.gradeC ?? 0}/${r.gradeD ?? 0}</td>
        <td>${[r.fertilizerType, r.diseaseName, r.maintenanceJob, r.quality, r.remarks].filter(Boolean).join(' | ')}</td>
      </tr>
    `).join('');
    const html = `<!doctype html><html><head><title>Farm Tree Logs</title><style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f2f2f2}</style></head><body><h3>JM Mangoes Farm - Tree Logs</h3><p>${title}</p><table><thead><tr><th>Date</th><th>Type</th><th>Year</th><th>Qty</th><th>Grades</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Popup blocked. Please allow popups.');
    win.document.write(html);
    win.document.close();
  };

  const selectedTreeId = form.treeId;
  const selectedTree = useMemo(() => trees.find((t) => t._id === selectedTreeId), [trees, selectedTreeId]);

  const loadTrees = async () => {
    const res = await api.get('/farm/trees');
    setTrees(res.data || []);
  };

  const loadLogs = async (treeId) => {
    if (!treeId) return setLogs([]);
    const res = await api.get('/farm/tree-logs', { params: { treeId } });
    setLogs(res.data || []);
  };

  useEffect(() => {
    if (!canView) return;
    loadTrees().catch(() => toast.error('Failed to load trees'));
  }, [canView]);

  useEffect(() => {
    const treeId = searchParams.get('treeId') || '';
    if (treeId) setForm((prev) => ({ ...prev, treeId }));
  }, [searchParams]);

  useEffect(() => {
    if (canView) loadLogs(selectedTreeId).catch(() => toast.error('Failed to load logs'));
  }, [canView, selectedTreeId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!form.treeId) return toast.warn('Please select a tree.');
    const payload = { ...form };
    try {
      if (editingId) {
        await api.put(`/farm/tree-logs/${editingId}`, payload);
        toast.success('Log updated');
      } else {
        await api.post('/farm/tree-logs', payload);
        toast.success('Log created');
      }
      setEditingId('');
      setForm((prev) => ({ ...blank, treeId: prev.treeId }));
      await loadLogs(form.treeId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save log');
    }
  };

  const remove = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this log?')) return;
    try {
      await api.delete(`/farm/tree-logs/${id}`);
      toast.success('Log deleted');
      await loadLogs(form.treeId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete log');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Tree Logs</h2>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={downloadCsv} className="px-3 py-2 rounded bg-green-700 text-white">Export Excel (CSV)</button>
        <button type="button" onClick={printPdf} className="px-3 py-2 rounded border border-green-700 text-green-700">Export PDF (Print)</button>
      </div>

      <form onSubmit={submit} className="bg-white rounded shadow p-4 space-y-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="border p-2 rounded" value={form.treeId} onChange={(e) => { const v = e.target.value; setForm({ ...form, treeId: v }); setSearchParams(v ? { treeId: v } : {}); }} required>
            <option value="">Select Tree</option>
            {trees.map((t) => <option key={t._id} value={t._id}>{t.blockName} | {t.treeCode} ({t.treeId})</option>)}
          </select>
          <select className="border p-2 rounded" value={form.logType} onChange={(e) => setForm({ ...form, logType: e.target.value })}>
            {logTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <input type="date" className="border p-2 rounded" value={form.logDate} onChange={(e) => setForm({ ...form, logDate: e.target.value })} />
          <input type="number" className="border p-2 rounded" placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          <input type="number" step="0.01" className="border p-2 rounded" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Quality" value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Fertilizer Type" value={form.fertilizerType} onChange={(e) => setForm({ ...form, fertilizerType: e.target.value })} />
          <input type="number" step="0.01" className="border p-2 rounded" placeholder="Fertilizer Quantity" value={form.fertilizerQuantity} onChange={(e) => setForm({ ...form, fertilizerQuantity: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Disease Name" value={form.diseaseName} onChange={(e) => setForm({ ...form, diseaseName: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Maintenance Job" value={form.maintenanceJob} onChange={(e) => setForm({ ...form, maintenanceJob: e.target.value })} />
          <input type="number" className="border p-2 rounded" placeholder="Grade A" value={form.gradeA} onChange={(e) => setForm({ ...form, gradeA: e.target.value })} />
          <input type="number" className="border p-2 rounded" placeholder="Grade B" value={form.gradeB} onChange={(e) => setForm({ ...form, gradeB: e.target.value })} />
          <input type="number" className="border p-2 rounded" placeholder="Grade C" value={form.gradeC} onChange={(e) => setForm({ ...form, gradeC: e.target.value })} />
          <input type="number" className="border p-2 rounded" placeholder="Grade D" value={form.gradeD} onChange={(e) => setForm({ ...form, gradeD: e.target.value })} />
        </div>
        <textarea className="w-full border p-2 rounded" placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        {selectedTree ? <p className="text-sm text-gray-600">Selected tree: {selectedTree.blockName} / {selectedTree.treeCode} / {selectedTree.treeId}</p> : null}
        <div className="flex gap-2">
          <button className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Update Log' : 'Add Log'}</button>
          {editingId ? <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditingId(''); setForm((prev) => ({ ...blank, treeId: prev.treeId })); }}>Cancel Edit</button> : null}
        </div>
      </form>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Date</th>
              <th className="border px-3 py-2">Type</th>
              <th className="border px-3 py-2">Year</th>
              <th className="border px-3 py-2">Qty</th>
              <th className="border px-3 py-2">Grades (A/B/C/D)</th>
              <th className="border px-3 py-2">Details</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((row) => (
              <tr key={row._id}>
                <td className="border px-3 py-2">{row.logDate ? new Date(row.logDate).toLocaleDateString() : '-'}</td>
                <td className="border px-3 py-2 capitalize">{row.logType}</td>
                <td className="border px-3 py-2">{row.year}</td>
                <td className="border px-3 py-2">{row.quantity ?? 0}</td>
                <td className="border px-3 py-2">{`${row.gradeA || 0}/${row.gradeB || 0}/${row.gradeC || 0}/${row.gradeD || 0}`}</td>
                <td className="border px-3 py-2">
                  {[row.fertilizerType, row.diseaseName, row.maintenanceJob, row.quality, row.remarks].filter(Boolean).join(' | ') || '-'}
                </td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setEditingId(row._id);
                        setForm({
                          treeId: row.treeId,
                          logType: row.logType || 'production',
                          logDate: row.logDate ? new Date(row.logDate).toISOString().slice(0, 10) : '',
                          year: row.year || new Date().getFullYear(),
                          quantity: row.quantity ?? '',
                          quality: row.quality || '',
                          fertilizerType: row.fertilizerType || '',
                          fertilizerQuantity: row.fertilizerQuantity ?? '',
                          diseaseName: row.diseaseName || '',
                          maintenanceJob: row.maintenanceJob || '',
                          gradeA: row.gradeA ?? '',
                          gradeB: row.gradeB ?? '',
                          gradeC: row.gradeC ?? '',
                          gradeD: row.gradeD ?? '',
                          remarks: row.remarks || '',
                        });
                      }}
                    >
                      Edit
                    </button>
                    {canManage ? <button type="button" className="text-red-600 hover:underline" onClick={() => remove(row._id)}>Delete</button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!logs.length ? <tr><td colSpan="7" className="border px-3 py-4 text-center text-gray-500">No logs found for selected tree.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FarmTreeLogs;
