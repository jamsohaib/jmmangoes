import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date().toISOString().slice(0, 10);

const FarmAddExpenses = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmExpenseAdd?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmExpenseAdd?.manage;
  const canEditTransactions = user?.isSuperAdmin || user?.id === 'super-admin';
  const [heads, setHeads] = useState([]);
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [entries, setEntries] = useState([]);
  const [summaryByStaff, setSummaryByStaff] = useState([]);
  const [entryType, setEntryType] = useState('expense');
  const [date, setDate] = useState(today);
  const [staffId, setStaffId] = useState('');
  const [headId, setHeadId] = useState('');
  const [itemId, setItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [editingEntryId, setEditingEntryId] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => items.filter((item) => String(item.headId) === String(headId)), [items, headId]);

  const loadSetup = async () => {
    const [headsRes, itemsRes, staffRes] = await Promise.all([
      api.get('/farm/expense-heads'),
      api.get('/farm/expense-items', { params: { activeOnly: true } }),
      api.get('/farm/hr/staff', { params: { includeLeft: false } }),
    ]);
    setHeads(headsRes.data || []);
    setItems(itemsRes.data || []);
    setStaff(staffRes.data || []);
  };

  const loadEntries = async () => {
    const res = await api.get('/farm/expense-entries', { params: { dateFrom, dateTo, withSummary: true } });
    setEntries(res.data?.rows || []);
    setSummaryByStaff(res.data?.summaryByStaff || []);
  };

  useEffect(() => {
    if (canView) {
      loadSetup().catch(() => toast.error('Failed to load farm expense setup.'));
      loadEntries().catch(() => toast.error('Failed to load farm expense entries.'));
    }
  }, [canView]);

  useEffect(() => {
    if (canView) loadEntries().catch(() => toast.error('Failed to load farm expense entries.'));
  }, [canView, dateFrom, dateTo]);

  const saveEntry = async () => {
    const value = Number(amount);
    if (!date || Number.isNaN(value) || value < 0) return toast.warn('Enter a valid date and amount.');
    if (!staffId) return toast.warn(entryType === 'fund' ? 'Select the staff member receiving funds.' : 'Select the staff member who spent the amount.');
    if (entryType === 'expense' && (!headId || (!itemId && !customItemName.trim()))) {
      return toast.warn('Select farm expense head and details.');
    }
    try {
      const payload = {
        entryType,
        date,
        staffId,
        headId: entryType === 'expense' ? headId : null,
        itemId: entryType === 'expense' ? itemId : null,
        customItemName: entryType === 'expense' ? customItemName : '',
        amount: value,
        remarks,
      };
      if (editingEntryId) {
        await api.put(`/farm/expense-entries/${editingEntryId}`, payload);
      } else {
        await api.post('/farm/expense-entries', payload);
      }
      setAmount('');
      setRemarks('');
      setCustomItemName('');
      setItemId('');
      setStaffId('');
      setEditingEntryId('');
      toast.success(editingEntryId ? 'Farm transaction updated.' : entryType === 'fund' ? 'Farm fund entry saved.' : 'Farm expense entry saved.');
      await loadEntries();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save farm entry.');
    }
  };

  const editEntry = (row) => {
    setEditingEntryId(row._id);
    setEntryType(row.entryType || 'expense');
    setDate(row.date ? new Date(row.date).toISOString().slice(0, 10) : today);
    setStaffId(row.staffId || '');
    setHeadId(row.entryType === 'expense' ? row.headId || '' : '');
    setItemId(row.entryType === 'expense' ? row.itemId || '' : '');
    setCustomItemName(row.entryType === 'expense' && !row.itemId ? row.itemName || '' : '');
    setAmount(row.amount ?? '');
    setRemarks(row.remarks || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingEntryId('');
    setEntryType('expense');
    setDate(today);
    setStaffId('');
    setHeadId('');
    setItemId('');
    setCustomItemName('');
    setAmount('');
    setRemarks('');
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) =>
      String(row.entryType || '').toLowerCase().includes(q) ||
      String(row.headName || '').toLowerCase().includes(q) ||
      String(row.itemName || '').toLowerCase().includes(q) ||
      String(row.staffName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q) ||
      String(row.enteredByName || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const totals = useMemo(() => {
    const funds = entries.filter((e) => e.entryType === 'fund').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const expenses = entries.filter((e) => e.entryType === 'expense').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return { funds, expenses, net: funds - expenses };
  }, [entries]);

  const downloadCsv = (rows, suffix) => {
    if (!rows.length) return toast.warn('No rows to download.');
    const header = ['Date', 'Type', 'Staff', 'Head', 'Details', 'Amount', 'Remarks', 'Entered By'];
    const lines = rows.map((row) => [
      row.date ? new Date(row.date).toLocaleString() : '',
      row.entryType || '',
      row.staffName || '',
      row.headName || '',
      row.itemName || '',
      row.amount ?? 0,
      row.remarks || '',
      row.enteredByName || '',
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `farm_expenses_${dateFrom}_${dateTo}_${suffix}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Farm Add Expenses</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-600">Funds Given</div>
          <div className="text-2xl font-bold">PKR {totals.funds.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-600">
          <div className="text-sm text-gray-600">Farm Expenses</div>
          <div className="text-2xl font-bold">PKR {totals.expenses.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-600">Net Available</div>
          <div className={`text-2xl font-bold ${totals.net < 0 ? 'text-red-700' : 'text-green-700'}`}>PKR {totals.net.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">{editingEntryId ? 'Edit Farm Fund / Expense Entry' : 'Add Farm Fund / Expense Entry'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="border p-2 rounded">
            <option value="expense">Farm Expense</option>
            <option value="fund">Funds Given To Farm</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border p-2 rounded" />
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="border p-2 rounded">
            <option value="">{entryType === 'fund' ? 'Select staff receiving funds' : 'Select staff who spent'}</option>
            {staff.map((row) => <option key={row._id} value={row._id}>{row.name} - {row.designation}</option>)}
          </select>
          {entryType === 'expense' ? (
            <>
              <select value={headId} onChange={(e) => { setHeadId(e.target.value); setItemId(''); }} className="border p-2 rounded">
                <option value="">Select Head</option>
                {heads.map((head) => <option key={head._id} value={head._id}>{head.name}</option>)}
              </select>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="border p-2 rounded">
                <option value="">Select Expense Detail / Other</option>
                {filteredItems.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              {!itemId ? <input value={customItemName} onChange={(e) => setCustomItemName(e.target.value)} placeholder="Enter expense detail" className="border p-2 rounded" /> : null}
            </>
          ) : null}
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="border p-2 rounded" />
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" className="border p-2 rounded md:col-span-2" />
          <button onClick={saveEntry} disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">{editingEntryId ? 'Update Entry' : 'Save Entry'}</button>
          {editingEntryId ? <button type="button" onClick={cancelEdit} className="border px-4 py-2 rounded">Cancel Edit</button> : null}
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Staff Funds & Spending Summary ({dateFrom} to {dateTo})</h3>
        <DataTable
          columns={[
            { name: 'Staff', selector: (row) => row.staffName || '-', sortable: true, wrap: true },
            { name: 'Funds Given', selector: (row) => Number(row.fundsGiven || 0), sortable: true, cell: (row) => `PKR ${Number(row.fundsGiven || 0).toFixed(2)}` },
            { name: 'Spent', selector: (row) => Number(row.spent || 0), sortable: true, cell: (row) => `PKR ${Number(row.spent || 0).toFixed(2)}` },
            {
              name: 'Balance',
              selector: (row) => Number(row.balance || 0),
              sortable: true,
              cell: (row) => (
                <span className={Number(row.balance || 0) < 0 ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>
                  PKR {Number(row.balance || 0).toFixed(2)}
                </span>
              ),
            },
          ]}
          data={summaryByStaff}
          pagination
          dense
          highlightOnHover
          noDataComponent="No staff fund/spending summary found for selected date range."
        />
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Farm Fund / Expense History</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history..." className="border p-2 rounded" />
          <div className="flex gap-2">
            <button onClick={() => downloadCsv(filteredEntries, 'visible')} className="bg-blue-700 text-white px-3 py-2 rounded text-sm">Download Visible</button>
            <button onClick={() => downloadCsv(entries, 'all')} className="bg-gray-700 text-white px-3 py-2 rounded text-sm">Download All</button>
          </div>
        </div>
        <DataTable
          columns={[
            { name: 'Date', selector: (row) => row.date ? new Date(row.date).toLocaleString() : '-', sortable: true, wrap: true },
            { name: 'Type', selector: (row) => row.entryType || '', sortable: true, cell: (row) => <span className="capitalize">{row.entryType}</span> },
            { name: 'Staff', selector: (row) => row.staffName || '-', sortable: true, wrap: true },
            { name: 'Head', selector: (row) => row.headName || '-', sortable: true, wrap: true },
            { name: 'Details', selector: (row) => row.itemName || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => `PKR ${Number(row.amount || 0).toFixed(2)}` },
            { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true },
            { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
            {
              name: 'Actions',
              cell: (row) => canEditTransactions ? <button type="button" onClick={() => editEntry(row)} className="text-blue-700 hover:underline">Edit</button> : '-',
            },
          ]}
          data={filteredEntries}
          pagination
          dense
          highlightOnHover
          noDataComponent="No farm fund or expense entries found."
        />
      </div>
    </div>
  );
};

export default FarmAddExpenses;
