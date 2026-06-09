import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date().toISOString().slice(0, 10);

const ActionLogs = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.actionLogs?.view;
  const [rows, setRows] = useState([]);
  const [moduleName, setModuleName] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/action-logs', { params: { module: moduleName, dateFrom, dateTo } });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load action logs.'));
  }, [canView, moduleName, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.action || '').toLowerCase().includes(q) ||
      String(row.module || '').toLowerCase().includes(q) ||
      String(row.entityType || '').toLowerCase().includes(q) ||
      String(row.entityLabel || '').toLowerCase().includes(q) ||
      String(row.performedByName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Action Logs</h2>
      <div className="bg-white rounded shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={moduleName} onChange={(e) => setModuleName(e.target.value)} className="border p-2 rounded">
            <option value="">All Modules</option>
            <option value="farm-expenses">Farm Expenses</option>
            <option value="farm-hr">Farm HR</option>
            <option value="farm-hr-expenses">Farm HR Expenses</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="border p-2 rounded" />
        </div>
      </div>
      <div className="bg-white rounded shadow p-4">
        <DataTable
          columns={[
            { name: 'Date & Time', selector: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : '-', sortable: true, wrap: true },
            { name: 'User', selector: (row) => row.performedByName || '-', sortable: true, wrap: true },
            { name: 'Module', selector: (row) => row.module || '-', sortable: true, wrap: true },
            { name: 'Action', selector: (row) => row.action || '-', sortable: true, wrap: true },
            { name: 'Entity', selector: (row) => row.entityLabel || row.entityType || '-', sortable: true, wrap: true, grow: 2 },
            {
              name: 'Details',
              selector: (row) => JSON.stringify(row.details || {}),
              wrap: true,
              grow: 3,
              cell: (row) => <pre className="text-xs whitespace-pre-wrap max-w-xl">{JSON.stringify(row.details || {}, null, 2)}</pre>,
            },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No action logs found."
        />
      </div>
    </div>
  );
};

export default ActionLogs;
