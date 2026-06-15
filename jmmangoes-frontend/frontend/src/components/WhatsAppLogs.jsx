import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const WhatsAppLogs = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.communications?.view;
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [eventType, setEventType] = useState('');
  const [loading, setLoading] = useState(false);

  const loadRows = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = { dateFrom, dateTo };
      if (eventType) params.eventType = eventType;
      const res = await api.get('/communications/whatsapp/events', { params });
      setRows(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows().catch(console.error);
  }, [canView, dateFrom, dateTo, eventType]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [
      r.eventType,
      r.direction,
      r.waId,
      r.from,
      r.recipientId,
      r.contactName,
      r.messageType,
      r.text,
      r.buttonText,
      r.status,
      r.orderNumber,
      r.actionTaken,
    ].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)));
  }, [rows, search]);

  const downloadCsv = (sourceRows, suffix) => {
    const headers = ['Date', 'Type', 'Direction', 'Contact', 'Phone', 'Message Type', 'Text/Button', 'Status', 'Order', 'Action'];
    const csvRows = sourceRows.map((r) => [
      new Date(r.createdAt).toLocaleString(),
      r.eventType || '',
      r.direction || '',
      r.contactName || '',
      r.from || r.recipientId || r.waId || '',
      r.messageType || '',
      r.text || r.buttonText || r.buttonPayload || '',
      r.status || '',
      r.orderNumber || '',
      r.actionTaken || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `whatsapp_logs_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { name: 'Date', selector: (r) => new Date(r.createdAt).toLocaleString(), sortable: true, wrap: true, grow: 1.2 },
    { name: 'Type', selector: (r) => r.eventType || '-', sortable: true, wrap: true },
    { name: 'Contact', selector: (r) => r.contactName || r.from || r.recipientId || '-', sortable: true, wrap: true },
    { name: 'Message', selector: (r) => r.text || r.buttonText || r.buttonPayload || '-', sortable: true, wrap: true, grow: 2 },
    { name: 'Status', selector: (r) => r.status || '-', sortable: true, wrap: true },
    { name: 'Order', selector: (r) => r.orderNumber || '-', sortable: true, wrap: true },
    { name: 'Action', selector: (r) => r.actionTaken || '-', sortable: true, wrap: true },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">WhatsApp Logs</h2>
      <div className="bg-white rounded shadow p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
          <input className="border rounded p-2" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="border rounded p-2" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select className="border rounded p-2" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="">All Event Types</option>
            <option value="message">Messages</option>
            <option value="status">Statuses</option>
          </select>
          <input className="border rounded p-2 md:col-span-2" placeholder="Search WhatsApp logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <button className="border px-3 py-1 rounded" onClick={() => downloadCsv(filteredRows, 'visible')}>Download Visible</button>
          <button className="border px-3 py-1 rounded" onClick={() => downloadCsv(rows, 'all')}>Download All</button>
          <button className="border px-3 py-1 rounded" onClick={() => loadRows()}>Refresh</button>
        </div>
        <DataTable columns={columns} data={filteredRows} pagination highlightOnHover responsive persistTableHead progressPending={loading} noDataComponent="No WhatsApp events found." />
      </div>
    </div>
  );
};

export default WhatsAppLogs;
