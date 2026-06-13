import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;

const FarmUsherReport = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmUsherReport?.view;
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
    const res = await api.get('/farm/usher/report', { params: { financialYearId } });
    setReport(res.data || null);
  };

  useEffect(() => {
    if (canView) loadYears().catch(() => toast.error('Failed to load financial years.'));
  }, [canView]);

  useEffect(() => {
    if (canView && financialYearId) loadReport().catch(() => toast.error('Failed to load Usher report.'));
  }, [canView, financialYearId]);

  const rows = report?.rows || [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.personName || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q) ||
      String(row.isRelative ? 'relative' : 'non-relative').includes(q)
    );
  }, [rows, search]);
  const totals = report?.summary?.totals || {};

  const downloadCsv = () => {
    if (!rows.length) return toast.warn('No report rows to download.');
    const header = ['Beneficiary', 'Contact', 'Relative', 'Entries', 'Amount Paid'];
    const lines = rows.map((row) => [row.personName, row.contactNumber || '', row.isRelative ? 'Yes' : 'No', row.count, row.amount]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `usher_report_${report?.financialYear?.name || 'year'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadPdf = () => {
    const yearName = report?.financialYear?.name || 'Selected Financial Year';
    const tableRows = rows.map((row) => `
      <tr>
        <td>${row.personName || '-'}</td>
        <td>${row.contactNumber || '-'}</td>
        <td>${row.isRelative ? 'Yes' : 'No'}</td>
        <td>${row.count || 0}</td>
        <td>${money(row.amount)}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Usher Report ${yearName}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #4b5563; margin-bottom: 20px; }
            .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { border: 1px solid #d1d5db; padding: 10px; border-radius: 8px; }
            .label { font-size: 12px; color: #4b5563; }
            .value { font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
            tfoot td { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>JM Mangoes Usher Report</h1>
          <div class="muted">Financial Year: ${yearName}</div>
          <div class="cards">
            <div class="card"><div class="label">Total Yield Value</div><div class="value">${money(totals.totalYieldValue)}</div></div>
            <div class="card"><div class="label">Usher Due</div><div class="value">${money(totals.totalPayableUsher)}</div></div>
            <div class="card"><div class="label">Usher Paid</div><div class="value">${money(totals.usherPaid)}</div></div>
            <div class="card"><div class="label">Usher Remaining</div><div class="value">${money(totals.usherRemaining)}</div></div>
          </div>
          <table>
            <thead><tr><th>Beneficiary</th><th>Contact</th><th>Relative</th><th>Entries</th><th>Amount Paid</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="5">No entries found.</td></tr>'}</tbody>
            <tfoot><tr><td colspan="4">Total Usher Paid</td><td>${money(report?.totalPaid)}</td></tr></tfoot>
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
      <h2 className="text-2xl font-bold mb-4">Usher Report</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <label className="block text-sm font-medium mb-1">Financial Year</label>
        <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded w-full md:w-96">
          <option value="">Select financial year</option>
          {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700"><div className="text-sm text-gray-600">Total Yield Value</div><div className="text-xl font-bold">{money(totals.totalYieldValue)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-700"><div className="text-sm text-gray-600">Usher Due</div><div className="text-xl font-bold">{money(totals.totalPayableUsher)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700"><div className="text-sm text-gray-600">Usher Paid</div><div className="text-xl font-bold">{money(totals.usherPaid)}</div></div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-orange-700"><div className="text-sm text-gray-600">Usher Remaining</div><div className="text-xl font-bold">{money(totals.usherRemaining)}</div></div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search report..." className="border p-2 rounded w-full md:w-80" />
          <div className="flex gap-2">
            <button onClick={downloadCsv} className="bg-blue-700 text-white px-3 py-2 rounded">Download CSV</button>
            <button onClick={downloadPdf} className="bg-red-700 text-white px-3 py-2 rounded">Download PDF</button>
          </div>
        </div>
        <DataTable
          columns={[
            { name: 'Beneficiary', selector: (row) => row.personName || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', sortable: true, wrap: true },
            { name: 'Relative', selector: (row) => row.isRelative ? 'Yes' : 'No', sortable: true },
            { name: 'Entries', selector: (row) => Number(row.count || 0), sortable: true },
            { name: 'Amount Paid', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => money(row.amount) },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No Usher report entries found."
        />
        <div className="mt-4 text-right font-bold">Total Usher Paid: {money(report?.totalPaid)}</div>
      </div>
    </div>
  );
};

export default FarmUsherReport;
