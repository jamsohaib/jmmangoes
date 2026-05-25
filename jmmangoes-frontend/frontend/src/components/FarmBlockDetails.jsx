import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from 'react-data-table-component';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const blankLog = {
  logType: 'irrigation',
  logDate: new Date().toISOString().slice(0, 10),
  quantity: '',
  unit: '',
  details: '',
};

const FarmBlockDetails = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmBlockDetails?.view || user?.permissions?.farmBlocks?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmBlockDetails?.manage || user?.permissions?.farmBlocks?.manage;

  const [blockName, setBlockName] = useState('');
  const [blockQr, setBlockQr] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logForm, setLogForm] = useState(blankLog);
  const [selectedTree, setSelectedTree] = useState(null);

  const loadDetails = async (params) => {
    setLoading(true);
    try {
      const res = await api.get('/farm/block-details', { params });
      setData(res.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load block details');
    } finally {
      setLoading(false);
    }
  };

  const searchBlock = async () => {
    if (!blockName.trim() && !blockQr.trim()) return toast.warn('Enter block name or block QR text.');
    await loadDetails({ blockName: blockName.trim(), blockQr: blockQr.trim() });
  };

  const submitBlockLog = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!data?.block?._id) return toast.warn('Search/select a block first.');
    try {
      await api.post('/farm/block-logs', {
        blockId: data.block._id,
        ...logForm,
      });
      toast.success('Block log added');
      setLogForm(blankLog);
      await loadDetails({ blockId: data.block._id });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add block log');
    }
  };

  const trees = data?.trees || [];
  const maxRow = Math.max(1, ...trees.map((t) => Number(t.rowNumber || 0)));
  const maxCol = Math.max(1, ...trees.map((t) => Number(t.rowTreeNumber || 0)));
  const slotMap = useMemo(() => {
    const m = new Map();
    trees.forEach((t) => {
      if (t.rowNumber && t.rowTreeNumber) m.set(`${t.rowNumber}-${t.rowTreeNumber}`, t);
    });
    return m;
  }, [trees]);

  const annualColumns = [
    { name: 'Year', selector: (r) => r.year, sortable: true },
    { name: 'Production', selector: (r) => Number(r.productionQty || 0), sortable: true, right: true },
    { name: 'Fertilizer', selector: (r) => Number(r.fertilizerApplied || 0), sortable: true, right: true },
    { name: 'Irrigation Cycles', selector: (r) => Number(r.irrigationCycles || 0), sortable: true, right: true },
    { name: 'Pesticide Applications', selector: (r) => Number(r.pesticideApplications || 0), sortable: true, right: true },
    { name: 'Maintenance Pending', selector: (r) => Number(r.maintenancePending || 0), sortable: true, right: true },
    { name: 'Maintenance Completed', selector: (r) => Number(r.maintenanceCompleted || 0), sortable: true, right: true },
  ];

  const blockLogColumns = [
    { name: 'Date', selector: (r) => new Date(r.logDate || r.createdAt).toLocaleDateString(), sortable: true },
    { name: 'Type', selector: (r) => r.logType || '', sortable: true },
    { name: 'Quantity', selector: (r) => Number(r.quantity || 0), sortable: true, right: true },
    { name: 'Unit', selector: (r) => r.unit || '-', sortable: true },
    { name: 'Details', selector: (r) => r.details || '-', wrap: true, grow: 2 },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Block Details</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Search Block</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="border p-2 rounded" placeholder="Enter block name" value={blockName} onChange={(e) => setBlockName(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Scan/paste block QR text" value={blockQr} onChange={(e) => setBlockQr(e.target.value)} />
          <button type="button" onClick={searchBlock} className="bg-green-600 text-white px-4 py-2 rounded">{loading ? 'Loading...' : 'Fetch Block Details'}</button>
        </div>
      </div>

      {data?.block ? (
        <>
          <div className="bg-white rounded shadow p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Block Dashboard</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div><strong>Block:</strong> {data.block.code} - {data.block.name}</div>
              <div><strong>Acreage:</strong> {data.block.acreage || 0}</div>
              <div><strong>Total Trees:</strong> {trees.length}</div>
              <div><strong>Status:</strong> {data.block.isActive ? 'Active' : 'Inactive'}</div>
            </div>
          </div>

          <div className="bg-white rounded shadow p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Block Level Summary (Annual)</h3>
            <DataTable columns={annualColumns} data={data.annualSummary || []} pagination dense highlightOnHover />
          </div>

          <form onSubmit={submitBlockLog} className="bg-white rounded shadow p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Add Block Log</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <select className="border p-2 rounded" value={logForm.logType} onChange={(e) => setLogForm((p) => ({ ...p, logType: e.target.value }))}>
                <option value="irrigation">Irrigation</option>
                <option value="pesticide">Pesticide</option>
                <option value="maintenance">Maintenance</option>
                <option value="fertilizer">Fertilizer</option>
                <option value="production">Production</option>
              </select>
              <input type="date" className="border p-2 rounded" value={logForm.logDate} onChange={(e) => setLogForm((p) => ({ ...p, logDate: e.target.value }))} />
              <input type="number" step="0.01" className="border p-2 rounded" placeholder="Quantity" value={logForm.quantity} onChange={(e) => setLogForm((p) => ({ ...p, quantity: e.target.value }))} />
              <input className="border p-2 rounded" placeholder="Unit (e.g. kg, liters)" value={logForm.unit} onChange={(e) => setLogForm((p) => ({ ...p, unit: e.target.value }))} />
              <button className="bg-blue-600 text-white px-4 py-2 rounded" disabled={!canManage}>Save Log</button>
            </div>
            <textarea className="border p-2 rounded w-full mt-2" placeholder="Details / notes" value={logForm.details} onChange={(e) => setLogForm((p) => ({ ...p, details: e.target.value }))} />
          </form>

          <div className="bg-white rounded shadow p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Block Logs</h3>
            <DataTable columns={blockLogColumns} data={data.blockLogs || []} pagination dense highlightOnHover />
          </div>

          <div className="bg-white rounded shadow p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">Block Tree Map</h3>
            <p className="text-xs text-gray-600 mb-2">Click any tree to view detailed tree modal.</p>
            <div className="overflow-auto">
              <div className="inline-block border rounded">
                {Array.from({ length: maxRow }).map((_, rIdx) => {
                  const row = rIdx + 1;
                  return (
                    <div key={`row-${row}`} className="flex">
                      {Array.from({ length: maxCol }).map((__, cIdx) => {
                        const col = cIdx + 1;
                        const t = slotMap.get(`${row}-${col}`);
                        return (
                          <button
                            key={`${row}-${col}`}
                            type="button"
                            className={`w-24 h-24 border text-[10px] ${t ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50'}`}
                            onClick={() => t && setSelectedTree(t)}
                          >
                            <div className="text-gray-500">R{row} C{col}</div>
                            {t ? (
                              <>
                                <div className="font-semibold">{t.treeCode}</div>
                                <div>{t.treeId}</div>
                                <div className="text-indigo-700">View</div>
                              </>
                            ) : <div className="text-gray-300 mt-1">Empty</div>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {selectedTree ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-3xl max-h-[90vh] overflow-auto">
            <h3 className="text-xl font-semibold mb-2">Tree Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
              <div><strong>Name/Code:</strong> {selectedTree.treeCode}</div>
              <div><strong>Identifier:</strong> {selectedTree.treeId}</div>
              <div><strong>Age:</strong> {selectedTree.ageYears || 0} years</div>
              <div><strong>Varieties:</strong> {(selectedTree.varieties || []).join(', ') || '-'}</div>
            </div>

            <h4 className="font-semibold mb-1">Year-wise Summary</h4>
            <div className="overflow-x-auto border rounded mb-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-2 py-1">Year</th>
                    <th className="border px-2 py-1">Production</th>
                    <th className="border px-2 py-1">Fertilizer</th>
                    <th className="border px-2 py-1">Irrigation Cycles</th>
                    <th className="border px-2 py-1">Pesticide Applications</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedTree.yearlySummary || {}).map(([year, s]) => (
                    <tr key={year}>
                      <td className="border px-2 py-1">{year}</td>
                      <td className="border px-2 py-1">{s.productionQty || 0}</td>
                      <td className="border px-2 py-1">{s.fertilizerApplied || 0}</td>
                      <td className="border px-2 py-1">{s.irrigationCycles || 0}</td>
                      <td className="border px-2 py-1">{s.pesticideApplications || 0}</td>
                    </tr>
                  ))}
                  {!Object.keys(selectedTree.yearlySummary || {}).length ? <tr><td className="border px-2 py-2 text-center text-gray-500" colSpan={5}>No yearly summary.</td></tr> : null}
                </tbody>
              </table>
            </div>

            <h4 className="font-semibold mb-1">Upcoming Maintenance Tasks</h4>
            <ul className="list-disc pl-5 text-sm">
              {(selectedTree.upcomingMaintenance || []).map((m) => (
                <li key={m._id}>{m.task} ({m.logDate ? new Date(m.logDate).toLocaleDateString() : '-'})</li>
              ))}
              {!(selectedTree.upcomingMaintenance || []).length ? <li className="text-gray-500">No pending maintenance tasks.</li> : null}
            </ul>

            <div className="flex justify-end mt-4">
              <button className="border px-4 py-2 rounded" onClick={() => setSelectedTree(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FarmBlockDetails;
