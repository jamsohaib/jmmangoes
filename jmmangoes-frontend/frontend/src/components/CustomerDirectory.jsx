import React, { useEffect, useState } from 'react';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const CustomerDirectory = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.customerDirectory?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.customerDirectory?.manage;
  const canUseBroadcast = user?.role === 'admin' || user?.permissions?.communications?.view;
  const [rows, setRows] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [broadcastOptions, setBroadcastOptions] = useState({ products: [], sites: [] });
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const res = await api.get('/customers/directory');
    setRows(res.data || []);
  };

  const loadBroadcastOptions = async () => {
    const res = await api.get('/communications/whatsapp/broadcast-options');
    setBroadcastOptions(res.data || { products: [], sites: [] });
  };

  useEffect(() => {
    if (canView) load().catch(console.error);
  }, [canView]);

  useEffect(() => {
    if (canUseBroadcast) loadBroadcastOptions().catch(console.error);
  }, [canUseBroadcast]);

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
    const headers = ['Customer Name', 'Mobile / WhatsApp', 'Email', 'Last Purchase Date & Time', 'Last Purchase Site', 'Source', 'Notes'];
    const lines = sourceRows.map((r) => [
      `"${String(r.customerName || '-').replace(/"/g, '""')}"`,
      `"${String(r.customerWhatsapp || '-').replace(/"/g, '""')}"`,
      `"${String(r.customerEmail || '-').replace(/"/g, '""')}"`,
      `"${r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleString() : '-'}"`,
      `"${String(r.lastPurchaseSite || '-').replace(/"/g, '""')}"`,
      `"${String(r.source || '-').replace(/"/g, '""')}"`,
      `"${String(r.notes || '-').replace(/"/g, '""')}"`,
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

  const parseCsvLine = (line) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((value) => value.trim());
  };

  const downloadImportSampleCsv = () => {
    const headers = ['whatsapp', 'name', 'email', 'site', 'source', 'notes'];
    const sample = ['03006721290', 'Ahmed Sohaib', 'ahmed@example.com', 'online', 'previous_year_import', 'Previous online customer'];
    const csv = [headers, sample].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'customer_directory_import_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      window.alert('CSV should include header row and at least one contact row.');
      return;
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const parsed = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const get = (keys, fallbackIndex) => {
        const found = keys.map((key) => headers.indexOf(key)).find((idx) => idx >= 0);
        return values[found >= 0 ? found : fallbackIndex] || '';
      };
      return {
        row: index + 1,
        whatsapp: get(['whatsapp', 'mobile', 'phone', 'contact'], 0),
        name: get(['name', 'customername', 'customer_name'], 1),
        email: get(['email', 'customeremail', 'customer_email'], 2),
        site: get(['site', 'lastpurchasesite', 'last_purchase_site'], 3) || 'online',
        source: get(['source'], 4) || 'previous_year_import',
        notes: get(['notes', 'remarks'], 5),
      };
    }).filter((row) => row.whatsapp || row.name || row.email);
    setImportRows(parsed);
  };

  const uploadImportedContacts = async () => {
    if (!importRows.length) return window.alert('Please choose a CSV file first.');
    setImporting(true);
    try {
      const res = await api.post('/customers/directory/import', { rows: importRows });
      window.alert(res.data?.message || 'Contacts imported.');
      setImportRows([]);
      await load();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Failed to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  const cleanBroadcastLabel = (label = '') => {
    const value = String(label || '').trim();
    if (value.toLowerCase() === 'online' || value.toLowerCase() === 'online (online)') return 'online store';
    return value
      .replace(/\s+\(([^)]*)\)\s+\(\1\)$/i, ' ($1)')
      .replace(/(\(\s*\d+\s*kg\s*\)|\(\s*\d+\s*kg\))\s+\(\s*\d+\s*\)$/i, '$1')
      .replace(/(\d+\s*kg)\s+\(\s*\d+\s*\)$/i, '$1');
  };

  const selectedOptionLabels = (options, selectedIds, mode = 'comma') => {
    const labels = options
      .filter((option) => selectedIds.includes(String(option._id)))
      .map((option) => cleanBroadcastLabel(option.label || option.name))
      .filter(Boolean);
    if (mode === 'and' && labels.length > 1) {
      return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
    }
    return labels.join(' , ');
  };

  const toggleSelection = (setter, value) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const downloadBroadcastCsv = () => {
    const productText = selectedOptionLabels(broadcastOptions.products || [], selectedProducts, 'comma');
    const siteText = selectedOptionLabels(broadcastOptions.sites || [], selectedSites, 'and');
    if (!productText || !siteText) {
      window.alert('Please select at least one product and one site for the broadcast CSV.');
      return;
    }
    const sourceRows = filteredRows.filter((row) => String(row.customerWhatsapp || '').trim());
    const headers = ['whatsapp', 'name', 'product', 'site'];
    const lines = sourceRows.map((r) => [
      `"${String(r.customerWhatsapp || '').replace(/"/g, '""')}"`,
      `"${String(r.customerName || 'Customer').replace(/"/g, '""')}"`,
      `"${productText.replace(/"/g, '""')}"`,
      `"${siteText.replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `whatsapp_broadcast_customers_${new Date().toISOString().slice(0, 10)}.csv`);
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
    { name: 'Source', selector: (r) => r.source || '-', sortable: true, wrap: true },
    { name: 'Notes', selector: (r) => r.notes || '-', sortable: true, wrap: true },
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
      {canManage ? (
        <div className="bg-white rounded shadow p-4 mb-4">
          <h3 className="font-semibold text-lg mb-2">Import Previous Customer Contacts</h3>
          <p className="text-sm text-gray-700 mb-3">
            Use this to import previous years customers, especially old online store contacts. Contacts are merged by WhatsApp number.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <button onClick={downloadImportSampleCsv} className="bg-green-700 text-white px-4 py-2 rounded">
              Download Sample CSV
            </button>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
              className="border rounded p-2 md:col-span-2"
            />
            <button
              onClick={uploadImportedContacts}
              disabled={importing || !importRows.length}
              className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              {importing ? 'Uploading...' : `Upload ${importRows.length || ''} Contacts`}
            </button>
          </div>
          {importRows.length ? (
            <div className="text-sm text-gray-700 mt-2">
              Ready to import <strong>{importRows.length}</strong> contact(s). Columns: WhatsApp, Name, Email, Site, Source, Notes.
            </div>
          ) : null}
        </div>
      ) : null}
      {canUseBroadcast ? (
        <div className="bg-white rounded shadow p-4 mb-4">
          <h3 className="font-semibold text-lg mb-2">Broadcast CSV Builder</h3>
          <p className="text-sm text-gray-700 mb-3">
            Select products and sites, then download a broadcast-ready CSV for the currently filtered customers.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="font-medium mb-2">Products</div>
              <div className="max-h-44 overflow-y-auto border rounded p-2 space-y-1">
                {(broadcastOptions.products || []).map((product) => (
                  <label key={product._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(String(product._id))}
                      onChange={() => toggleSelection(setSelectedProducts, String(product._id))}
                    />
                    {product.label || product.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">Sites / Online Availability</div>
              <div className="max-h-44 overflow-y-auto border rounded p-2 space-y-1">
                {(broadcastOptions.sites || []).map((site) => (
                  <label key={site._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(String(site._id))}
                      onChange={() => toggleSelection(setSelectedSites, String(site._id))}
                    />
                    {site.label || site.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <button onClick={downloadBroadcastCsv} className="bg-emerald-700 text-white px-4 py-2 rounded">
                Download Broadcast CSV
              </button>
              <p className="text-xs text-gray-600">
                Export includes: WhatsApp number, customer name, selected products, and selected sites.
              </p>
            </div>
          </div>
        </div>
      ) : null}
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
