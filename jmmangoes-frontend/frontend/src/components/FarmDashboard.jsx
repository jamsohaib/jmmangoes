import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from 'react-data-table-component';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const FarmDashboard = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmDashboard?.view || user?.permissions?.farmLogs?.view;
  const [data, setData] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [searchBlockProduction, setSearchBlockProduction] = useState('');
  const [searchTreesByBlock, setSearchTreesByBlock] = useState('');
  const [searchTreesByVariety, setSearchTreesByVariety] = useState('');
  const [searchVarietyProduction, setSearchVarietyProduction] = useState('');

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
  const varietyRows = useMemo(() => {
    const source = data?.productionByYearVariety || [];
    if (!selectedYear) return source;
    return source.filter((r) => String(r.year) === selectedYear);
  }, [data, selectedYear]);
  const treesByBlockRows = data?.treesByBlock || [];
  const treesByVarietyRows = data?.treesByVariety || [];

  const filteredBlockProductionRows = useMemo(() => {
    const q = searchBlockProduction.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r.year || '').toLowerCase().includes(q) ||
      String(r.blockName || '').toLowerCase().includes(q)
    );
  }, [rows, searchBlockProduction]);
  const filteredTreesByBlockRows = useMemo(() => {
    const q = searchTreesByBlock.trim().toLowerCase();
    if (!q) return treesByBlockRows;
    return treesByBlockRows.filter((r) => String(r.blockName || '').toLowerCase().includes(q));
  }, [treesByBlockRows, searchTreesByBlock]);
  const filteredTreesByVarietyRows = useMemo(() => {
    const q = searchTreesByVariety.trim().toLowerCase();
    if (!q) return treesByVarietyRows;
    return treesByVarietyRows.filter((r) => String(r.variety || '').toLowerCase().includes(q));
  }, [treesByVarietyRows, searchTreesByVariety]);
  const filteredVarietyProductionRows = useMemo(() => {
    const q = searchVarietyProduction.trim().toLowerCase();
    if (!q) return varietyRows;
    return varietyRows.filter((r) =>
      String(r.year || '').toLowerCase().includes(q) ||
      String(r.variety || '').toLowerCase().includes(q)
    );
  }, [varietyRows, searchVarietyProduction]);

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

  const exportRowsCsv = (filename, headers, sourceRows, mapper) => {
    if (!sourceRows.length) return toast.warn('No rows to export.');
    const lines = sourceRows.map(mapper);
    const csv = [headers, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const blockProductionColumns = [
    { name: 'Year', selector: (r) => r.year, sortable: true },
    { name: 'Block', selector: (r) => r.blockName || '-', sortable: true, wrap: true },
    { name: 'Production Qty', selector: (r) => Number(r.quantity || 0), sortable: true, right: true },
    { name: 'A', selector: (r) => Number(r.gradeA || 0), sortable: true, right: true },
    { name: 'B', selector: (r) => Number(r.gradeB || 0), sortable: true, right: true },
    { name: 'C', selector: (r) => Number(r.gradeC || 0), sortable: true, right: true },
    { name: 'D', selector: (r) => Number(r.gradeD || 0), sortable: true, right: true },
  ];
  const treesByBlockColumns = [
    { name: 'Block', selector: (r) => r.blockName || '-', sortable: true, wrap: true },
    { name: 'Tree Count', selector: (r) => Number(r.treeCount || 0), sortable: true, right: true },
  ];
  const treesByVarietyColumns = [
    { name: 'Variety', selector: (r) => r.variety || 'Unspecified', sortable: true, wrap: true },
    { name: 'Tree Count', selector: (r) => Number(r.treeCount || 0), sortable: true, right: true },
  ];
  const varietyProductionColumns = [
    { name: 'Year', selector: (r) => r.year, sortable: true },
    { name: 'Variety', selector: (r) => r.variety || 'Unspecified', sortable: true, wrap: true },
    { name: 'Production Qty', selector: (r) => Number(r.quantity || 0), sortable: true, right: true },
    { name: 'A', selector: (r) => Number(r.gradeA || 0), sortable: true, right: true },
    { name: 'B', selector: (r) => Number(r.gradeB || 0), sortable: true, right: true },
    { name: 'C', selector: (r) => Number(r.gradeC || 0), sortable: true, right: true },
    { name: 'D', selector: (r) => Number(r.gradeD || 0), sortable: true, right: true },
  ];

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
        <div className="px-4 py-3 border-b font-semibold">Production By Block {selectedYear ? `(${selectedYear})` : '(All Years)'}</div>
        <DataTable
          columns={blockProductionColumns}
          data={filteredBlockProductionRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input type="text" value={searchBlockProduction} onChange={(e) => setSearchBlockProduction(e.target.value)} placeholder="Search year or block..." className="border rounded px-3 py-2 text-sm w-full md:max-w-sm" />
              <div className="flex gap-2">
                <button onClick={() => exportRowsCsv(`farm_dashboard_block_production_${selectedYear || 'all'}_visible.csv`, ['Year', 'Block', 'ProductionQty', 'A', 'B', 'C', 'D'], filteredBlockProductionRows, (r) => [r.year, r.blockName, r.quantity || 0, r.gradeA || 0, r.gradeB || 0, r.gradeC || 0, r.gradeD || 0])} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => exportRowsCsv(`farm_dashboard_block_production_${selectedYear || 'all'}_all.csv`, ['Year', 'Block', 'ProductionQty', 'A', 'B', 'C', 'D'], rows, (r) => [r.year, r.blockName, r.quantity || 0, r.gradeA || 0, r.gradeB || 0, r.gradeC || 0, r.gradeD || 0])} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No production data available."
        />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">Tree Count By Block</div>
        <DataTable
          columns={treesByBlockColumns}
          data={filteredTreesByBlockRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input type="text" value={searchTreesByBlock} onChange={(e) => setSearchTreesByBlock(e.target.value)} placeholder="Search block..." className="border rounded px-3 py-2 text-sm w-full md:max-w-sm" />
              <div className="flex gap-2">
                <button onClick={() => exportRowsCsv('farm_dashboard_trees_by_block_visible.csv', ['Block', 'TreeCount'], filteredTreesByBlockRows, (r) => [r.blockName, r.treeCount || 0])} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => exportRowsCsv('farm_dashboard_trees_by_block_all.csv', ['Block', 'TreeCount'], treesByBlockRows, (r) => [r.blockName, r.treeCount || 0])} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No block data."
        />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mt-4">
        <div className="px-4 py-3 border-b font-semibold">Tree Count By Variety</div>
        <DataTable
          columns={treesByVarietyColumns}
          data={filteredTreesByVarietyRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input type="text" value={searchTreesByVariety} onChange={(e) => setSearchTreesByVariety(e.target.value)} placeholder="Search variety..." className="border rounded px-3 py-2 text-sm w-full md:max-w-sm" />
              <div className="flex gap-2">
                <button onClick={() => exportRowsCsv('farm_dashboard_trees_by_variety_visible.csv', ['Variety', 'TreeCount'], filteredTreesByVarietyRows, (r) => [r.variety || 'Unspecified', r.treeCount || 0])} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => exportRowsCsv('farm_dashboard_trees_by_variety_all.csv', ['Variety', 'TreeCount'], treesByVarietyRows, (r) => [r.variety || 'Unspecified', r.treeCount || 0])} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No variety data."
        />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mt-4">
        <div className="px-4 py-3 border-b font-semibold">Production By Variety {selectedYear ? `(${selectedYear})` : '(All Years)'}</div>
        <DataTable
          columns={varietyProductionColumns}
          data={filteredVarietyProductionRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input type="text" value={searchVarietyProduction} onChange={(e) => setSearchVarietyProduction(e.target.value)} placeholder="Search year or variety..." className="border rounded px-3 py-2 text-sm w-full md:max-w-sm" />
              <div className="flex gap-2">
                <button onClick={() => exportRowsCsv(`farm_dashboard_variety_production_${selectedYear || 'all'}_visible.csv`, ['Year', 'Variety', 'ProductionQty', 'A', 'B', 'C', 'D'], filteredVarietyProductionRows, (r) => [r.year, r.variety || 'Unspecified', r.quantity || 0, r.gradeA || 0, r.gradeB || 0, r.gradeC || 0, r.gradeD || 0])} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => exportRowsCsv(`farm_dashboard_variety_production_${selectedYear || 'all'}_all.csv`, ['Year', 'Variety', 'ProductionQty', 'A', 'B', 'C', 'D'], varietyRows, (r) => [r.year, r.variety || 'Unspecified', r.quantity || 0, r.gradeA || 0, r.gradeB || 0, r.gradeC || 0, r.gradeD || 0])} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No variety production data."
        />
      </div>
    </div>
  );
};

export default FarmDashboard;
