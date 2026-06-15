import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);
const lastWeekStartISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
})();

const StockMovement = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.stockMovement?.view;
  const [rows, setRows] = useState([]);
  const [dateFrom, setDateFrom] = useState(lastWeekStartISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [movementType, setMovementType] = useState('');
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/stocks/ledger', {
      params: {
        dateFrom,
        dateTo,
        movementType: movementType || undefined,
        limit: 5000,
      },
    });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch((err) => toast.error(err?.response?.data?.message || 'Failed to load stock movement.'));
  }, [canView, dateFrom, dateTo, movementType]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.holderType || '').toLowerCase().includes(q) ||
      String(row.holderName || '').toLowerCase().includes(q) ||
      String(row.productName || '').toLowerCase().includes(q) ||
      String(row.movementType || '').toLowerCase().includes(q) ||
      String(row.lotCode || '').toLowerCase().includes(q) ||
      String(row.counterpartName || '').toLowerCase().includes(q) ||
      String(row.createdByName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const downloadCsv = (targetRows, suffix) => {
    const headers = ['Date', 'Holder Type', 'Holder', 'Product', 'Movement', 'Lot', 'Qty', 'Unit Cost', 'Counterpart', 'Updated By', 'Remarks'];
    const csvRows = targetRows.map((row) => [
      `"${new Date(row.createdAt).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.holderType || '').replace(/"/g, '""')}"`,
      `"${String(row.holderName || '').replace(/"/g, '""')}"`,
      `"${String(row.productName || '').replace(/"/g, '""')}"`,
      `"${String(row.movementType || '').replace(/"/g, '""')}"`,
      `"${String(row.lotCode || '').replace(/"/g, '""')}"`,
      `"${Number(row.quantity || 0)}"`,
      `"${Number(row.unitCost || 0).toFixed(2)}"`,
      `"${String(row.counterpartName || '').replace(/"/g, '""')}"`,
      `"${String(row.createdByName || '-').replace(/"/g, '""')}"`,
      `"${String(row.remarks || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_movement_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { name: 'Date', selector: (row) => new Date(row.createdAt).toLocaleString(), sortable: true, wrap: true },
    { name: 'Holder Type', selector: (row) => row.holderType || '-', sortable: true, wrap: true },
    { name: 'Holder', selector: (row) => row.holderName || '-', sortable: true, wrap: true },
    { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
    { name: 'Movement', selector: (row) => String(row.movementType || '').replaceAll('_', ' '), sortable: true, wrap: true },
    { name: 'Lot', selector: (row) => row.lotCode || '-', sortable: true, wrap: true },
    { name: 'Qty', selector: (row) => Number(row.quantity || 0), sortable: true, right: true },
    { name: 'Unit Cost', selector: (row) => Number(row.unitCost || 0), sortable: true, right: true, cell: (row) => Number(row.unitCost || 0).toFixed(2) },
    { name: 'Counterpart', selector: (row) => row.counterpartName || '-', sortable: true, wrap: true },
    { name: 'Updated By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
    { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true, grow: 1.4 },
  ];

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Stock Movement</h2>
      <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
        <select value={movementType} onChange={(e) => setMovementType(e.target.value)} className="border p-2 rounded">
          <option value="">All Movements</option>
          <option value="in">In</option>
          <option value="out">Out</option>
          <option value="transfer_in">Transfer In</option>
          <option value="transfer_out">Transfer Out</option>
          <option value="adjustment">Adjustment</option>
          <option value="wastage">Wastage</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search movements..." className="border p-2 rounded md:col-span-2" />
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
          noDataComponent="No stock movements found."
        />
      </div>
    </div>
  );
};

export default StockMovement;
