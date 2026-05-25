import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');

const FarmMaintenanceTasks = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmMaintenanceTasks?.view || user?.permissions?.farmLogs?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmMaintenanceTasks?.manage || user?.permissions?.farmLogs?.manage;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/farm/maintenance-tasks');
      setRows(res.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load maintenance tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) load();
  }, [canView]);

  const pendingRows = useMemo(
    () => rows
      .filter((r) => (r.maintenanceStatus || 'pending') !== 'completed')
      .sort((a, b) => new Date(a.logDate || a.createdAt) - new Date(b.logDate || b.createdAt)),
    [rows]
  );

  const completedRows = useMemo(
    () => rows
      .filter((r) => (r.maintenanceStatus || 'pending') === 'completed')
      .sort((a, b) => new Date(b.maintenanceCompletedAt || b.updatedAt || b.createdAt) - new Date(a.maintenanceCompletedAt || a.updatedAt || a.createdAt)),
    [rows]
  );

  const toCsv = (data, filename) => {
    if (!data.length) return toast.warn('No rows to export');
    const header = ['Date', 'Block', 'Tree Code', 'Tree ID', 'Task', 'Status', 'Created By', 'Completed By', 'Completed At', 'Remarks'];
    const lines = data.map((r) => [
      formatDate(r.logDate),
      r.blockName || '',
      r.treeCode || '',
      r.treeId || '',
      r.maintenanceJob || '',
      r.maintenanceStatus || 'pending',
      r.createdByName || '',
      r.maintenanceCompletedByName || '',
      formatDate(r.maintenanceCompletedAt),
      r.remarks || '',
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const markCompleted = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/farm/maintenance-tasks/${id}/complete`);
      toast.success('Task marked completed');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to complete task');
    }
  };

  const commonColumns = [
    { name: 'Date', selector: (r) => r.logDate || r.createdAt, sortable: true, cell: (r) => formatDate(r.logDate) },
    { name: 'Block', selector: (r) => r.blockName || '', sortable: true },
    { name: 'Tree Code', selector: (r) => r.treeCode || '', sortable: true },
    { name: 'Task', selector: (r) => r.maintenanceJob || '', sortable: true, grow: 2 },
    { name: 'Created By', selector: (r) => r.createdByName || '', sortable: true },
    { name: 'Remarks', selector: (r) => r.remarks || '', grow: 2 },
  ];

  const pendingColumns = [
    ...commonColumns,
    ...(canManage
      ? [{ name: 'Actions', cell: (r) => <button onClick={() => markCompleted(r._id)} className="text-green-700 hover:underline">Mark Completed</button>, ignoreRowClick: true, button: true }]
      : []),
  ];

  const completedColumns = [
    ...commonColumns,
    { name: 'Completed By', selector: (r) => r.maintenanceCompletedByName || '', sortable: true },
    { name: 'Completed At', selector: (r) => r.maintenanceCompletedAt || r.updatedAt || '', sortable: true, cell: (r) => formatDate(r.maintenanceCompletedAt || r.updatedAt) },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Maintenance Tasks</h2>

      <div className="bg-white rounded shadow p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Pending Tasks (Oldest First)</h3>
          <button onClick={() => toCsv(pendingRows, 'maintenance_pending_tasks.csv')} className="px-3 py-2 rounded border border-green-700 text-green-700">
            Download CSV
          </button>
        </div>
        <DataTable
          columns={pendingColumns}
          data={pendingRows}
          progressPending={loading}
          pagination
          defaultSortFieldId={1}
          defaultSortAsc
          highlightOnHover
          dense
        />
      </div>

      <div className="bg-white rounded shadow p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Completed Tasks (Newest First)</h3>
          <button onClick={() => toCsv(completedRows, 'maintenance_completed_tasks.csv')} className="px-3 py-2 rounded border border-green-700 text-green-700">
            Download CSV
          </button>
        </div>
        <DataTable
          columns={completedColumns}
          data={completedRows}
          progressPending={loading}
          pagination
          defaultSortFieldId={8}
          defaultSortAsc={false}
          highlightOnHover
          dense
        />
      </div>
    </div>
  );
};

export default FarmMaintenanceTasks;
