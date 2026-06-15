import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;

const OwnerShareReport = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.ownerShareReport?.view;
  const [years, setYears] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState('');

  const loadYears = async () => {
    const res = await api.get('/financial-years');
    const rows = res.data || [];
    setYears(rows);
    if (!financialYearId) {
      const current = rows.find((row) => row.isCurrent) || rows[0];
      if (current?._id) setFinancialYearId(current._id);
    }
  };

  const loadReport = async () => {
    if (!financialYearId) return;
    const res = await api.get('/owners/share-report', { params: { financialYearId } });
    setReport(res.data || null);
  };

  useEffect(() => {
    if (canView) loadYears().catch(() => toast.error('Failed to load financial years.'));
  }, [canView]);

  useEffect(() => {
    if (canView && financialYearId) loadReport().catch(() => toast.error('Failed to load owner share report.'));
  }, [canView, financialYearId]);

  const rows = report?.rows || [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q) ||
      String(row.email || '').toLowerCase().includes(q)
    );
  }, [rows, search]);
  const summary = report?.summary || {};

  const downloadCsv = () => {
    if (!rows.length) return toast.warn('No owner share rows to download.');
    const header = ['Owner', 'Contact', 'Email', 'Share %', 'Owner Share From Net', 'Remaining Usher Due Share'];
    const lines = rows.map((row) => [
      row.name || '',
      row.contactNumber || '',
      row.email || '',
      Number(row.sharePercentage || 0).toFixed(2),
      Number(row.ownerNetShare || 0).toFixed(2),
      Number(row.remainingUsherDueShare || 0).toFixed(2),
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `owner_share_report_${report?.financialYear?.name || 'year'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadPdf = () => {
    const yearName = report?.financialYear?.name || 'Selected Financial Year';
    const tableRows = rows.map((row) => `
      <tr>
        <td>${row.name || '-'}</td>
        <td>${row.contactNumber || '-'}</td>
        <td>${row.email || '-'}</td>
        <td>${Number(row.sharePercentage || 0).toFixed(2)}%</td>
        <td>${money(row.ownerNetShare)}</td>
        <td>${money(row.remainingUsherDueShare)}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Owner Share Report ${yearName}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #4b5563; margin-bottom: 20px; }
            .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { border: 1px solid #d1d5db; padding: 10px; border-radius: 8px; }
            .label { font-size: 12px; color: #4b5563; }
            .value { font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
            tfoot td { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>JM Mangoes Owner Share Report</h1>
          <div class="muted">Financial Year: ${yearName}</div>
          <div class="cards">
            <div class="card"><div class="label">Total Revenue</div><div class="value">${money(summary.revenue)}</div></div>
            <div class="card"><div class="label">Total Expense</div><div class="value">${money(summary.totalExpenses)}</div></div>
            <div class="card"><div class="label">Usher Paid</div><div class="value">${money(summary.usher?.paid)}</div></div>
            <div class="card"><div class="label">Owners Share From Net</div><div class="value">${money(summary.net)}</div></div>
            <div class="card"><div class="label">Remaining Usher Due</div><div class="value">${money(summary.usher?.remaining)}</div></div>
            <div class="card"><div class="label">Total Owner Share %</div><div class="value">${Number(report?.totalSharePercentage || 0).toFixed(2)}%</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Share %</th>
                <th>Owner Share From Net</th>
                <th>Remaining Usher Due Share</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="6">No owner share rows found.</td></tr>'}</tbody>
            <tfoot>
              <tr>
                <td colspan="3">Totals</td>
                <td>${Number(report?.totalSharePercentage || 0).toFixed(2)}%</td>
                <td>${money(report?.totalOwnerNetShare)}</td>
                <td>${money(report?.totalRemainingUsherDueShare)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('Popup blocked. Please allow popups to print PDF.');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Owner Share Report</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <label className="block text-sm font-medium mb-1">Financial Year</label>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded w-full md:w-96">
          <option value="">Select financial year</option>
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700"><div className="text-sm text-gray-600">Total Revenue</div><div className="text-xl font-bold">{money(summary.revenue)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-700"><div className="text-sm text-gray-600">Total Expense</div><div className="text-xl font-bold">{money(summary.totalExpenses)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700"><div className="text-sm text-gray-600">Usher Paid</div><div className="text-xl font-bold">{money(summary.usher?.paid)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700"><div className="text-sm text-gray-600">Owners Share From Net</div><div className="text-xl font-bold">{money(summary.net)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-orange-700"><div className="text-sm text-gray-600">Remaining Usher Due</div><div className="text-xl font-bold">{money(summary.usher?.remaining)}</div></div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border rounded p-3"><span className="font-semibold">Total Owner Share %:</span> {Number(report?.totalSharePercentage || 0).toFixed(2)}%</div>
          <div className="border rounded p-3"><span className="font-semibold">Total Owner Net Share:</span> {money(report?.totalOwnerNetShare)}</div>
          <div className="border rounded p-3"><span className="font-semibold">Total Owner Usher Due Share:</span> {money(report?.totalRemainingUsherDueShare)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Owner Wise Share</h3>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owners..." className="border p-2 rounded w-full md:w-80" />
          <div className="flex gap-2">
            <button onClick={downloadCsv} className="bg-blue-700 text-white px-3 py-2 rounded">Download CSV</button>
            <button onClick={downloadPdf} className="bg-red-700 text-white px-3 py-2 rounded">Download PDF</button>
          </div>
        </div>
        <DataTable
          columns={[
            { name: 'Owner', selector: (row) => row.name || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', sortable: true, wrap: true },
            { name: 'Email', selector: (row) => row.email || '-', sortable: true, wrap: true },
            { name: 'Share %', selector: (row) => Number(row.sharePercentage || 0), sortable: true, cell: (row) => `${Number(row.sharePercentage || 0).toFixed(2)}%` },
            { name: 'Owner Share From Net', selector: (row) => Number(row.ownerNetShare || 0), sortable: true, cell: (row) => money(row.ownerNetShare) },
            { name: 'Remaining Usher Due Share', selector: (row) => Number(row.remainingUsherDueShare || 0), sortable: true, cell: (row) => money(row.remainingUsherDueShare) },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No owner share rows found."
        />
      </div>
    </div>
  );
};

export default OwnerShareReport;
