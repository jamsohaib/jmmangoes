import React, { useEffect, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const StockWasted = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.stockWasted?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.stockWasted?.manage;
  const [sites, setSites] = useState([]);
  const [stock, setStock] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [entryDate, setEntryDate] = useState(todayISO);
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState([]);
  const [entrySearch, setEntrySearch] = useState('');

  const loadSites = async () => {
    const res = await api.get('/wastage/sites');
    const data = res.data || [];
    setSites(data);
    if (!siteId && data.length) setSiteId(data[0]._id);
  };

  const loadStock = async (id) => {
    if (!id) return setStock([]);
    const res = await api.get('/wastage/site-stock', { params: { siteId: id } });
    setStock(res.data || []);
  };

  const loadEntries = async (id, from, to) => {
    if (!id) return setEntries([]);
    const params = { siteId: id };
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    const res = await api.get('/wastage/entries', { params });
    setEntries(res.data || []);
  };

  useEffect(() => {
    if (canView) loadSites().catch(console.error);
  }, [canView]);

  useEffect(() => {
    if (canView && siteId) loadStock(siteId).catch(console.error);
  }, [canView, siteId]);

  useEffect(() => {
    if (canView && siteId) loadEntries(siteId, dateFrom, dateTo).catch(console.error);
  }, [canView, siteId, dateFrom, dateTo]);

  const handleSubmit = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const qty = Number(quantity);
    if (!siteId || !productId || Number.isNaN(qty) || qty <= 0) return toast.warn('Select site, product and valid quantity.');
    try {
      await api.post('/wastage/entries', {
        siteId,
        productId,
        quantity: qty,
        notes,
        date: entryDate,
      });
      toast.success('Stock wasted entry saved and stock updated.');
      setProductId('');
      setQuantity('');
      setNotes('');
      await loadStock(siteId);
      await loadEntries(siteId, dateFrom, dateTo);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save wasted stock entry.');
    }
  };

  const downloadCsv = (sourceRows = entries, suffix = 'all') => {
    const headers = ['Date & Time', 'Site', 'Product', 'Quantity', 'Notes', 'Updated By'];
    const rows = sourceRows.map((e) => [
      `"${new Date(e.createdAt || e.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(e.siteName || '').replace(/"/g, '""')}"`,
      `"${String(e.productName || '').replace(/"/g, '""')}"`,
      `"${String(e.quantity || 0)}"`,
      `"${String(e.notes || '').replace(/"/g, '""')}"`,
      `"${String(e.createdByName || '-').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_wastage_${dateFrom || 'from'}_${dateTo || 'to'}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredEntries = entries.filter((e) => {
    const q = entrySearch.trim().toLowerCase();
    if (!q) return true;
    return [
      new Date(e.createdAt || e.date).toLocaleString(),
      e.productName,
      e.quantity,
      e.notes,
      e.createdByName,
    ].some((x) => String(x || '').toLowerCase().includes(q));
  });

  const entryColumns = [
    { name: 'Date & Time', selector: (row) => new Date(row.createdAt || row.date).toLocaleString(), sortable: true, wrap: true },
    { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
    { name: 'Quantity', selector: (row) => Number(row.quantity || 0), sortable: true, wrap: true },
    { name: 'Notes', selector: (row) => row.notes || '-', wrap: true, grow: 2 },
    { name: 'Updated By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Stock Wasted</h2>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Location / Site</label>
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setProductId(''); }} className="w-full border p-2 rounded">
            <option value="">Select Site</option>
            {sites.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Entry Date</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-5">
        <div className="px-4 py-3 border-b font-semibold">Available Stock</div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Product</th>
              <th className="border px-3 py-2">Current Quantity</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((p) => (
              <tr key={p._id}>
                <td className="border px-3 py-2">{p.name}</td>
                <td className="border px-3 py-2">{p.quantity || 0}</td>
              </tr>
            ))}
            {stock.length === 0 && (
              <tr>
                <td colSpan={2} className="border px-3 py-3 text-center text-gray-500">No stock found for selected site.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Wasted Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border p-2 rounded">
            <option value="">Select Product</option>
            {stock.map((p) => (
              <option key={p._id} value={p._id}>{p.name} (Stock: {p.quantity || 0})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Wasted Quantity</label>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border p-2 rounded" placeholder="Enter quantity" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border p-2 rounded" placeholder="Optional notes" />
        </div>
        <div className="md:col-span-3">
          <button onClick={handleSubmit} disabled={!canManage} className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-60">
            Save Wasted Stock Entry
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">From Date</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To Date</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => loadEntries(siteId, dateFrom, dateTo)}
            className="bg-blue-600 text-white px-4 py-2 rounded w-full"
          >
            Apply Range
          </button>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => downloadCsv(entries, 'all')}
            className="bg-green-600 text-white px-4 py-2 rounded w-full"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow mt-5 p-3">
        <div className="px-4 py-3 border-b font-semibold">Wasted Stock Transactions ({dateFrom} to {dateTo})</div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-3">
          <input
            value={entrySearch}
            onChange={(e) => setEntrySearch(e.target.value)}
            placeholder="Search wasted transactions..."
            className="border p-2 rounded w-full md:max-w-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => downloadCsv(filteredEntries, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
            <button onClick={() => downloadCsv(entries, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
          </div>
        </div>
        <DataTable
          columns={entryColumns}
          data={filteredEntries}
          pagination
          highlightOnHover
          dense
          responsive
          persistTableHead
          noDataComponent="No wasted stock entries found for selected range/site."
        />
      </div>
    </div>
  );
};

export default StockWasted;
