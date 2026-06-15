import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const formatCurrency = (value) => `PKR ${Number(value || 0).toFixed(2)}`;
const dateLabel = (value) => (value ? new Date(value).toLocaleDateString() : '-');

const FarmExpenseDashboard = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmExpenseDashboard?.view;
  const [years, setYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [summary, setSummary] = useState({ overall: {}, range: {}, byHead: [] });
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    const [yearsRes, summaryRes] = await Promise.all([
      api.get('/financial-years'),
      api.get('/farm/expense-dashboard', { params: { financialYearId } }),
    ]);
    const yearRows = yearsRes.data || [];
    const fy = summaryRes.data?.financialYear || null;
    setYears(yearRows);
    setSummary(summaryRes.data || { overall: {}, range: {}, byHead: [] });
    if (!financialYearId && fy?._id) setFinancialYearId(fy._id);
    const start = fy?.startDate ? new Date(fy.startDate).toISOString().slice(0, 10) : '';
    const end = fy?.endDate ? new Date(fy.endDate).toISOString().slice(0, 10) : '';
    if (start || end) {
      const entriesRes = await api.get('/farm/expense-entries', { params: { dateFrom: start, dateTo: end } });
      setEntries(entriesRes.data || []);
    } else {
      setEntries([]);
    }
  };

  useEffect(() => {
    if (canView) loadData().catch(() => toast.error('Failed to load farm expense dashboard.'));
  }, [canView, financialYearId]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) =>
      String(row.entryType || '').toLowerCase().includes(q) ||
      String(row.headName || '').toLowerCase().includes(q) ||
      String(row.itemName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q) ||
      String(row.enteredByName || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const downloadCsv = (rows, suffix) => {
    if (!rows.length) return toast.warn('No rows to download.');
    const header = ['Date', 'Type', 'Head', 'Details', 'Amount', 'Remarks', 'Entered By'];
    const lines = rows.map((row) => [
      row.date ? new Date(row.date).toLocaleString() : '',
      row.entryType || '',
      row.headName || '',
      row.itemName || '',
      row.amount ?? 0,
      row.remarks || '',
      row.enteredByName || '',
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `farm_expense_dashboard_${summary.financialYear?.name || 'selected'}_${suffix}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const SummaryCard = ({ title, funds, expenses, net }) => (
    <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <div><span className="font-semibold">Funds Given:</span> {formatCurrency(funds)}</div>
      <div><span className="font-semibold">Expenses Made:</span> {formatCurrency(expenses)}</div>
      <div className={Number(net || 0) < 0 ? 'font-bold text-red-700' : 'font-bold text-green-700'}>
        Net Available: {formatCurrency(net)}
      </div>
      <Link to="/farm-add-expenses" className="text-blue-700 text-sm hover:underline">Show Details</Link>
    </div>
  );

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm Expense Dashboard</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="font-semibold mb-3">Financial Year</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded">
            <option value="">Current Financial Year</option>
            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
          </select>
          <div className="border rounded p-2 text-sm text-gray-700">
            {summary.financialYear ? `${dateLabel(summary.financialYear.startDate)} to ${dateLabel(summary.financialYear.endDate)}` : 'No financial year selected'}
          </div>
          <Link to="/farm-add-expenses" className="bg-green-700 text-white px-4 py-2 rounded text-center">Add Fund / Expense</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SummaryCard title="Overall Farm Funds" funds={summary.overall?.funds} expenses={summary.overall?.expenses} net={summary.overall?.netAvailable} />
        <SummaryCard title={summary.financialYear ? `${summary.financialYear.name} Summary` : 'Selected Financial Year'} funds={summary.range?.funds} expenses={summary.range?.expenses} net={summary.range?.netAvailable} />
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="font-semibold mb-3">Expense Breakdown By Head</h3>
        <DataTable
          columns={[
            { name: 'Expense Head', selector: (row) => row.headName || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => formatCurrency(row.amount) },
          ]}
          data={summary.byHead || []}
          pagination
          dense
          highlightOnHover
          noDataComponent="No farm expense breakdown found for selected range."
        />
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="font-semibold mb-3">Range Transactions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions..." className="border p-2 rounded" />
          <button onClick={() => downloadCsv(filteredEntries, 'visible')} className="bg-blue-700 text-white px-3 py-2 rounded text-sm">Download Visible</button>
          <button onClick={() => downloadCsv(entries, 'all')} className="bg-gray-700 text-white px-3 py-2 rounded text-sm">Download All</button>
        </div>
        <DataTable
          columns={[
            { name: 'Date', selector: (row) => row.date ? new Date(row.date).toLocaleString() : '-', sortable: true, wrap: true },
            { name: 'Type', selector: (row) => row.entryType || '', sortable: true, cell: (row) => <span className="capitalize">{row.entryType}</span> },
            { name: 'Head', selector: (row) => row.headName || '-', sortable: true, wrap: true },
            { name: 'Details', selector: (row) => row.itemName || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => formatCurrency(row.amount) },
            { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true },
            { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
          ]}
          data={filteredEntries}
          pagination
          dense
          highlightOnHover
          noDataComponent="No farm transactions found for selected range."
        />
      </div>
    </div>
  );
};

export default FarmExpenseDashboard;
