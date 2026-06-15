import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const CompanyCashDeposits = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.companyCashDeposits?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.companyCashDeposits?.manage;
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(todayISO);
  const [search, setSearch] = useState('');
  const [reviewRemarks, setReviewRemarks] = useState({});

  const loadRows = async () => {
    const res = await api.get('/cash-deposits', {
      params: {
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch((err) => toast.error(err?.response?.data?.message || 'Failed to load deposit register.'));
  }, [canView, status, dateFrom, dateTo]);

  const reviewDeposit = async (row, nextStatus) => {
    if (!canManage) return toast.warn('No manage permission.');
    const label = nextStatus === 'accepted' ? 'accept' : 'reject';
    if (!window.confirm(`Are you sure you want to ${label} this deposit?`)) return;
    try {
      await api.put(`/cash-deposits/${row._id}/review`, {
        status: nextStatus,
        reviewRemarks: reviewRemarks[row._id] || '',
      });
      toast.success(`Deposit ${nextStatus}.`);
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to review deposit.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.holderType || '').toLowerCase().includes(q) ||
      String(row.holderName || '').toLowerCase().includes(q) ||
      String(row.paymentMethodName || '').toLowerCase().includes(q) ||
      String(row.status || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q) ||
      String(row.reviewRemarks || '').toLowerCase().includes(q) ||
      String(row.submittedByName || '').toLowerCase().includes(q) ||
      String(row.reviewedByName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const amount = Number(row.amount || 0);
      acc.total += amount;
      acc[row.status] = Number(acc[row.status] || 0) + amount;
      return acc;
    }, { total: 0, pending: 0, accepted: 0, rejected: 0 });
  }, [rows]);

  const downloadCsv = (targetRows, suffix) => {
    const headers = ['Date', 'Holder Type', 'Holder', 'Account', 'Amount', 'Status', 'Remarks', 'Submitted By', 'Reviewed By', 'Reviewed At', 'Review Remarks'];
    const csvRows = targetRows.map((row) => [
      `"${new Date(row.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.holderType || '').replace(/"/g, '""')}"`,
      `"${String(row.holderName || '').replace(/"/g, '""')}"`,
      `"${String(row.paymentMethodName || '').replace(/"/g, '""')}"`,
      `"${Number(row.amount || 0).toFixed(2)}"`,
      `"${String(row.status || '').replace(/"/g, '""')}"`,
      `"${String(row.remarks || '').replace(/"/g, '""')}"`,
      `"${String(row.submittedByName || '').replace(/"/g, '""')}"`,
      `"${String(row.reviewedByName || '').replace(/"/g, '""')}"`,
      `"${row.reviewedAt ? new Date(row.reviewedAt).toLocaleString().replace(/"/g, '""') : ''}"`,
      `"${String(row.reviewRemarks || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `company_cash_deposits_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { name: 'Date', selector: (row) => new Date(row.date).toLocaleString(), sortable: true, wrap: true },
    { name: 'Holder Type', selector: (row) => row.holderType || '-', sortable: true, wrap: true },
    { name: 'Holder', selector: (row) => row.holderName || '-', sortable: true, wrap: true },
    { name: 'Account', selector: (row) => row.paymentMethodName || '-', sortable: true, wrap: true },
    {
      name: 'Amount',
      selector: (row) => Number(row.amount || 0),
      sortable: true,
      right: true,
      cell: (row) => `PKR ${Number(row.amount || 0).toFixed(2)}`,
    },
    {
      name: 'Status',
      selector: (row) => row.status || '',
      sortable: true,
      cell: (row) => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${row.status === 'accepted' ? 'bg-green-100 text-green-800' : row.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
          {row.status}
        </span>
      ),
    },
    { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true, grow: 1.4 },
    { name: 'Submitted By', selector: (row) => row.submittedByName || '-', sortable: true, wrap: true },
    { name: 'Reviewed By', selector: (row) => row.reviewedByName || '-', sortable: true, wrap: true },
    {
      name: 'Actions',
      cell: (row) => row.status === 'pending' && canManage ? (
        <div className="flex flex-col gap-2 min-w-[190px] py-2">
          <input
            value={reviewRemarks[row._id] || ''}
            onChange={(e) => setReviewRemarks((prev) => ({ ...prev, [row._id]: e.target.value }))}
            placeholder="Review remarks"
            className="border rounded px-2 py-1 text-xs"
          />
          <div className="flex gap-2">
            <button onClick={() => reviewDeposit(row, 'accepted')} className="bg-green-700 text-white px-2 py-1 rounded text-xs">Accept</button>
            <button onClick={() => reviewDeposit(row, 'rejected')} className="bg-red-700 text-white px-2 py-1 rounded text-xs">Reject</button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-700">
          <div>{row.reviewRemarks || 'Completed'}</div>
          {row.reviewedAt ? <div>{new Date(row.reviewedAt).toLocaleString()}</div> : null}
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      grow: 1.8,
    },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Company Cash Deposit Register</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-amber-600">
          <div className="text-sm text-gray-500">Pending Verification</div>
          <div className="text-xl font-bold">PKR {Number(totals.pending || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-500">Accepted Deposits</div>
          <div className="text-xl font-bold">PKR {Number(totals.accepted || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-700">
          <div className="text-sm text-gray-500">Rejected Deposits</div>
          <div className="text-xl font-bold">PKR {Number(totals.rejected || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-gray-800">
          <div className="text-sm text-gray-500">Total Posted</div>
          <div className="text-xl font-bold">PKR {Number(totals.total || 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border p-2 rounded">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search holder, account, user, remarks..." className="w-full border p-2 rounded" />
        </div>
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
          noDataComponent="No cash deposit records found."
        />
      </div>
    </div>
  );
};

export default CompanyCashDeposits;
