import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from 'react-data-table-component';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const AddExpenses = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.addExpense?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.addExpense?.manage;
  const isSuperUser = user?.role === 'admin';
  const [holders, setHolders] = useState({ sites: [], warehouses: [], wholesellers: [] });
  const [heads, setHeads] = useState([]);
  const [items, setItems] = useState([]);
  const [entries, setEntries] = useState([]);

  const [holderType, setHolderType] = useState('site');
  const [holderId, setHolderId] = useState('');
  const [entryDate, setEntryDate] = useState(todayISO);
  const [headId, setHeadId] = useState('');
  const [itemId, setItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editHeadId, setEditHeadId] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editCustomItemName, setEditCustomItemName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editDate, setEditDate] = useState(todayISO);
  const [expenseSearch, setExpenseSearch] = useState('');

  const loadMasters = async () => {
    const [holdersRes, headsRes, itemsRes] = await Promise.all([
      api.get('/expenses/holders'),
      api.get('/expense-heads/for-entry'),
      api.get('/expense-items'),
    ]);
    const h = holdersRes.data || { sites: [], warehouses: [], wholesellers: [] };
    setHolders(h);
    setHeads(headsRes.data || []);
    setItems(itemsRes.data || []);
    if (!holderId) {
      const defaultOptions = (h.sites || []);
      if (defaultOptions.length) setHolderId(defaultOptions[0]._id);
    }
  };

  const loadEntries = async (targetHolderType = holderType, targetHolderId = holderId) => {
    if (!targetHolderId) return setEntries([]);
    const res = await api.get('/expense-entries', { params: { holderType: targetHolderType, holderId: targetHolderId, dateFrom, dateTo } });
    setEntries(res.data || []);
  };

  useEffect(() => {
    if (canView) loadMasters().catch(console.error);
  }, [canView]);

  useEffect(() => {
    if (canView && holderId) loadEntries(holderType, holderId).catch(console.error);
  }, [canView, holderType, holderId, dateFrom, dateTo]);

  const holderTypeOptions = [
    { value: 'site', label: 'Sale Point / Site' },
    { value: 'online', label: 'Online' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'wholeseller', label: 'Wholeseller' },
  ];

  const holderChoices = useMemo(() => {
    if (holderType === 'site') return holders.sites || [];
    if (holderType === 'online') return (holders.sites || []).filter((s) => String(s.name || '').trim().toLowerCase() === 'online');
    if (holderType === 'warehouse') return holders.warehouses || [];
    if (holderType === 'wholeseller') return holders.wholesellers || [];
    return [];
  }, [holderType, holders]);

  useEffect(() => {
    if (!holderId && holderChoices.length) {
      setHolderId(holderChoices[0]._id);
    }
  }, [holderId, holderChoices]);

  const filteredItems = useMemo(
    () => items.filter((i) => String(i.headId) === String(headId)),
    [items, headId]
  );

  const handleSaveExpense = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const value = Number(amount);
    if (!holderId || !headId || Number.isNaN(value) || value < 0) return toast.warn('Provide valid expense data.');
    const isOther = itemId === 'other';
    if ((!itemId || isOther) && !customItemName.trim()) return toast.warn('Select expense name or enter other name.');
    try {
      await api.post('/expense-entries', {
        holderType,
        holderId,
        date: entryDate,
        headId,
        itemId: isOther ? null : (itemId || null),
        itemName: isOther || !itemId ? customItemName.trim() : '',
        amount: value,
        remarks,
      });
      toast.success('Expense entry saved.');
      setItemId('');
      setCustomItemName('');
      setAmount('');
      setRemarks('');
      await loadEntries(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save expense entry.');
    }
  };

  const downloadCsv = (rows = entries, suffix = 'all') => {
    const headers = ['Date & Time', 'Holder Type', 'Holder', 'Head', 'Expense Name', 'Amount', 'Remarks', 'Entered By'];
    const csvRows = rows.map((e) => [
      `"${new Date(e.createdAt || e.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(e.holderType || (String(e.siteName || '').toLowerCase() === 'online' ? 'online' : 'site')).replace(/"/g, '""')}"`,
      `"${String(e.holderName || e.siteName || '').replace(/"/g, '""')}"`,
      `"${String(e.headName || '').replace(/"/g, '""')}"`,
      `"${String(e.itemName || '').replace(/"/g, '""')}"`,
      `"${Number(e.amount || 0).toFixed(2)}"`,
      `"${String(e.remarks || '').replace(/"/g, '""')}"`,
      `"${String(e.enteredByName || '-').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `expenses_${dateFrom}_${dateTo}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalExpense = useMemo(
    () => entries.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [entries]
  );
  const filteredExpenseEntries = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      String(e.holderType || '').toLowerCase().includes(q) ||
      String(e.holderName || e.siteName || '').toLowerCase().includes(q) ||
      String(e.headName || '').toLowerCase().includes(q) ||
      String(e.itemName || '').toLowerCase().includes(q) ||
      String(e.remarks || '').toLowerCase().includes(q) ||
      String(e.enteredByName || '').toLowerCase().includes(q)
    );
  }, [entries, expenseSearch]);

  const expenseColumns = useMemo(() => {
    const cols = [
      {
        name: 'Date & Time',
        selector: (row) => new Date(row.createdAt || row.date).toLocaleString(),
        sortable: true,
        wrap: true,
      },
      { name: 'Holder Type', selector: (row) => row.holderType || (String(row.siteName || '').toLowerCase() === 'online' ? 'online' : 'site'), sortable: true, wrap: true },
      { name: 'Holder', selector: (row) => row.holderName || row.siteName || '-', sortable: true, wrap: true },
      { name: 'Head', selector: (row) => row.headName || '-', sortable: true, wrap: true },
      { name: 'Expense', selector: (row) => row.itemName || '-', sortable: true, wrap: true },
      {
        name: 'Amount',
        selector: (row) => Number(row.amount || 0),
        sortable: true,
        right: true,
        cell: (row) => `PKR ${Number(row.amount || 0).toFixed(2)}`,
      },
      { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true, grow: 1.4 },
      { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
    ];
    if (isSuperUser) {
      cols.push({
        name: 'Actions',
        cell: (row) => (
          <div className="flex gap-2">
            <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline">Edit</button>
            <button onClick={() => removeEntry(row._id)} className="text-red-600 hover:underline">Remove</button>
          </div>
        ),
        ignoreRowClick: true,
        allowOverflow: true,
        button: true,
      });
    }
    return cols;
  }, [isSuperUser]);

  const openEdit = (e) => {
    setEditingEntry(e);
    setEditHeadId(e.headId || '');
    const matchedItem = items.find((i) => i.name.toLowerCase() === String(e.itemName || '').toLowerCase() && String(i.headId) === String(e.headId));
    setEditItemId(matchedItem?._id || 'other');
    setEditCustomItemName(matchedItem ? '' : (e.itemName || ''));
    setEditAmount(String(e.amount ?? ''));
    setEditRemarks(e.remarks || '');
    setEditDate(new Date(e.date || e.createdAt).toISOString().slice(0, 10));
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    const value = Number(editAmount);
    const isOther = editItemId === 'other';
    if (Number.isNaN(value) || value < 0) return toast.warn('Invalid amount.');
    if ((!editItemId || isOther) && !editCustomItemName.trim()) return toast.warn('Expense name is required.');
    try {
      await api.put(`/expense-entries/${editingEntry._id}`, {
        date: editDate,
        headId: editHeadId,
        itemId: isOther ? null : editItemId,
        itemName: isOther || !editItemId ? editCustomItemName.trim() : '',
        amount: value,
        remarks: editRemarks,
      });
      toast.success('Expense updated.');
      setEditingEntry(null);
      await loadEntries(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update expense.');
    }
  };

  const removeEntry = async (id) => {
    if (!window.confirm('Remove this expense entry?')) return;
    try {
      await api.delete(`/expense-entries/${id}`);
      toast.success('Expense removed.');
      await loadEntries(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove expense.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Add Expenses</h2>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Holder Type</label>
          <select value={holderType} onChange={(e) => { const next = e.target.value; setHolderType(next); setHolderId(''); }} className="w-full border p-2 rounded">
            {holderTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Holder</label>
          <select value={holderId} onChange={(e) => setHolderId(e.target.value)} className="w-full border p-2 rounded">
            <option value="">Select Holder</option>
            {holderChoices.map((h) => <option key={h._id} value={h._id}>{h.name || `${h.code || ''} ${h.name || ''}`.trim()}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Expense Date</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={headId} onChange={(e) => { setHeadId(e.target.value); setItemId(''); setCustomItemName(''); }} className="border p-2 rounded">
          <option value="">Select Expense Head</option>
          {heads.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <select value={itemId} onChange={(e) => { setItemId(e.target.value); if (e.target.value !== 'other') setCustomItemName(''); }} className="border p-2 rounded">
          <option value="">Select Expense Name</option>
          {filteredItems.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
          <option value="other">Other</option>
        </select>
        {(itemId === 'other' || (!itemId && customItemName !== '')) && (
          <input value={customItemName} onChange={(e) => setCustomItemName(e.target.value)} placeholder="Enter expense name" className="border p-2 rounded" />
        )}
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="border p-2 rounded" />
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" className="border p-2 rounded md:col-span-2" />
        <button onClick={handleSaveExpense} disabled={!canManage} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">Save Expense</button>
      </div>

      <div className="bg-white rounded shadow p-4 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
        <button onClick={() => loadEntries(holderType, holderId)} className="bg-blue-600 text-white px-4 py-2 rounded">Apply Range</button>
        <button onClick={() => downloadCsv(entries, 'all')} className="bg-green-600 text-white px-4 py-2 rounded">Download CSV</button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">Expenses History ({dateFrom} to {dateTo})</div>
        <div className="px-4 py-3 border-b">
          <label className="block text-sm font-medium mb-1">Search Expenses</label>
          <input
            type="text"
            value={expenseSearch}
            onChange={(e) => setExpenseSearch(e.target.value)}
            placeholder="Search by head, expense, remarks, or entered by..."
            className="border rounded px-3 py-2 text-sm w-full md:max-w-md"
          />
        </div>
        <DataTable
          columns={expenseColumns}
          data={filteredExpenseEntries}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex justify-end">
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(filteredExpenseEntries, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => downloadCsv(entries, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No expense entries found."
        />
        <div className="border-t px-4 py-3 text-right font-semibold">
          Total Expense: <span className="font-bold">PKR {totalExpense.toFixed(2)}</span>
        </div>
      </div>

      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow-lg w-full max-w-xl p-4">
            <h3 className="text-xl font-semibold mb-3">Edit Expense Entry</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="border p-2 rounded" />
              <select value={editHeadId} onChange={(e) => { setEditHeadId(e.target.value); setEditItemId(''); setEditCustomItemName(''); }} className="border p-2 rounded">
                <option value="">Select Expense Head</option>
                {heads.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
              <select value={editItemId} onChange={(e) => { setEditItemId(e.target.value); if (e.target.value !== 'other') setEditCustomItemName(''); }} className="border p-2 rounded">
                <option value="">Select Expense Name</option>
                {items.filter((i) => String(i.headId) === String(editHeadId)).map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
                <option value="other">Other</option>
              </select>
              {(editItemId === 'other' || (!editItemId && editCustomItemName !== '')) && (
                <input value={editCustomItemName} onChange={(e) => setEditCustomItemName(e.target.value)} placeholder="Enter expense name" className="border p-2 rounded" />
              )}
              <input type="number" min={0} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Amount" className="border p-2 rounded" />
              <input value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} placeholder="Remarks" className="border p-2 rounded" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingEntry(null)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={saveEdit} className="px-4 py-2 rounded bg-green-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddExpenses;
