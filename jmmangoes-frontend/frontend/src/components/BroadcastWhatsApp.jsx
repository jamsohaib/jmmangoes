import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import DataTable from './common/DataTable';

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanBroadcastText = (value = '') => String(value || '')
  .replace(/\bonline\s*\(online\)/gi, 'online store')
  .replace(/\s+\(([^)]*)\)\s+\(\1\)/gi, ' ($1)')
  .replace(/(\(\s*\d+\s*kg\s*\)|\(\s*\d+\s*kg\))\s+\(\s*\d+\s*\)/gi, '$1')
  .replace(/(\d+\s*kg)\s+\(\s*\d+\s*\)/gi, '$1')
  .replace(/\s+,/g, ' ,')
  .trim();

const BroadcastWhatsApp = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.communications?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.communications?.manage;
  const [rows, setRows] = useState([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(5);

  const messagePreview = useMemo(() => {
    const sample = rows[0] || {
      name: 'Ahmed Sohaib',
      product: 'Dosehri 10 kg and Sindhri 10 kg',
      site: 'Rahim Yar Khan, Gulzaar e Quaid, and online ordering',
    };
    const product = cleanBroadcastText(sample.product || 'mango stock');
    const site = cleanBroadcastText(sample.site || 'our JM Mangoes stores');
    return `Dear ${sample.name || 'Customer'},\n\nFresh ${product} has arrived at ${site}.\n\nYou are warmly welcome to visit our stall or place your order online.\n\njmmangoes.pk\n03218869344`;
  }, [rows]);

  const handleTemplateDownload = () => {
    downloadCsv(`whatsapp_broadcast_template_${new Date().toISOString().slice(0, 10)}.csv`, [
      ['whatsapp', 'name', 'product', 'site'],
      ['923001234567', 'Ahmed Sohaib', 'Dosehri 10 kg and Sindhri 10 kg', 'Rahim Yar Khan, Gulzaar e Quaid, and online ordering'],
    ]);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      toast.warn('CSV should include a header row and at least one customer row.');
      return;
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const parsed = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const get = (key, fallbackIndex) => {
        const idx = headers.indexOf(key);
        return values[idx >= 0 ? idx : fallbackIndex] || '';
      };
      return {
        row: index + 1,
        whatsapp: get('whatsapp', 0),
        name: get('name', 1),
        product: get('product', 2),
        site: get('site', 3),
      };
    }).filter((row) => row.whatsapp || row.name || row.product || row.site);
    setRows(parsed);
    setResults([]);
    setSummary(null);
    toast.success(`${parsed.length} broadcast row(s) loaded.`);
  };

  const sendBroadcast = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!rows.length) return toast.warn('Upload a broadcast CSV first.');
    if (!window.confirm(`Send WhatsApp broadcast to ${rows.length} recipient(s)? This will take time because messages are spaced apart.`)) return;
    setSending(true);
    setResults([]);
    setSummary(null);
    const nextResults = [];
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const res = await api.post('/communications/whatsapp/broadcast', {
          rows: [rows[index]],
          delayMinMs: 0,
          delayMaxMs: 0,
        });
        nextResults.push(res.data?.results?.[0] || { ...rows[index], row: index + 1, status: 'sent' });
        setResults([...nextResults]);
        setSummary({
          total: rows.length,
          sent: nextResults.filter((row) => row.status === 'sent').length,
          failed: nextResults.filter((row) => row.status === 'failed').length,
          skipped: nextResults.filter((row) => row.status === 'skipped').length,
        });
        if (index < rows.length - 1) {
          const minMs = Math.max(3, Number(delayMin || 3)) * 1000;
          const maxMs = Math.max(Number(delayMin || 3), Number(delayMax || 5)) * 1000;
          await wait(minMs + Math.floor(Math.random() * (maxMs - minMs + 1)));
        }
      }
      toast.success('Broadcast completed.');
    } catch (err) {
      if (nextResults.length) setResults([...nextResults]);
      toast.error(err?.response?.data?.message || 'Failed to send broadcast.');
    } finally {
      setSending(false);
    }
  };

  const resultColumns = [
    { name: 'Row', selector: (r) => r.row || '-', sortable: true, width: '80px' },
    { name: 'WhatsApp', selector: (r) => r.whatsapp || '-', sortable: true, wrap: true },
    { name: 'Name', selector: (r) => r.name || '-', sortable: true, wrap: true },
    { name: 'Product', selector: (r) => r.product || '-', sortable: true, wrap: true },
    { name: 'Site', selector: (r) => r.site || '-', sortable: true, wrap: true },
    { name: 'Status', selector: (r) => r.status || 'pending', sortable: true, wrap: true },
    { name: 'Message / SID', selector: (r) => r.sid || r.message || '-', sortable: true, wrap: true },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Broadcast WhatsApp Message</h2>

      <div className="bg-white rounded shadow p-4 mb-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">1. Prepare CSV</h3>
            <p className="text-sm text-gray-700">
              Required columns: <strong>whatsapp</strong>, <strong>name</strong>, <strong>product</strong>, <strong>site</strong>.
            </p>
            <button type="button" onClick={handleTemplateDownload} className="bg-green-700 text-white px-4 py-2 rounded">
              Download Template CSV
            </button>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
              className="block w-full border rounded p-2"
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Message Preview</h3>
            <pre className="whitespace-pre-wrap bg-green-50 border border-green-200 rounded p-3 text-sm">{messagePreview}</pre>
            <p className="text-xs text-gray-600">
              The actual WhatsApp delivery uses the approved Twilio template: <strong>new_stock_arrival_jmmangoes</strong>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="text-sm font-medium">Minimum gap seconds</span>
            <input type="number" min="3" step="1" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Maximum gap seconds</span>
            <input type="number" min="3" step="1" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          <div className="text-sm text-gray-700">
            Loaded recipients: <strong>{rows.length}</strong>
          </div>
          <button
            type="button"
            disabled={sending || !canManage || !rows.length}
            onClick={sendBroadcast}
            className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {sending ? 'Sending Broadcast...' : 'Send Broadcast'}
          </button>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded shadow p-3"><div className="text-sm text-gray-600">Total</div><div className="text-xl font-bold">{summary.total}</div></div>
          <div className="bg-white rounded shadow p-3"><div className="text-sm text-gray-600">Sent</div><div className="text-xl font-bold text-green-700">{summary.sent}</div></div>
          <div className="bg-white rounded shadow p-3"><div className="text-sm text-gray-600">Failed</div><div className="text-xl font-bold text-red-700">{summary.failed}</div></div>
          <div className="bg-white rounded shadow p-3"><div className="text-sm text-gray-600">Skipped</div><div className="text-xl font-bold text-amber-700">{summary.skipped}</div></div>
        </div>
      ) : null}

      <div className="bg-white rounded shadow overflow-x-auto">
        <DataTable
          columns={resultColumns}
          data={results.length ? results : rows.map((row) => ({ ...row, status: 'ready' }))}
          pagination
          highlightOnHover
          striped
          dense
          noDataComponent="Upload a broadcast CSV to preview recipients."
        />
      </div>
    </div>
  );
};

export default BroadcastWhatsApp;
