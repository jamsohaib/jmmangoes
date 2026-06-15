import React, { useEffect, useState } from 'react';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const CustomerDirectory = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.customerDirectory?.view;
  const [rows, setRows] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const load = async () => {
    const res = await api.get('/customers/directory');
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) load().catch(console.error);
  }, [canView]);

  const regions = Array.from(new Set(rows.map((r) => r.lastPurchaseSite).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const filteredRows = rows.filter((r) => {
    const byRegion = !selectedRegion || r.lastPurchaseSite === selectedRegion;
    const term = appliedSearch.trim().toLowerCase();
    const bySearch =
      !term ||
      String(r.customerName || '').toLowerCase().includes(term) ||
      String(r.customerWhatsapp || '').toLowerCase().includes(term) ||
      String(r.customerEmail || '').toLowerCase().includes(term);
    return byRegion && bySearch;
  });

  const downloadCsv = (sourceRows = filteredRows, suffix = 'all') => {
    const headers = ['Customer Name', 'Mobile / WhatsApp', 'Email', 'Last Purchase Date & Time', 'Last Purchase Site'];
    const lines = sourceRows.map((r) => [
      `"${String(r.customerName || '-').replace(/"/g, '""')}"`,
      `"${String(r.customerWhatsapp || '-').replace(/"/g, '""')}"`,
      `"${String(r.customerEmail || '-').replace(/"/g, '""')}"`,
      `"${r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleString() : '-'}"`,
      `"${String(r.lastPurchaseSite || '-').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `customer_directory_${new Date().toISOString().slice(0, 10)}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const customerColumns = [
    { name: 'Customer Name', selector: (r) => r.customerName || '-', sortable: true, wrap: true },
    { name: 'Mobile / WhatsApp', selector: (r) => r.customerWhatsapp || '-', sortable: true, wrap: true },
    { name: 'Email', selector: (r) => r.customerEmail || '-', sortable: true, wrap: true },
    {
      name: 'Last Purchase Date & Time',
      selector: (r) => (r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleString() : '-'),
      sortable: true,
      wrap: true,
    },
    { name: 'Last Purchase Site', selector: (r) => r.lastPurchaseSite || '-', sortable: true, wrap: true },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Customer Directory</h2>
      <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Region</label>
          <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} className="w-full border p-2 rounded">
            <option value="">All Regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Search</label>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name or contact number"
            className="w-full border p-2 rounded"
          />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => setAppliedSearch(searchInput)} className="bg-blue-600 text-white px-4 py-2 rounded">
            Search
          </button>
          <button onClick={() => { setSearchInput(''); setAppliedSearch(''); setSelectedRegion(''); }} className="border px-4 py-2 rounded">
            Reset
          </button>
        </div>
        <div className="flex items-end justify-start md:justify-end">
          <button onClick={() => downloadCsv(filteredRows, 'all')} className="bg-green-600 text-white px-4 py-2 rounded">
            Download CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <DataTable
          columns={customerColumns}
          data={filteredRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-end">
              <button onClick={() => downloadCsv(filteredRows, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
              <button onClick={() => downloadCsv(filteredRows, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
            </div>
          )}
          noDataComponent="No customer data found."
        />
      </div>
    </div>
  );
};

export default CustomerDirectory;
