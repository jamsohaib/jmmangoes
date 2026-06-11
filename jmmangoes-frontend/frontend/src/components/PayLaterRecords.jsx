import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);
const money = (v) => `PKR ${Number(v || 0).toFixed(2)}`;

const PayLaterRecords = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.payLaterRecords?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.payLaterRecords?.manage;
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [editAmounts, setEditAmounts] = useState({});

  const loadSites = async () => {
    const res = await api.get('/sales/gift-sites');
    const list = res.data || [];
    setSites(list);
    if (!siteId && list.length === 1) setSiteId(list[0]._id);
  };

  const loadRows = async () => {
    const params = { dateFrom, dateTo };
    if (siteId) params.siteId = siteId;
    const res = await api.get('/sales/pay-later', { params });
    const list = res.data || [];
    setRows(list);
    setEditAmounts(Object.fromEntries(list.map((r) => [r._id, Number(r.receivableAmount || 0)])));
  };

  useEffect(() => {
    if (canView) loadSites().catch(() => toast.error('Failed to load stores.'));
  }, [canView]);

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load pay later records.'));
  }, [canView, siteId, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.customerName || '').toLowerCase().includes(q) ||
      String(row.customerWhatsapp || '').toLowerCase().includes(q) ||
      String(row.productName || '').toLowerCase().includes(q) ||
      String(row.siteName || '').toLowerCase().includes(q) ||
      String(row.createdByName || '').toLowerCase().includes(q) ||
      String(row.paymentReceivedByName || '').toLowerCase().includes(q) ||
      String(row.paymentStatus || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pendingAmount = useMemo(() => rows
    .filter((r) => r.paymentStatus !== 'paid')
    .reduce((sum, r) => sum + Number(r.receivableAmount || 0), 0), [rows]);
  const paidAmount = useMemo(() => rows
    .filter((r) => r.paymentStatus === 'paid')
    .reduce((sum, r) => sum + Number(r.netAmount || r.receivableAmount || 0), 0), [rows]);

  const saveAmount = async (row) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/sales/pay-later/${row._id}/amount`, { receivableAmount: Number(editAmounts[row._id] || 0) });
      toast.success('Receivable amount updated.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update receivable amount.');
    }
  };

  const markPaid = async (row) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm(`Mark payment received for ${row.customerName || 'customer'}?\nAmount: ${money(row.receivableAmount)}`)) return;
    try {
      await api.put(`/sales/pay-later/${row._id}/paid`);
      toast.success('Payment marked as received.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark as paid.');
    }
  };

  const downloadCsv = (sourceRows = filteredRows, suffix = 'visible') => {
    const headers = ['Date & Time', 'Store', 'Name', 'Contact', 'Product', 'Quantity', 'Receivable', 'Payment Status', 'Created By', 'Paid At', 'Paid By'];
    const csvRows = sourceRows.map((row) => [
      `"${new Date(row.createdAt || row.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.siteName || '-').replace(/"/g, '""')}"`,
      `"${String(row.customerName || '-').replace(/"/g, '""')}"`,
      `"${String(row.customerWhatsapp || '-').replace(/"/g, '""')}"`,
      `"${String(row.productName || '-').replace(/"/g, '""')}"`,
      `"${Number(row.quantity || 0)}"`,
      `"${Number(row.receivableAmount || 0).toFixed(2)}"`,
      `"${String(row.paymentStatus || '-').replace(/"/g, '""')}"`,
      `"${String(row.createdByName || '-').replace(/"/g, '""')}"`,
      `"${row.paymentReceivedAt ? new Date(row.paymentReceivedAt).toLocaleString().replace(/"/g, '""') : '-'}"`,
      `"${String(row.paymentReceivedByName || '-').replace(/"/g, '""')}"`,
    ].join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pay_later_records_${dateFrom || 'from'}_${dateTo || 'to'}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Pay Later Records</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white rounded shadow p-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Store</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="border p-2 rounded w-full">
            <option value="">All accessible stores</option>
            {sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded w-full" />
        </div>
        <div className="flex items-end">
          <button onClick={loadRows} className="bg-blue-600 text-white px-4 py-2 rounded w-full">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-amber-600">
          <div className="text-sm text-gray-600">Pending Payment To Receive</div>
          <div className="text-2xl font-bold text-amber-700">{money(pendingAmount)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-600">Received Pay Later Payments</div>
          <div className="text-2xl font-bold text-green-700">{money(paidAmount)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <DataTable
          title={`Pay Later Records (${dateFrom} to ${dateTo})`}
          columns={[
            { name: 'Date', selector: (row) => new Date(row.createdAt || row.date).toLocaleString(), sortable: true, wrap: true },
            { name: 'Store', selector: (row) => row.siteName || '-', sortable: true, wrap: true },
            { name: 'Name', selector: (row) => row.customerName || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.customerWhatsapp || '-', sortable: true, wrap: true },
            { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
            { name: 'Qty', selector: (row) => Number(row.quantity || 0), sortable: true, right: true },
            {
              name: 'Receivable',
              selector: (row) => Number(row.receivableAmount || 0),
              sortable: true,
              minWidth: '190px',
              cell: (row) => row.paymentStatus === 'paid' || !canManage ? money(row.receivableAmount) : (
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min={0}
                    value={editAmounts[row._id] ?? ''}
                    onChange={(e) => setEditAmounts((prev) => ({ ...prev, [row._id]: e.target.value }))}
                    className="border rounded p-1 w-24"
                  />
                  <button onClick={() => saveAmount(row)} className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Save</button>
                </div>
              ),
            },
            { name: 'Status', selector: (row) => row.paymentStatus || '-', sortable: true, wrap: true },
            { name: 'Created By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
            { name: 'Paid By', selector: (row) => row.paymentReceivedByName || '-', sortable: true, wrap: true },
            {
              name: 'Action',
              minWidth: '130px',
              cell: (row) => row.paymentStatus === 'paid' ? 'Paid' : (
                <button disabled={!canManage} onClick={() => markPaid(row)} className="bg-green-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm">
                  Mark Paid
                </button>
              ),
            },
          ]}
          data={filteredRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pay later records..." className="border rounded px-3 py-2 text-sm w-full md:max-w-sm" />
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(filteredRows, 'visible')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => downloadCsv(rows, 'all')} className="bg-green-700 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No pay later records found."
        />
      </div>
    </div>
  );
};

export default PayLaterRecords;
