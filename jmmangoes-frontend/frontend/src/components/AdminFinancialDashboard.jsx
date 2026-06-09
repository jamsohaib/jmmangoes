import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const money = (v) => `PKR ${Number(v || 0).toFixed(2)}`;
const dateLabel = (v) => (v ? new Date(v).toLocaleDateString() : '-');
const kg = (v) => `${Number(v || 0).toFixed(2)} kg`;

const AdminFinancialDashboard = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.adminFinancialDashboard?.view;
  const [years, setYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [yearlyRows, setYearlyRows] = useState([]);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    const res = await api.get('/admin/financial-dashboard', { params: { financialYearId } });
    setYears(res.data?.years || []);
    setSelectedYear(res.data?.selectedYear || null);
    setSelectedSummary(res.data?.selectedSummary || null);
    setYearlyRows(res.data?.yearlyRows || []);
    if (!financialYearId && res.data?.selectedYear?._id) setFinancialYearId(res.data.selectedYear._id);
  };

  useEffect(() => {
    if (canView) loadData().catch(() => toast.error('Failed to load admin financial dashboard.'));
  }, [canView, financialYearId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return yearlyRows;
    return yearlyRows.filter((row) => String(row.financialYear?.name || '').toLowerCase().includes(q));
  }, [yearlyRows, search]);

  const Card = ({ title, value, tone = 'green' }) => {
    const border = tone === 'red' ? 'border-red-600' : tone === 'blue' ? 'border-blue-700' : 'border-green-700';
    const text = tone === 'red' ? 'text-red-700' : tone === 'blue' ? 'text-blue-700' : 'text-green-700';
    return (
      <div className={`bg-white rounded shadow p-4 border-l-4 ${border}`}>
        <div className="text-sm text-gray-600">{title}</div>
        <div className={`text-2xl font-bold ${text}`}>{value}</div>
      </div>
    );
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Admin Financial Dashboard</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <label className="block text-sm font-medium mb-1">Financial Year</label>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded w-full md:w-96">
          <option value="">Select financial year</option>
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
        </select>
        {selectedYear ? <p className="text-sm text-gray-600 mt-2">{dateLabel(selectedYear.startDate)} to {dateLabel(selectedYear.endDate)}</p> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card title="Total Revenue Collected" value={money(selectedSummary?.revenue)} tone="green" />
        <Card title="Sales Side Expenses" value={money(selectedSummary?.salesExpenses)} tone="red" />
        <Card title="Farm Expenses" value={money(selectedSummary?.farmExpenses)} tone="red" />
        <Card title="Farm HR Expenses" value={money(selectedSummary?.farmHrExpenses)} tone="red" />
        <Card title="Total Expenses" value={money(selectedSummary?.totalExpenses)} tone="red" />
        <Card title="Net Financial Result" value={money(selectedSummary?.net)} tone={Number(selectedSummary?.net || 0) < 0 ? 'red' : 'blue'} />
        <Card title="Total Quantity Sold" value={`${Number(selectedSummary?.quantity || 0)} qty`} tone="blue" />
        <Card title="Farm Production Logged" value={kg(selectedSummary?.farmProductionKg)} tone="blue" />
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="font-semibold mb-2">Key Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded p-3"><span className="font-semibold">Sale Point Revenue:</span> {money(selectedSummary?.salePointRevenue)}</div>
          <div className="border rounded p-3"><span className="font-semibold">Online Revenue:</span> {money(selectedSummary?.onlineRevenue)}</div>
          <div className="border rounded p-3"><span className="font-semibold">Tree Production Logged:</span> {kg(selectedSummary?.treeProductionKg)}</div>
          <div className="border rounded p-3"><span className="font-semibold">Block Production Logged:</span> {kg(selectedSummary?.blockProductionKg)}</div>
          <div className="border rounded p-3 md:col-span-2">
            <span className="font-semibold">Tree Production Grades:</span>{' '}
            A: {kg(selectedSummary?.productionGrades?.gradeA)}, B: {kg(selectedSummary?.productionGrades?.gradeB)}, C: {kg(selectedSummary?.productionGrades?.gradeC)}, D: {kg(selectedSummary?.productionGrades?.gradeD)}
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-3">
          Farm funds given are intentionally not counted as revenue because they are treated as previous years savings or capital support.
        </p>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="font-semibold mb-3">Financial Year Wise Summary</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search financial years..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { name: 'Financial Year', selector: (row) => row.financialYear?.name || '-', sortable: true, wrap: true },
            { name: 'Start', selector: (row) => dateLabel(row.financialYear?.startDate), sortable: true, wrap: true },
            { name: 'End', selector: (row) => dateLabel(row.financialYear?.endDate), sortable: true, wrap: true },
            { name: 'Revenue', selector: (row) => Number(row.summary?.revenue || 0), sortable: true, cell: (row) => money(row.summary?.revenue) },
            { name: 'Sales Expenses', selector: (row) => Number(row.summary?.salesExpenses || 0), sortable: true, cell: (row) => money(row.summary?.salesExpenses) },
            { name: 'Farm Expenses', selector: (row) => Number(row.summary?.farmExpenses || 0), sortable: true, cell: (row) => money(row.summary?.farmExpenses) },
            { name: 'Production Kg', selector: (row) => Number(row.summary?.farmProductionKg || 0), sortable: true, cell: (row) => kg(row.summary?.farmProductionKg) },
            { name: 'Net', selector: (row) => Number(row.summary?.net || 0), sortable: true, cell: (row) => money(row.summary?.net) },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No financial year summary available."
        />
      </div>
    </div>
  );
};

export default AdminFinancialDashboard;
