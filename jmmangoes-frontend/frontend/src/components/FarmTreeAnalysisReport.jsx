import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const getId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || value.id || '';
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows, reportTitle) => {
  if (!rows.length) return toast.warn('No rows to download.');
  const headers = ['Tree Code', 'Tree Identifier', 'Block', 'Row', 'Column', 'Varieties', 'Age', 'Production Kg', 'Missing Variety', 'Missing Age'];
  const body = rows.map((row) => [
    row.treeCode,
    row.treeId,
    `${row.blockCode || ''} ${row.blockName || ''}`.trim(),
    row.rowNumber,
    row.rowTreeNumber,
    (row.varieties || []).join(', '),
    row.ageYears,
    row.productionQty,
    row.missingVariety ? 'Yes' : 'No',
    row.missingAge ? 'Yes' : 'No',
  ]);
  const csv = [headers, ...body].map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const TreeLocationMap = ({ row, compact = false }) => {
  const rows = Math.max(1, Number(row?.gridRows || 0), Number(row?.rowNumber || 0));
  const cols = Math.max(1, Number(row?.gridCols || 0), Number(row?.rowTreeNumber || 0));
  const maxCells = compact ? 144 : 400;
  const tooLarge = rows * cols > maxCells;
  const displayRows = tooLarge ? Math.min(rows, compact ? 8 : 14) : rows;
  const displayCols = tooLarge ? Math.min(cols, compact ? 12 : 18) : cols;
  const cells = [];
  for (let r = 1; r <= displayRows; r += 1) {
    for (let c = 1; c <= displayCols; c += 1) {
      cells.push({ r, c, active: r === Number(row?.rowNumber) && c === Number(row?.rowTreeNumber) });
    }
  }

  return (
    <div>
      <div
        className="inline-grid gap-[2px] rounded bg-slate-100 p-1 border"
        style={{ gridTemplateColumns: `repeat(${displayCols}, ${compact ? '6px' : '14px'})` }}
        title={`Block ${row?.blockCode || ''}, Row ${row?.rowNumber || '-'}, Column ${row?.rowTreeNumber || '-'}`}
      >
        {cells.map((cell) => (
          <span
            key={`${cell.r}-${cell.c}`}
            className={`${compact ? 'h-[6px] w-[6px]' : 'h-[14px] w-[14px]'} rounded-sm ${cell.active ? 'bg-red-600 ring-2 ring-yellow-300' : 'bg-blue-100'}`}
          />
        ))}
      </div>
      {tooLarge && !compact ? <p className="text-xs text-slate-500 mt-1">Map is previewed because this block grid is large.</p> : null}
    </div>
  );
};

const reportConfig = {
  noProduction: {
    title: 'Trees With No Production Report',
    permission: 'analysisNoProductionTrees',
    endpoint: '/analysis/no-production-trees',
    needsFinancialYear: true,
    description: 'Find trees that have no production or harvest entry in the selected financial year.',
  },
  unspecified: {
    title: 'Unspecified Trees Report',
    permission: 'analysisUnspecifiedTrees',
    endpoint: '/analysis/unspecified-trees',
    needsFinancialYear: false,
    description: 'Find trees that are missing variety or age information and locate them inside their blocks.',
  },
};

const FarmTreeAnalysisReport = ({ reportType = 'noProduction' }) => {
  const config = reportConfig[reportType] || reportConfig.noProduction;
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.[config.permission]?.view;

  const [years, setYears] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [variety, setVariety] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [rows, setRows] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    const loadFilters = async () => {
      const calls = [
        api.get('/farm/blocks'),
        api.get('/farm/varieties'),
      ];
      if (config.needsFinancialYear) calls.unshift(api.get('/financial-years'));
      const responses = await Promise.all(calls);
      const offset = config.needsFinancialYear ? 1 : 0;
      if (config.needsFinancialYear) {
        const financialYears = responses[0].data?.financialYears || responses[0].data || [];
        setYears(financialYears);
        setFinancialYearId((prev) => prev || getId(financialYears.find((year) => year.isCurrent)) || getId(financialYears[0]));
      }
      setBlocks(responses[offset].data?.blocks || responses[offset].data || []);
      setVarieties(responses[offset + 1].data?.varieties || responses[offset + 1].data || []);
    };
    loadFilters().catch((err) => toast.error(err?.response?.data?.message || 'Failed to load analysis filters'));
  }, [canView, config.needsFinancialYear]);

  useEffect(() => {
    if (!canView) return;
    if (config.needsFinancialYear && !financialYearId) return;
    const loadReport = async () => {
      setLoading(true);
      const res = await api.get(config.endpoint, {
        params: {
          financialYearId: config.needsFinancialYear ? financialYearId : undefined,
          blockId: blockId || undefined,
          variety: variety || undefined,
          minAge: minAge !== '' ? minAge : undefined,
          maxAge: maxAge !== '' ? maxAge : undefined,
        },
      });
      setRows(res.data?.rows || []);
      setSelectedRow(null);
      setLoading(false);
    };
    loadReport().catch((err) => {
      setLoading(false);
      toast.error(err?.response?.data?.message || 'Failed to load analysis report');
    });
  }, [canView, config, financialYearId, blockId, variety, minAge, maxAge]);

  const filteredTitle = useMemo(() => {
    const parts = [config.title];
    if (blockId) parts.push(blocks.find((block) => getId(block) === blockId)?.name || 'Selected Block');
    if (variety) parts.push(variety);
    return parts.join(' - ');
  }, [config.title, blockId, blocks, variety]);

  if (!canView) {
    return <div className="p-6 text-red-700 font-semibold">Access denied.</div>;
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-700 font-bold">Analysis</p>
        <h1 className="text-3xl md:text-4xl font-black text-slate-950">{config.title}</h1>
        <p className="text-slate-600 mt-2">{config.description}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5 grid grid-cols-1 md:grid-cols-5 gap-4">
        {config.needsFinancialYear && (
          <label className="font-semibold text-sm text-slate-700">
            Financial Year
            <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="mt-1 w-full border rounded-lg p-2 bg-white">
              <option value="">Select year</option>
              {years.map((year) => <option key={getId(year)} value={getId(year)}>{year.name} {year.isCurrent ? '(Current)' : ''}</option>)}
            </select>
          </label>
        )}
        <label className="font-semibold text-sm text-slate-700">
          Variety
          <select value={variety} onChange={(e) => setVariety(e.target.value)} className="mt-1 w-full border rounded-lg p-2 bg-white">
            <option value="">All varieties</option>
            {varieties.map((item) => <option key={getId(item) || item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
        <label className="font-semibold text-sm text-slate-700">
          Acre / Block
          <select value={blockId} onChange={(e) => setBlockId(e.target.value)} className="mt-1 w-full border rounded-lg p-2 bg-white">
            <option value="">All blocks</option>
            {blocks.map((block) => <option key={getId(block)} value={getId(block)}>{block.code || block.blockCode} - {block.name || block.blockName}</option>)}
          </select>
        </label>
        <label className="font-semibold text-sm text-slate-700">
          Min Age
          <input type="number" min="0" value={minAge} onChange={(e) => setMinAge(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className="mt-1 w-full border rounded-lg p-2" placeholder="Any" />
        </label>
        <label className="font-semibold text-sm text-slate-700">
          Max Age
          <input type="number" min="0" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className="mt-1 w-full border rounded-lg p-2" placeholder="Any" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Matching Trees</p>
          <p className="text-3xl font-black">{rows.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Missing Variety</p>
          <p className="text-3xl font-black">{rows.filter((row) => row.missingVariety).length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Missing Age</p>
          <p className="text-3xl font-black">{rows.filter((row) => row.missingAge).length}</p>
        </div>
      </div>

      {selectedRow && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Selected Tree Location</h2>
              <p className="text-sm text-slate-600">
                {selectedRow.treeCode || selectedRow.treeId} in block {selectedRow.blockCode} - {selectedRow.blockName}, row {selectedRow.rowNumber}, column {selectedRow.rowTreeNumber}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedRow(null)} className="border rounded px-3 py-2 text-sm font-semibold hover:bg-slate-100">Close Map</button>
          </div>
          <div className="mt-4">
            <TreeLocationMap row={selectedRow} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-black">Report Results</h2>
            <p className="text-sm text-slate-500">{loading ? 'Loading...' : `${rows.length} record(s) found.`}</p>
          </div>
          <button type="button" onClick={() => downloadCsv(rows, filteredTitle)} className="bg-emerald-700 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-800">
            Download CSV
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="border p-2 text-left">Tree</th>
                <th className="border p-2 text-left">Block</th>
                <th className="border p-2 text-left">Location</th>
                <th className="border p-2 text-left">Variety</th>
                <th className="border p-2 text-left">Age</th>
                {reportType === 'noProduction' && <th className="border p-2 text-left">Production</th>}
                <th className="border p-2 text-left">Missing Info</th>
                <th className="border p-2 text-left">Map Location</th>
                <th className="border p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="align-top hover:bg-slate-50">
                  <td className="border p-2">
                    <div className="font-bold">{row.treeCode || '-'}</div>
                    <div className="text-xs text-slate-500">{row.treeId || '-'}</div>
                  </td>
                  <td className="border p-2">{row.blockCode || '-'}<br /><span className="text-xs text-slate-500">{row.blockName || '-'}</span></td>
                  <td className="border p-2">Row {row.rowNumber || '-'}<br />Col {row.rowTreeNumber || '-'}</td>
                  <td className="border p-2">{(row.varieties || []).length ? row.varieties.join(', ') : <span className="text-red-700 font-semibold">Not assigned</span>}</td>
                  <td className="border p-2">{row.missingAge ? <span className="text-red-700 font-semibold">Not assigned</span> : `${row.ageYears} year(s)`}</td>
                  {reportType === 'noProduction' && <td className="border p-2">{Number(row.productionQty || 0)} kg</td>}
                  <td className="border p-2">
                    {row.missingVariety ? <div className="text-red-700 font-semibold">Missing variety</div> : null}
                    {row.missingAge ? <div className="text-red-700 font-semibold">Missing age/date</div> : null}
                    {!row.missingVariety && !row.missingAge ? '-' : null}
                  </td>
                  <td className="border p-2"><TreeLocationMap row={row} compact /></td>
                  <td className="border p-2">
                    <button type="button" onClick={() => setSelectedRow(row)} className="text-emerald-700 font-semibold hover:underline">View Map</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={reportType === 'noProduction' ? 9 : 8} className="border p-4 text-center text-slate-500">No matching trees found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FarmTreeAnalysisReport;
