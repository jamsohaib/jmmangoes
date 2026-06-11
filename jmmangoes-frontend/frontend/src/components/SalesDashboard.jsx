import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const formatCurrency = (value) => `PKR ${Number(value || 0).toLocaleString()}`;
const formatQty = (value) => `${Number(value || 0).toLocaleString()} qty`;

const SalesDashboard = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.salesDashboard?.view;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadSummary = async (params = {}) => {
    setLoading(true);
    try {
      const res = await api.get('/sales/dashboard-summary', { params });
      setData(res.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load sales dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    loadSummary();
  }, [canView]);

  const applyDateFilter = () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.warn('Date From cannot be later than Date To.');
      return;
    }
    loadSummary({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
  };

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    loadSummary();
  };

  const siteCards = useMemo(() => data?.siteCards || [], [data]);
  const totals = data?.totals || {
    overall: { salesAmount: 0, expenseAmount: 0, netProfit: 0, quantity: 0 },
    daily: { salesAmount: 0, expenseAmount: 0, netProfit: 0, quantity: 0 },
    range: { salesAmount: 0, expenseAmount: 0, netProfit: 0, quantity: 0 },
    pendingReceivables: { amount: 0, quantity: 0 },
    gifting: { quantity: 0, value: 0, bySource: [] },
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Sales Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Overall Sales</div>
          <div className="text-xl font-bold">{formatCurrency(totals.overall.salesAmount)}</div>
          <div className="text-sm text-gray-700">{formatQty(totals.overall.quantity)}</div>
          <Link to="/sale-point" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Overall Expenses</div>
          <div className="text-xl font-bold">{formatCurrency(totals.overall.expenseAmount)}</div>
          <div className="text-sm text-gray-700">All sites combined</div>
          <Link to="/add-expenses" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Overall Net Profit</div>
          <div className={`text-xl font-bold ${Number(totals.overall.netProfit || 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(totals.overall.netProfit)}
          </div>
          <div className="text-sm text-gray-700">Sales - Expenses</div>
          <Link to="/order-management" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-500">Accepted Company Deposits</div>
          <div className="text-xl font-bold">{formatCurrency(totals.overall.acceptedDepositAmount)}</div>
          <div className="text-sm text-gray-700">Verified deposits back to company</div>
          <Link to="/company-cash-deposits" className="text-blue-700 text-sm hover:underline">Show Register</Link>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-amber-600">
          <div className="text-sm text-gray-500">Deposits Pending Verification</div>
          <div className="text-xl font-bold text-amber-700">{formatCurrency(totals.overall.pendingDepositAmount)}</div>
          <div className="text-sm text-gray-700">Excluded from cash in hand</div>
          <Link to="/company-cash-deposits" className="text-blue-700 text-sm hover:underline">Show Register</Link>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-gray-900">
          <div className="text-sm text-gray-500">Net Cash Available With Holders</div>
          <div className={`text-xl font-bold ${Number(totals.overall.cashAvailable || 0) < 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {formatCurrency(totals.overall.cashAvailable)}
          </div>
          <div className="text-sm text-gray-700">Sales - expenses - deposits</div>
          <Link to="/add-expenses" className="text-blue-700 text-sm hover:underline">Post Deposit</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Daily Sales (Today)</div>
          <div className="text-xl font-bold">{formatCurrency(totals.daily.salesAmount)}</div>
          <div className="text-sm text-gray-700">{formatQty(totals.daily.quantity)}</div>
          <Link to="/sale-point" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Daily Expenses (Today)</div>
          <div className="text-xl font-bold">{formatCurrency(totals.daily.expenseAmount)}</div>
          <div className="text-sm text-gray-700">All sites combined</div>
          <Link to="/add-expenses" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-500">Daily Net Profit (Today)</div>
          <div className={`text-xl font-bold ${Number(totals.daily.netProfit || 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(totals.daily.netProfit)}
          </div>
          <div className="text-sm text-gray-700">Sales - Expenses</div>
          <Link to="/order-management" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-amber-600">
          <div className="text-sm text-gray-500">Pending Payment To Receive</div>
          <div className="text-xl font-bold text-amber-700">{formatCurrency(totals.pendingReceivables?.amount)}</div>
          <div className="text-sm text-gray-700">{formatQty(totals.pendingReceivables?.quantity)}</div>
          <Link to="/pay-later-records" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-500">Total Gifting</div>
          <div className="text-xl font-bold text-green-700">{formatQty(totals.gifting?.quantity)}</div>
          <div className="text-sm text-gray-700">Approx value: {formatCurrency(totals.gifting?.value)}</div>
          <Link to="/gifting-records" className="text-blue-700 text-sm hover:underline">Show Details</Link>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-500">Gifting By Source</div>
          {(totals.gifting?.bySource || []).slice(0, 3).map((row) => (
            <div key={row.sourceName} className="text-sm text-gray-800">{row.sourceName}: {formatQty(row.quantity)}</div>
          ))}
          {!(totals.gifting?.bySource || []).length && <div className="text-sm text-gray-700">No gifts recorded</div>}
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Date Range Filter</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-sm font-medium">From</label>
            <input type="date" className="border rounded p-2 w-full" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">To</label>
            <input type="date" className="border rounded p-2 w-full" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button type="button" className="bg-green-600 text-white rounded px-4 py-2" onClick={applyDateFilter} disabled={loading}>
            {loading ? 'Loading...' : 'Apply Range'}
          </button>
          <button type="button" className="border border-gray-400 rounded px-4 py-2" onClick={clearDateFilter}>
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {siteCards.map((card) => (
          <div key={`${card.holderType || 'site'}-${card.siteId || card.siteName}`} className="bg-white rounded shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold capitalize">{card.siteName}</h3>
            <div className="mt-2 text-sm">
              <div><span className="font-semibold">Overall Sales:</span> {formatCurrency(card.overall.salesAmount)}</div>
              <div><span className="font-semibold">Overall Expense:</span> {formatCurrency(card.overall.expenseAmount)}</div>
              <div><span className="font-semibold">Accepted Deposits:</span> {formatCurrency(card.overall.acceptedDepositAmount)}</div>
              <div><span className="font-semibold">Pending Deposits:</span> {formatCurrency(card.overall.pendingDepositAmount)}</div>
              <div><span className="font-semibold">Cash In Hand:</span> {formatCurrency(card.overall.cashAvailable)}</div>
              <div className={Number(card.overall.netProfit || 0) < 0 ? 'text-red-700' : 'text-green-700'}>
                <span className="font-semibold">Overall Net:</span> {formatCurrency(card.overall.netProfit)}
              </div>
              <div><span className="font-semibold">Overall Qty:</span> {formatQty(card.overall.quantity)}</div>
            </div>
            <hr className="my-2" />
            <div className="text-sm">
              <div><span className="font-semibold">Daily Sales:</span> {formatCurrency(card.daily.salesAmount)}</div>
              <div><span className="font-semibold">Daily Expense:</span> {formatCurrency(card.daily.expenseAmount)}</div>
              <div><span className="font-semibold">Daily Deposits:</span> {formatCurrency(card.daily.acceptedDepositAmount)}</div>
              <div><span className="font-semibold">Daily Pending:</span> {formatCurrency(card.daily.pendingDepositAmount)}</div>
              <div className={Number(card.daily.netProfit || 0) < 0 ? 'text-red-700' : 'text-green-700'}>
                <span className="font-semibold">Daily Net:</span> {formatCurrency(card.daily.netProfit)}
              </div>
              <div><span className="font-semibold">Daily Qty:</span> {formatQty(card.daily.quantity)}</div>
            </div>
            <hr className="my-2" />
            <div className="text-sm">
              <div><span className="font-semibold">Range Sales:</span> {formatCurrency(card.range.salesAmount)}</div>
              <div><span className="font-semibold">Range Expense:</span> {formatCurrency(card.range.expenseAmount)}</div>
              <div><span className="font-semibold">Range Deposits:</span> {formatCurrency(card.range.acceptedDepositAmount)}</div>
              <div><span className="font-semibold">Range Pending:</span> {formatCurrency(card.range.pendingDepositAmount)}</div>
              <div className={Number(card.range.netProfit || 0) < 0 ? 'text-red-700' : 'text-green-700'}>
                <span className="font-semibold">Range Net:</span> {formatCurrency(card.range.netProfit)}
              </div>
              <div><span className="font-semibold">Range Qty:</span> {formatQty(card.range.quantity)}</div>
            </div>
            <div className="mt-3 flex gap-3">
              <Link to="/sale-point" className="text-blue-700 text-sm hover:underline">Show Sales Details</Link>
              <Link to="/add-expenses" className="text-blue-700 text-sm hover:underline">Show Expense Details</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesDashboard;
