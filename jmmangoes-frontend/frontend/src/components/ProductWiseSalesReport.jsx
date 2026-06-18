import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date();
const lastWeek = new Date();
lastWeek.setDate(today.getDate() - 6);

const toDateInput = (date) => date.toISOString().slice(0, 10);
const money = (value) => `PKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const qty = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows, headers, mapper, filename) => {
  if (!rows.length) return toast.warn('No rows to download.');
  const csv = [headers, ...rows.map(mapper)].map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const ProductWiseSalesReport = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.productWiseSalesReport?.view;
  const [dateFrom, setDateFrom] = useState(toDateInput(lastWeek));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [report, setReport] = useState({ totals: {}, overallProducts: [], holderBreakdown: [] });
  const [loading, setLoading] = useState(false);

  const loadReport = async (override = null) => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = override || { dateFrom, dateTo };
      const res = await api.get('/sales/product-wise-report', { params });
      setReport(res.data || { totals: {}, overallProducts: [], holderBreakdown: [] });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load product wise sales report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const topProducts = useMemo(() => (report.overallProducts || []).slice(0, 6), [report.overallProducts]);

  if (!canView) return <div className="p-6 text-red-700 font-semibold">Access denied.</div>;

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-700 font-bold">Sales</p>
        <h1 className="text-3xl md:text-4xl font-black text-slate-950">Product Wise Sale Report</h1>
        <p className="text-slate-600 mt-2">Includes normal sales, returns, and pay-later records only after payment is received. Gifts and unpaid pay-later records are excluded.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="font-semibold text-sm text-slate-700">
          Date From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full border rounded-lg p-2" />
        </label>
        <label className="font-semibold text-sm text-slate-700">
          Date To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full border rounded-lg p-2" />
        </label>
        <div className="flex items-end">
          <button type="button" onClick={loadReport} className="w-full bg-emerald-700 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-800">
            {loading ? 'Loading...' : 'Update Report'}
          </button>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              loadReport({ dateFrom: '', dateTo: '' });
            }}
            className="w-full border border-slate-300 rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Overall Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Total Items Sold</p>
          <p className="text-3xl font-black">{qty(report.totals?.quantity)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Total Sale After Discounts</p>
          <p className="text-3xl font-black">{money(report.totals?.totalSale)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border shadow-sm">
          <p className="text-sm text-slate-500">Average Sale Price / Item</p>
          <p className="text-3xl font-black">{money(report.totals?.averageSalePrice)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {topProducts.map((row) => (
          <div key={row.productName} className="bg-white rounded-2xl p-4 border shadow-sm border-l-4 border-l-emerald-700">
            <p className="font-black text-lg">{row.productName}</p>
            <p className="text-sm text-slate-500">Items Sold: <span className="font-bold text-slate-900">{qty(row.quantity)}</span></p>
            <p className="text-sm text-slate-500">Total Sale: <span className="font-bold text-slate-900">{money(row.totalSale)}</span></p>
            <p className="text-sm text-slate-500">Average / Item: <span className="font-bold text-slate-900">{money(row.averageSalePrice)}</span></p>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-black">Overall Product Sales</h2>
            <p className="text-sm text-slate-500">Product totals across all accessible sites, warehouses, wholesalers, and online sales.</p>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(
              report.overallProducts || [],
              ['Product', 'Items Sold', 'Total Sale', 'Average Sale Price'],
              (row) => [row.productName, row.quantity, row.totalSale, row.averageSalePrice],
              'product-wise-sales-overall.csv',
            )}
            className="bg-emerald-700 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-800"
          >
            Download CSV
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="border p-2 text-left">Product</th>
                <th className="border p-2 text-right">Items Sold</th>
                <th className="border p-2 text-right">Total Sale</th>
                <th className="border p-2 text-right">Average / Item</th>
              </tr>
            </thead>
            <tbody>
              {(report.overallProducts || []).map((row) => (
                <tr key={row.productName} className="hover:bg-slate-50">
                  <td className="border p-2 font-semibold">{row.productName}</td>
                  <td className="border p-2 text-right">{qty(row.quantity)}</td>
                  <td className="border p-2 text-right">{money(row.totalSale)}</td>
                  <td className="border p-2 text-right">{money(row.averageSalePrice)}</td>
                </tr>
              ))}
              {!(report.overallProducts || []).length && <tr><td colSpan="4" className="border p-4 text-center text-slate-500">No product sales found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-black">Site / Warehouse Wise Product Sales</h2>
            <p className="text-sm text-slate-500">Breakdown by product and sales holder.</p>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(
              report.holderBreakdown || [],
              ['Product', 'Holder Type', 'Holder', 'Items Sold', 'Total Sale', 'Average Sale Price'],
              (row) => [row.productName, row.holderType, row.holderName, row.quantity, row.totalSale, row.averageSalePrice],
              'product-wise-sales-by-holder.csv',
            )}
            className="bg-emerald-700 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-800"
          >
            Download CSV
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="border p-2 text-left">Product</th>
                <th className="border p-2 text-left">Holder Type</th>
                <th className="border p-2 text-left">Site / Warehouse</th>
                <th className="border p-2 text-right">Items Sold</th>
                <th className="border p-2 text-right">Total Sale</th>
                <th className="border p-2 text-right">Average / Item</th>
              </tr>
            </thead>
            <tbody>
              {(report.holderBreakdown || []).map((row) => (
                <tr key={`${row.productName}-${row.holderType}-${row.holderId}`} className="hover:bg-slate-50">
                  <td className="border p-2 font-semibold">{row.productName}</td>
                  <td className="border p-2 capitalize">{row.holderType}</td>
                  <td className="border p-2">{row.holderName}</td>
                  <td className="border p-2 text-right">{qty(row.quantity)}</td>
                  <td className="border p-2 text-right">{money(row.totalSale)}</td>
                  <td className="border p-2 text-right">{money(row.averageSalePrice)}</td>
                </tr>
              ))}
              {!(report.holderBreakdown || []).length && <tr><td colSpan="6" className="border p-4 text-center text-slate-500">No holder-wise sales found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default ProductWiseSalesReport;
