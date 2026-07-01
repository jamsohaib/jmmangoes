import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const OwnerPayments = () => {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.id === 'super-admin' || String(user?.username || '').toLowerCase() === 'admin' || user?.role === 'admin';
  const canView = user?.role === 'admin' || user?.permissions?.ownerPayments?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.ownerPayments?.manage;
  const [years, setYears] = useState([]);
  const [owners, setOwners] = useState([]);
  const [rows, setRows] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadYears = async () => {
    const res = await api.get('/financial-years');
    const data = res.data || [];
    setYears(data);
    if (!financialYearId) {
      const current = data.find((year) => year.isCurrent) || data[0];
      if (current?._id) setFinancialYearId(current._id);
    }
  };

  const loadOwners = async () => {
    const res = await api.get('/owners');
    const data = (res.data || []).filter((owner) => owner.isActive !== false);
    setOwners(data);
    if (!ownerId && data.length === 1) setOwnerId(data[0]._id);
  };

  const loadPayments = async () => {
    const params = {};
    if (financialYearId) params.financialYearId = financialYearId;
    const res = await api.get('/owners/payments', { params });
    setRows(res.data || []);
  };

  useEffect(() => {
    if (!canView) return;
    Promise.all([loadYears(), loadOwners()]).catch(() => toast.error('Failed to load owner payment setup.'));
  }, [canView]);

  useEffect(() => {
    if (canView) loadPayments().catch(() => toast.error('Failed to load owner payments.'));
  }, [canView, financialYearId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.ownerName || '').toLowerCase().includes(q) ||
      String(row.details || '').toLowerCase().includes(q) ||
      String(formatDate(row.paymentDate)).toLowerCase().includes(q) ||
      String(formatDateTime(row.paymentDate)).toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalVisible = useMemo(() => filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0), [filteredRows]);
  const selectedYear = years.find((year) => String(year._id) === String(financialYearId));

  const savePayment = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const numericAmount = Number(amount);
    if (!financialYearId || !ownerId || Number.isNaN(numericAmount) || numericAmount <= 0) {
      return toast.warn('Select financial year, owner, and enter valid amount.');
    }
    if (!window.confirm(`${editingId ? 'Update' : 'Submit'} owner payment of ${money(numericAmount)}?`)) return;
    setSaving(true);
    try {
      const payload = {
        financialYearId,
        ownerId,
        paymentDate,
        amount: numericAmount,
        details,
      };
      if (editingId) {
        await api.put(`/owners/payments/${editingId}`, payload);
      } else {
        await api.post('/owners/payments', payload);
      }
      toast.success(editingId ? 'Owner payment updated.' : 'Owner payment saved.');
      setAmount('');
      setDetails('');
      setEditingId('');
      await loadPayments();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save owner payment.');
    } finally {
      setSaving(false);
    }
  };

  const editPayment = (row) => {
    if (!isSuperAdmin) return toast.warn('Only super admin can edit owner payments.');
    setEditingId(row._id);
    setFinancialYearId(String(row.financialYearId || ''));
    setOwnerId(String(row.ownerId || ''));
    setPaymentDate(row.paymentDate ? new Date(row.paymentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setAmount(String(Number(row.amount || 0)));
    setDetails(row.details || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId('');
    setAmount('');
    setDetails('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
  };

  const deletePayment = async (row) => {
    if (!isSuperAdmin) return toast.warn('Only super admin can delete owner payments.');
    if (!window.confirm(`Delete payment of ${money(row.amount)} for ${row.ownerName || 'owner'}?`)) return;
    try {
      await api.delete(`/owners/payments/${row._id}`);
      toast.success('Owner payment deleted.');
      if (editingId === row._id) cancelEdit();
      await loadPayments();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete owner payment.');
    }
  };

  const downloadCsv = () => {
    if (!filteredRows.length) return toast.warn('No rows to download.');
    const header = ['Date', 'Financial Year', 'Owner', 'Amount', 'Details', 'Entered By', 'Entered At'];
    const lines = filteredRows.map((row) => [
      formatDate(row.paymentDate),
      row.financialYearName || '',
      row.ownerName || '',
      Number(row.amount || 0).toFixed(2),
      row.details || '',
      row.createdByName || '',
      formatDateTime(row.createdAt),
    ]);
    const csv = [header, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `owner_payments_${selectedYear?.name || 'all'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadPdf = () => {
    const tableRows = filteredRows.map((row) => `
      <tr>
        <td>${formatDate(row.paymentDate)}</td>
        <td>${row.financialYearName || '-'}</td>
        <td>${row.ownerName || '-'}</td>
        <td>${money(row.amount)}</td>
        <td>${row.details || '-'}</td>
        <td>${row.createdByName || '-'}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Owner Payments ${selectedYear?.name || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #4b5563; margin-bottom: 16px; }
            .summary { border: 1px solid #d1d5db; padding: 10px; border-radius: 8px; margin-bottom: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
            tfoot td { font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>JM Mangoes Owner Payments</h1>
          <div class="muted">Financial Year: ${selectedYear?.name || 'All'}</div>
          <div class="summary">Visible Total: ${money(totalVisible)}</div>
          <table>
            <thead>
              <tr><th>Date</th><th>Financial Year</th><th>Owner</th><th>Amount</th><th>Details</th><th>Entered By</th></tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="6">No payments found.</td></tr>'}</tbody>
            <tfoot><tr><td colspan="3">Total</td><td>${money(totalVisible)}</td><td colspan="2"></td></tr></tfoot>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('Popup blocked. Please allow popups to print PDF.');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Payments to Owners</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">{editingId ? 'Edit Owner Payment' : 'Add Owner Payment'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded">
            <option value="">Select financial year</option>
            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
          </select>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="border p-2 rounded">
            <option value="">Select owner</option>
            {owners.map((owner) => <option key={owner._id} value={owner._id}>{owner.name}</option>)}
          </select>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="border p-2 rounded" />
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="border p-2 rounded" />
          <button onClick={savePayment} disabled={!canManage || saving} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">
            {saving ? 'Saving...' : editingId ? 'Update' : 'Submit'}
          </button>
          {editingId ? (
            <button onClick={cancelEdit} type="button" className="bg-gray-600 text-white px-4 py-2 rounded">
              Cancel Edit
            </button>
          ) : null}
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details" className="border p-2 rounded md:col-span-5" rows={2} />
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 border-l-4 border-green-700">
        <div className="text-sm text-gray-600">Visible Payments Total</div>
        <div className="text-2xl font-bold">{money(totalVisible)}</div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Owner Payment Transactions</h3>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by owner, details, or date..."
            className="border p-2 rounded w-full md:w-96"
          />
          <div className="flex gap-2">
            <button onClick={downloadCsv} className="bg-blue-700 text-white px-3 py-2 rounded">Download CSV</button>
            <button onClick={downloadPdf} className="bg-red-700 text-white px-3 py-2 rounded">Download PDF</button>
          </div>
        </div>
        <DataTable
          columns={[
            { name: 'Date', selector: (row) => row.paymentDate || '', sortable: true, cell: (row) => formatDate(row.paymentDate), wrap: true },
            { name: 'Financial Year', selector: (row) => row.financialYearName || '-', sortable: true, wrap: true },
            { name: 'Owner', selector: (row) => row.ownerName || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => money(row.amount) },
            { name: 'Details', selector: (row) => row.details || '-', sortable: true, wrap: true, grow: 1.4 },
            { name: 'Entered By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
            { name: 'Entered At', selector: (row) => row.createdAt || '', sortable: true, cell: (row) => formatDateTime(row.createdAt), wrap: true },
            ...(isSuperAdmin ? [{
              name: 'Actions',
              minWidth: '160px',
              cell: (row) => (
                <div className="flex flex-wrap gap-2 py-1">
                  <button onClick={() => editPayment(row)} className="bg-blue-700 text-white px-3 py-1 rounded">Edit</button>
                  <button onClick={() => deletePayment(row)} className="bg-red-700 text-white px-3 py-1 rounded">Delete</button>
                </div>
              ),
            }] : []),
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No owner payment records found."
        />
      </div>
    </div>
  );
};

export default OwnerPayments;
