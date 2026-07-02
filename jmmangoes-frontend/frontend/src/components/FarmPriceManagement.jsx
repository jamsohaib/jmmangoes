import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;

const FarmPriceManagement = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmPriceManagement?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmPriceManagement?.manage;
  const [years, setYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [summary, setSummary] = useState(null);
  const [gradePrices, setGradePrices] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadYears = async () => {
    const res = await api.get('/financial-years');
    const rows = res.data || [];
    setYears(rows);
    if (!financialYearId) {
      const current = rows.find((row) => row.isCurrent) || rows[0];
      if (current?._id) setFinancialYearId(current._id);
    }
  };

  const loadSummary = async () => {
    if (!financialYearId) return;
    const res = await api.get('/farm/usher/summary', { params: { financialYearId } });
    const data = res.data || {};
    setSummary(data);
    const saved = new Map((data.setting?.gradePrices || []).map((row) => [String(row.varietyName || '').toLowerCase(), row]));
    const rows = (data.varieties || []).map((variety) => {
      const existing = saved.get(String(variety.name || '').toLowerCase()) || {};
      return {
        varietyId: variety._id,
        varietyName: variety.name,
        gradeA: Number(existing.gradeA || 0),
        gradeB: Number(existing.gradeB || 0),
        gradeC: Number(existing.gradeC || 0),
        gradeD: Number(existing.gradeD || 0),
      };
    });
    setGradePrices(rows);
  };

  useEffect(() => {
    if (canView) loadYears().catch(() => toast.error('Failed to load financial years.'));
  }, [canView]);

  useEffect(() => {
    if (canView && financialYearId) loadSummary().catch(() => toast.error('Failed to load farm price summary.'));
  }, [canView, financialYearId]);

  const setPrice = (index, key, value) => {
    setGradePrices((prev) => prev.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };

  const savePrices = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    setSaving(true);
    try {
      await api.put('/farm/usher/settings', {
        financialYearId,
        gradePrices: gradePrices.map((row) => ({
          ...row,
          gradeA: Number(row.gradeA || 0),
          gradeB: Number(row.gradeB || 0),
          gradeC: Number(row.gradeC || 0),
          gradeD: Number(row.gradeD || 0),
        })),
      });
      toast.success('Farm prices saved.');
      await loadSummary();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save farm prices.');
    } finally {
      setSaving(false);
    }
  };

  const productionRows = useMemo(() => summary?.productionByVariety || [], [summary]);
  const totals = summary?.totals || {};

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm Price Management</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <label className="block text-sm font-medium mb-1">Financial Year</label>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded w-full md:w-96">
          <option value="">Select financial year</option>
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700"><div className="text-sm text-gray-600">Total Production</div><div className="text-xl font-bold">{Number(totals.totalProductionKg || 0).toFixed(2)} kg</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700"><div className="text-sm text-gray-600">Total Yield Value</div><div className="text-xl font-bold">{money(totals.totalYieldValue)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-orange-700"><div className="text-sm text-gray-600">Configured Varieties</div><div className="text-xl font-bold">{gradePrices.length}</div></div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <h3 className="text-lg font-semibold">On-Farm Grade Prices</h3>
          <button onClick={savePrices} disabled={!canManage || !financialYearId || saving} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Prices'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Variety</th>
                <th className="p-2 text-left">Grade A Price</th>
                <th className="p-2 text-left">Grade B Price</th>
                <th className="p-2 text-left">Grade C Price</th>
                <th className="p-2 text-left">Grade D Price</th>
              </tr>
            </thead>
            <tbody>
              {gradePrices.map((row, index) => (
                <tr key={row.varietyId || row.varietyName} className="border-t">
                  <td className="p-2 font-semibold">{row.varietyName}</td>
                  {['gradeA', 'gradeB', 'gradeC', 'gradeD'].map((key) => (
                    <td key={key} className="p-2">
                      <input type="number" min="0" step="0.01" value={row[key]} onChange={(e) => setPrice(index, key, e.target.value)} className="border p-2 rounded w-32" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Production, Prices And Yield By Variety</h3>
        <DataTable
          columns={[
            { name: 'Variety', selector: (row) => row.varietyName || '-', sortable: true, wrap: true },
            { name: 'A Kg', selector: (row) => Number(row.gradeA || 0), sortable: true, cell: (row) => Number(row.gradeA || 0).toFixed(2) },
            { name: 'A Price', selector: (row) => Number(row.prices?.gradeA || 0), sortable: true, cell: (row) => money(row.prices?.gradeA) },
            { name: 'B Kg', selector: (row) => Number(row.gradeB || 0), sortable: true, cell: (row) => Number(row.gradeB || 0).toFixed(2) },
            { name: 'B Price', selector: (row) => Number(row.prices?.gradeB || 0), sortable: true, cell: (row) => money(row.prices?.gradeB) },
            { name: 'C Kg', selector: (row) => Number(row.gradeC || 0), sortable: true, cell: (row) => Number(row.gradeC || 0).toFixed(2) },
            { name: 'C Price', selector: (row) => Number(row.prices?.gradeC || 0), sortable: true, cell: (row) => money(row.prices?.gradeC) },
            { name: 'D Kg', selector: (row) => Number(row.gradeD || 0), sortable: true, cell: (row) => Number(row.gradeD || 0).toFixed(2) },
            { name: 'D Price', selector: (row) => Number(row.prices?.gradeD || 0), sortable: true, cell: (row) => money(row.prices?.gradeD) },
            { name: 'Total Kg', selector: (row) => Number(row.totalKg || 0), sortable: true, cell: (row) => Number(row.totalKg || 0).toFixed(2) },
            { name: 'Yield Value', selector: (row) => Number(row.totalValue || 0), sortable: true, cell: (row) => money(row.totalValue) },
          ]}
          data={productionRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No production found for this financial year."
        />
      </div>
    </div>
  );
};

export default FarmPriceManagement;
