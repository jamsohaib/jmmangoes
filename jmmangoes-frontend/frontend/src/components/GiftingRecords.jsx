import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const GiftingRecords = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.giftingRecords?.view;
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');

  const loadSites = async () => {
    const res = await api.get('/sales/gift-sites');
    const list = res.data || [];
    setSites(list);
    if (!siteId && list.length === 1) setSiteId(list[0]._id);
  };

  const loadRows = async () => {
    const params = { dateFrom, dateTo };
    if (siteId) params.siteId = siteId;
    const res = await api.get('/sales/gifts', { params });
    setRows((res.data || []).filter((row) => row.entryType === 'gift'));
  };

  useEffect(() => {
    if (canView) loadSites().catch(() => toast.error('Failed to load stores.'));
  }, [canView]);

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load gifting records.'));
  }, [canView, siteId, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.customerName || '').toLowerCase().includes(q) ||
      String(row.customerWhatsapp || '').toLowerCase().includes(q) ||
      String(row.giftSourceName || '').toLowerCase().includes(q) ||
      String(row.productName || '').toLowerCase().includes(q) ||
      String(row.siteName || '').toLowerCase().includes(q) ||
      String(row.createdByName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalQty = useMemo(() => filteredRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0), [filteredRows]);
  const totalValue = useMemo(() => filteredRows.reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.quantity || 0), 0), [filteredRows]);

  const downloadCsv = (sourceRows = filteredRows, suffix = 'visible') => {
    const headers = ['Date & Time', 'Store', 'Gift Source', 'Recipient Name', 'Contact', 'Product', 'Quantity', 'Gift Value', 'Given By'];
    const csvRows = sourceRows.map((row) => [
      `"${new Date(row.createdAt || row.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.siteName || '-').replace(/"/g, '""')}"`,
      `"${String(row.giftSourceName || '-').replace(/"/g, '""')}"`,
      `"${String(row.customerName || '-').replace(/"/g, '""')}"`,
      `"${String(row.customerWhatsapp || '-').replace(/"/g, '""')}"`,
      `"${String(row.productName || '-').replace(/"/g, '""')}"`,
      `"${Number(row.quantity || 0)}"`,
      `"${(Number(row.unitPrice || 0) * Number(row.quantity || 0)).toFixed(2)}"`,
      `"${String(row.createdByName || '-').replace(/"/g, '""')}"`,
    ].join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `gifting_records_${dateFrom || 'from'}_${dateTo || 'to'}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Gifting Records</h2>

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
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-600">Gift Quantity</div>
          <div className="text-2xl font-bold text-green-700">{totalQty} qty</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-600">Approx Gift Value</div>
          <div className="text-2xl font-bold text-blue-700">PKR {totalValue.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <DataTable
          title={`Gift Records (${dateFrom} to ${dateTo})`}
          columns={[
            { name: 'Date', selector: (row) => new Date(row.createdAt || row.date).toLocaleString(), sortable: true, wrap: true },
            { name: 'Store', selector: (row) => row.siteName || '-', sortable: true, wrap: true },
            { name: 'Gift Source', selector: (row) => row.giftSourceName || '-', sortable: true, wrap: true },
            { name: 'Name', selector: (row) => row.customerName || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.customerWhatsapp || '-', sortable: true, wrap: true },
            { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
            { name: 'Qty', selector: (row) => Number(row.quantity || 0), sortable: true, right: true },
            { name: 'Gift Value', selector: (row) => Number(row.unitPrice || 0) * Number(row.quantity || 0), sortable: true, right: true, cell: (row) => `PKR ${(Number(row.unitPrice || 0) * Number(row.quantity || 0)).toFixed(2)}` },
            { name: 'Given By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
          ]}
          data={filteredRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gifts..."
                className="border rounded px-3 py-2 text-sm w-full md:max-w-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(filteredRows, 'visible')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => downloadCsv(rows, 'all')} className="bg-green-700 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No gifting records found."
        />
      </div>
    </div>
  );
};

export default GiftingRecords;
