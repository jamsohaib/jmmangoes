import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const FarmDashboard = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmLogs?.view;
  const [data, setData] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');

  useEffect(() => {
    if (!canView) return;
    api.get('/farm/dashboard-summary')
      .then((res) => setData(res.data || null))
      .catch(() => toast.error('Failed to load farm dashboard'));
  }, [canView]);

  const years = useMemo(() => {
    const all = (data?.productionByYearBlock || []).map((r) => String(r.year || ''));
    return [...new Set(all)].filter(Boolean).sort((a, b) => Number(b) - Number(a));
  }, [data]);

  const rows = useMemo(() => {
    const source = data?.productionByYearBlock || [];
    if (!selectedYear) return source;
    return source.filter((r) => String(r.year) === selectedYear);
  }, [data, selectedYear]);

  const exportDashboardCsv = () => {
    if (!rows.length) return toast.warn('No summary rows to export.');
    const header = ['Year', 'Block', 'ProductionQty', 'GradeA', 'GradeB', 'GradeC', 'GradeD'];
    const lines = rows.map((r) => [r.year, r.blockName, r.quantity || 0, r.gradeA || 0, r.gradeB || 0, r.gradeC || 0, r.gradeD || 0]);
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `farm_dashboard_${selectedYear || 'all_years'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportDashboardPdf = () => {
    const rowsHtml = rows.map((r) => `<tr><td>${r.year}</td><td>${r.blockName}</td><td>${r.quantity || 0}</td><td>${r.gradeA || 0}</td><td>${r.gradeB || 0}</td><td>${r.gradeC || 0}</td><td>${r.gradeD || 0}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Farm Dashboard</title><style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f2f2f2}</style></head><body><h3>JM Mangoes Farm Dashboard</h3><p>Total Trees: ${data?.treesTotal ?? 0}</p><p>Grade Totals: A ${data?.gradeTotals?.gradeA ?? 0}, B ${data?.gradeTotals?.gradeB ?? 0}, C ${data?.gradeTotals?.gradeC ?? 0}, D ${data?.gradeTotals?.gradeD ?? 0}</p><table><thead><tr><th>Year</th><th>Block</th><th>Qty</th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Popup blocked. Please allow popups.');
    win.document.write(html);
    win.document.close();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm Dashboard</h2>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={exportDashboardCsv} className="px-3 py-2 rounded bg-green-700 text-white">Export Excel (CSV)</button>
        <button type="button" onClick={exportDashboardPdf} className="px-3 py-2 rounded border border-green-700 text-green-700">Export PDF (Print)</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Total Trees</div>
          <div className="text-3xl font-bold">{data?.treesTotal ?? 0}</div>
        </div>
        <div className="bg-white rounded shadow p-4 md:col-span-2">
          <div className="text-sm text-gray-500 mb-2">Overall Grade Totals</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>A: <span className="font-semibold">{data?.gradeTotals?.gradeA ?? 0}</span></div>
            <div>B: <span className="font-semibold">{data?.gradeTotals?.gradeB ?? 0}</span></div>
            <div>C: <span className="font-semibold">{data?.gradeTotals?.gradeC ?? 0}</span></div>
            <div>D: <span className="font-semibold">{data?.gradeTotals?.gradeD ?? 0}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-3 mb-4">
        <label className="text-sm font-medium">Filter Year</label>
        <select className="w-full md:w-64 border rounded p-2 mt-1" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Year</th>
              <th className="border px-3 py-2">Block</th>
              <th className="border px-3 py-2">Production Qty</th>
              <th className="border px-3 py-2">A</th>
              <th className="border px-3 py-2">B</th>
              <th className="border px-3 py-2">C</th>
              <th className="border px-3 py-2">D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.year}-${r.blockId}-${idx}`}>
                <td className="border px-3 py-2">{r.year}</td>
                <td className="border px-3 py-2">{r.blockName}</td>
                <td className="border px-3 py-2">{r.quantity || 0}</td>
                <td className="border px-3 py-2">{r.gradeA || 0}</td>
                <td className="border px-3 py-2">{r.gradeB || 0}</td>
                <td className="border px-3 py-2">{r.gradeC || 0}</td>
                <td className="border px-3 py-2">{r.gradeD || 0}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="7" className="border px-3 py-4 text-center text-gray-500">No production data available.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Block</th>
              <th className="border px-3 py-2">Tree Count</th>
            </tr>
          </thead>
          <tbody>
            {(data?.treesByBlock || []).map((r) => (
              <tr key={String(r._id)}>
                <td className="border px-3 py-2">{r.blockName}</td>
                <td className="border px-3 py-2">{r.treeCount || 0}</td>
              </tr>
            ))}
            {!data?.treesByBlock?.length ? <tr><td colSpan="2" className="border px-3 py-4 text-center text-gray-500">No block data.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FarmDashboard;
