import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const numberFmt = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const getId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || value.id || '';
};

const heatColor = (value, max) => {
  const amount = Number(value || 0);
  if (!max || max <= 0) return '#e8f1ff';
  const ratio = Math.max(0, Math.min(1, amount / max));
  const low = { r: 37, g: 99, b: 235 };
  const high = { r: 220, g: 38, b: 38 };
  const r = Math.round(low.r + (high.r - low.r) * ratio);
  const g = Math.round(low.g + (high.g - low.g) * ratio);
  const b = Math.round(low.b + (high.b - low.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
};

const readableText = (value, max) => {
  if (!max || max <= 0) return '#1f2937';
  return Number(value || 0) / max > 0.45 ? '#ffffff' : '#111827';
};

const buildGrid = (rows, cols, items, rowKey, colKey) => {
  const safeRows = Math.max(1, Number(rows || 0), ...items.map((item) => Number(item[rowKey] || 0)));
  const safeCols = Math.max(1, Number(cols || 0), ...items.map((item) => Number(item[colKey] || 0)));
  const itemMap = new Map(items.map((item) => [`${item[rowKey]}-${item[colKey]}`, item]));
  const cells = [];
  for (let row = 1; row <= safeRows; row += 1) {
    for (let col = 1; col <= safeCols; col += 1) {
      cells.push({ row, col, item: itemMap.get(`${row}-${col}`) });
    }
  }
  return { rows: safeRows, cols: safeCols, cells };
};

const FarmProductionMapAnalysis = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const canView = isAdmin || user?.permissions?.analysisFarmProductionMap?.view;

  const [financialYears, setFinancialYears] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [heatMap, setHeatMap] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    const loadFilters = async () => {
      const [yearsRes, clustersRes] = await Promise.all([
        api.get('/financial-years'),
        api.get('/farm/clusters'),
      ]);
      const years = yearsRes.data?.financialYears || yearsRes.data || [];
      const farmClusters = clustersRes.data?.clusters || clustersRes.data || [];
      setFinancialYears(years);
      setClusters(farmClusters);
      setFinancialYearId((prev) => prev || getId(years.find((year) => year.isCurrent)) || getId(years[0]));
      setClusterId((prev) => prev || getId(farmClusters[0]));
    };
    loadFilters().catch((err) => toast.error(err?.response?.data?.message || 'Failed to load analysis filters'));
  }, [canView]);

  useEffect(() => {
    if (!canView || !financialYearId || !clusterId) return;
    const loadHeatMap = async () => {
      setLoading(true);
      const res = await api.get('/analysis/farm-production-map', {
        params: {
          financialYearId,
          clusterId,
          blockId: selectedBlockId || undefined,
        },
      });
      setHeatMap(res.data);
      setLoading(false);
    };
    loadHeatMap().catch((err) => {
      setLoading(false);
      toast.error(err?.response?.data?.message || 'Failed to load production heat map');
    });
  }, [canView, financialYearId, clusterId, selectedBlockId]);

  const blocks = heatMap?.blocks || [];
  const trees = heatMap?.trees || [];
  const cluster = heatMap?.cluster || clusters.find((item) => getId(item) === clusterId) || {};
  const selectedBlock = heatMap?.selectedBlock || blocks.find((item) => getId(item) === selectedBlockId) || null;

  const blockMax = useMemo(() => Math.max(0, ...blocks.map((block) => Number(block.productionQty || 0))), [blocks]);
  const treeMax = useMemo(() => Math.max(0, ...trees.map((tree) => Number(tree.productionQty || 0))), [trees]);

  const blockGrid = useMemo(
    () => buildGrid(cluster.gridRows, cluster.gridCols, blocks, 'clusterRow', 'clusterCol'),
    [cluster.gridRows, cluster.gridCols, blocks],
  );

  const treeGrid = useMemo(
    () => buildGrid(selectedBlock?.gridRows, selectedBlock?.gridCols, trees, 'rowNumber', 'rowTreeNumber'),
    [selectedBlock?.gridRows, selectedBlock?.gridCols, trees],
  );

  if (!canView) {
    return <div className="p-6 text-red-700 font-semibold">Access denied.</div>;
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-700 font-bold">Analysis</p>
        <h1 className="text-3xl md:text-4xl font-black text-slate-950">Farm Production Map</h1>
        <p className="text-slate-600 mt-2">Blue shows lower production and red shows higher production for the selected financial year.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="font-semibold text-sm text-slate-700">
          Financial Year
          <select value={financialYearId} onChange={(e) => { setFinancialYearId(e.target.value); setSelectedBlockId(''); }} className="mt-1 w-full border rounded-lg p-2 bg-white">
            <option value="">Select financial year</option>
            {financialYears.map((year) => (
              <option key={getId(year)} value={getId(year)}>
                {year.name || year.title} {year.isCurrent ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="font-semibold text-sm text-slate-700">
          Cluster
          <select value={clusterId} onChange={(e) => { setClusterId(e.target.value); setSelectedBlockId(''); }} className="mt-1 w-full border rounded-lg p-2 bg-white">
            <option value="">Select cluster</option>
            {clusters.map((item) => (
              <option key={getId(item)} value={getId(item)}>{item.name || item.clusterName || item.code}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setSelectedBlockId('')}
            className="w-full border border-slate-300 rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Show Full Cluster
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Cluster Production</p>
          <p className="text-2xl font-black">{numberFmt(heatMap?.totals?.clusterProductionQty)} kg</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Blocks Mapped</p>
          <p className="text-2xl font-black">{blocks.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Selected Block</p>
          <p className="text-lg font-black">{selectedBlock ? selectedBlock.blockName || selectedBlock.blockCode : 'All blocks'}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Selected Block Production</p>
          <p className="text-2xl font-black">{numberFmt(heatMap?.totals?.selectedBlockProductionQty)} kg</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <div>
            <h2 className="text-xl font-black">Cluster Block Heat Map</h2>
            <p className="text-sm text-slate-500">Click a block to open its tree-level production map.</p>
          </div>
          {loading && <span className="text-sm font-semibold text-emerald-700">Loading...</span>}
        </div>
        <div className="overflow-auto pb-2">
          <div
            className="grid gap-3 min-w-max"
            style={{ gridTemplateColumns: `repeat(${blockGrid.cols}, minmax(150px, 1fr))` }}
          >
            {blockGrid.cells.map(({ row, col, item }) => {
              const value = Number(item?.productionQty || 0);
              const selected = item && getId(item) === selectedBlockId;
              return (
                <button
                  type="button"
                  key={`${row}-${col}`}
                  disabled={!item}
                  onClick={() => setSelectedBlockId(getId(item))}
                  className={`min-h-[110px] rounded-2xl border p-3 text-left transition ${item ? 'shadow-sm hover:scale-[1.02]' : 'border-dashed bg-slate-50 text-slate-400'} ${selected ? 'ring-4 ring-amber-300' : ''}`}
                  style={item ? { background: heatColor(value, blockMax), color: readableText(value, blockMax) } : undefined}
                >
                  {item ? (
                    <>
                      <p className="text-xs opacity-80">R{row} C{col}</p>
                      <p className="font-black">{item.blockCode || item.blockName}</p>
                      <p className="text-sm">{item.blockName}</p>
                      <p className="mt-2 font-bold">{numberFmt(value)} kg</p>
                    </>
                  ) : (
                    <span>Empty slot</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectedBlock && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="mb-3">
            <h2 className="text-xl font-black">Tree Heat Map - {selectedBlock.blockName || selectedBlock.blockCode}</h2>
            <p className="text-sm text-slate-500">Each tree cell shows the tree code and total logged production for the selected financial year.</p>
          </div>
          <div className="overflow-auto pb-2">
            <div
              className="grid gap-2 min-w-max"
              style={{ gridTemplateColumns: `repeat(${treeGrid.cols}, minmax(95px, 1fr))` }}
            >
              {treeGrid.cells.map(({ row, col, item }) => {
                const value = Number(item?.productionQty || 0);
                return (
                  <div
                    key={`${row}-${col}`}
                    className={`min-h-[82px] rounded-xl border p-2 text-center ${item ? 'shadow-sm' : 'border-dashed bg-slate-50 text-slate-400'}`}
                    style={item ? { background: heatColor(value, treeMax), color: readableText(value, treeMax) } : undefined}
                  >
                    {item ? (
                      <>
                        <p className="text-[11px] opacity-80">R{row} C{col}</p>
                        <p className="text-xs font-black break-words">{item.treeCode || item.treeId}</p>
                        <p className="text-xs font-bold mt-1">{numberFmt(value)} kg</p>
                      </>
                    ) : (
                      <span className="text-xs">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default FarmProductionMapAnalysis;
