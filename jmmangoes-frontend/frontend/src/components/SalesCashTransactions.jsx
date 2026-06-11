import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);
const lastWeekStartISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
})();

const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;

const SalesCashTransactions = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.salesCashTransactions?.view;
  const [rows, setRows] = useState([]);
  const [dateFrom, setDateFrom] = useState(lastWeekStartISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/sales/cash-transactions', {
      params: { dateFrom, dateTo, type: type || undefined, limit: 5000 },
    });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch((err) => toast.error(err?.response?.data?.message || 'Failed to load cash transactions.'));
  }, [canView, dateFrom, dateTo, type]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.transactionType || '').toLowerCase().includes(q) ||
      String(row.holderType || '').toLowerCase().includes(q) ||
      String(row.holderName || '').toLowerCase().includes(q) ||
      String(row.description || '').toLowerCase().includes(q) ||
      String(row.status || '').toLowerCase().includes(q) ||
      String(row.enteredByName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => filteredRows.reduce((acc, row) => {
    const amount = Number(row.amount || 0);
    if (amount >= 0) acc.inflow += amount;
    else acc.outflow += Math.abs(amount);
    acc.net += amount;
    return acc;
  }, { inflow: 0, outflow: 0, net: 0 }), [filteredRows]);

  const downloadCsv = (targetRows, suffix) => {
    const headers = ['Date', 'Type', 'Holder Type', 'Holder', 'Description', 'Amount', 'Status', 'Entered By', 'Remarks'];
    const csvRows = targetRows.map((row) => [
      `"${new Date(row.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.transactionType || '').replace(/"/g, '""')}"`,
      `"${String(row.holderType || '').replace(/"/g, '""')}"`,
      `"${String(row.holderName || '').replace(/"/g, '""')}"`,
      `"${String(row.description || '').replace(/"/g, '""')}"`,
      `"${Number(row.amount || 0).toFixed(2)}"`,
      `"${String(row.status || '').replace(/"/g, '""')}"`,
      `"${String(row.enteredByName || '-').replace(/"/g, '""')}"`,
      `"${String(row.remarks || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sales_cash_transactions_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { name: 'Date', selector: (row) => new Date(row.date).toLocaleString(), sortable: true, wrap: true },
    { name: 'Type', selector: (row) => String(row.transactionType || '').replaceAll('_', ' '), sortable: true, wrap: true },
    { name: 'Holder Type', selector: (row) => row.holderType || '-', sortable: true, wrap: true },
    { name: 'Holder', selector: (row) => row.holderName || '-', sortable: true, wrap: true },
    { name: 'Description', selector: (row) => row.description || '-', sortable: true, wrap: true, grow: 1.5 },
    {
      name: 'Amount',
      selector: (row) => Number(row.amount || 0),
      sortable: true,
      right: true,
      cell: (row) => <span className={Number(row.amount || 0) < 0 ? 'text-red-700' : 'text-green-700'}>{money(row.amount)}</span>,
    },
    { name: 'Status', selector: (row) => row.status || '-', sortable: true, wrap: true },
    { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
    { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true, grow: 1.5 },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Cash Transactions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-500">Cash Inflow</div>
          <div className="text-xl font-bold text-green-700">{money(totals.inflow)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-700">
          <div className="text-sm text-gray-500">Cash Outflow</div>
          <div className="text-xl font-bold text-red-700">{money(totals.outflow)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-500">Net</div>
          <div className={`text-xl font-bold ${Number(totals.net || 0) < 0 ? 'text-red-700' : 'text-blue-700'}`}>{money(totals.net)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="border p-2 rounded">
          <option value="">All Types</option>
          <option value="sale">Sales / Returns</option>
          <option value="expense">Expenses</option>
          <option value="deposit">Company Deposits</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cash transactions..." className="border p-2 rounded md:col-span-2" />
      </div>

      <div className="bg-white rounded shadow">
        <DataTable
          columns={columns}
          data={filteredRows}
          pagination
          highlightOnHover
          striped
          subHeader
          subHeaderComponent={(
            <div className="w-full flex justify-end gap-2">
              <button onClick={() => downloadCsv(filteredRows, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
              <button onClick={() => downloadCsv(rows, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
            </div>
          )}
          noDataComponent="No cash transactions found."
        />
      </div>
    </div>
  );
};

export default SalesCashTransactions;
