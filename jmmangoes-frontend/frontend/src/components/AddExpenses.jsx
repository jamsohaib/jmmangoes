import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from 'react-data-table-component';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);
const lastWeekStartISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
})();

const CASH_DEPOSIT_METHOD_ID = 'deposited_in_cash';

const AddExpenses = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.addExpense?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.addExpense?.manage;
  const isSuperUser = user?.role === 'admin';
  const [holders, setHolders] = useState({ sites: [], warehouses: [], wholesellers: [] });
  const [heads, setHeads] = useState([]);
  const [items, setItems] = useState([]);
  const [entries, setEntries] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [cashPosition, setCashPosition] = useState(null);
  const [cashDeposits, setCashDeposits] = useState([]);

  const [holderType, setHolderType] = useState('site');
  const [holderId, setHolderId] = useState('');
  const [entryDate, setEntryDate] = useState(todayISO);
  const [headId, setHeadId] = useState('');
  const [itemId, setItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dateFrom, setDateFrom] = useState(lastWeekStartISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editHeadId, setEditHeadId] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editCustomItemName, setEditCustomItemName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editDate, setEditDate] = useState(todayISO);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [depositDate, setDepositDate] = useState(todayISO);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPaymentMethodId, setDepositPaymentMethodId] = useState(CASH_DEPOSIT_METHOD_ID);
  const [depositRemarks, setDepositRemarks] = useState('');
  const [editingDeposit, setEditingDeposit] = useState(null);
  const [editDepositDate, setEditDepositDate] = useState(todayISO);
  const [editDepositAmount, setEditDepositAmount] = useState('');
  const [editDepositPaymentMethodId, setEditDepositPaymentMethodId] = useState(CASH_DEPOSIT_METHOD_ID);
  const [editDepositRemarks, setEditDepositRemarks] = useState('');

  const loadMasters = async () => {
    const [holdersRes, headsRes, itemsRes, paymentMethodsRes] = await Promise.all([
      api.get('/expenses/holders'),
      api.get('/expense-heads/for-entry'),
      api.get('/expense-items'),
      api.get('/cash-deposits/payment-methods'),
    ]);
    const h = holdersRes.data || { sites: [], warehouses: [], wholesellers: [] };
    setHolders(h);
    setHeads(headsRes.data || []);
    setItems(itemsRes.data || []);
    const methods = paymentMethodsRes.data || [];
    setPaymentMethods(methods);
    if (!depositPaymentMethodId) setDepositPaymentMethodId(CASH_DEPOSIT_METHOD_ID);
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

  const loadCashData = async (targetHolderType = holderType, targetHolderId = holderId) => {
    if (!targetHolderId) {
      setCashPosition(null);
      setCashDeposits([]);
      return;
    }
    const [positionRes, depositsRes] = await Promise.all([
      api.get('/cash-deposits/position', { params: { holderType: targetHolderType, holderId: targetHolderId } }),
      api.get('/cash-deposits', { params: { holderType: targetHolderType, holderId: targetHolderId } }),
    ]);
    setCashPosition(positionRes.data || null);
    setCashDeposits(depositsRes.data || []);
  };

  useEffect(() => {
    if (canView) loadMasters().catch(console.error);
  }, [canView]);

  useEffect(() => {
    if (canView && holderId) loadEntries(holderType, holderId).catch(console.error);
  }, [canView, holderType, holderId, dateFrom, dateTo]);

  useEffect(() => {
    if (canView && holderId) loadCashData(holderType, holderId).catch(console.error);
  }, [canView, holderType, holderId]);

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
      await loadCashData(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save expense entry.');
    }
  };

  const handleSaveDeposit = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const value = Number(depositAmount);
    if (!holderId || !depositPaymentMethodId || Number.isNaN(value) || value <= 0) {
      return toast.warn('Select holder, account, and valid deposit amount.');
    }
    const accountLabel = depositPaymentMethodId === CASH_DEPOSIT_METHOD_ID
      ? 'Deposited in Cash'
      : (paymentMethods.find((m) => String(m._id) === String(depositPaymentMethodId))?.name || 'selected account');
    if (!window.confirm(`Post PKR ${value.toFixed(2)} as deposited to "${accountLabel}" for company verification?`)) return;
    try {
      await api.post('/cash-deposits', {
        holderType,
        holderId,
        date: depositDate,
        amount: value,
        paymentMethodId: depositPaymentMethodId,
        remarks: depositRemarks,
      });
      toast.success('Cash deposit posted for company verification.');
      setDepositAmount('');
      setDepositRemarks('');
      await loadCashData(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to post cash deposit.');
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
  const pendingDepositRows = useMemo(
    () => cashDeposits.filter((row) => row.status === 'pending'),
    [cashDeposits]
  );

  const canEditDeposit = (row) => {
    if (!canManage || row.status !== 'pending') return false;
    if (isSuperUser) return true;
    return row.submittedBy && String(row.submittedBy) === String(user?._id || user?.id);
  };

  const openDepositEdit = (row) => {
    setEditingDeposit(row);
    setEditDepositDate(new Date(row.date || row.createdAt).toISOString().slice(0, 10));
    setEditDepositAmount(String(row.amount ?? ''));
    setEditDepositPaymentMethodId(row.paymentMethodId || CASH_DEPOSIT_METHOD_ID);
    setEditDepositRemarks(row.remarks || '');
  };

  const saveDepositEdit = async () => {
    if (!editingDeposit) return;
    const value = Number(editDepositAmount);
    if (Number.isNaN(value) || value <= 0 || !editDepositPaymentMethodId) return toast.warn('Enter valid deposit edit details.');
    const accountLabel = editDepositPaymentMethodId === CASH_DEPOSIT_METHOD_ID
      ? 'Deposited in Cash'
      : (paymentMethods.find((m) => String(m._id) === String(editDepositPaymentMethodId))?.name || 'selected account');
    if (!window.confirm(`Update pending deposit to PKR ${value.toFixed(2)} via "${accountLabel}"?`)) return;
    try {
      await api.put(`/cash-deposits/${editingDeposit._id}`, {
        date: editDepositDate,
        amount: value,
        paymentMethodId: editDepositPaymentMethodId,
        remarks: editDepositRemarks,
      });
      toast.success('Pending deposit updated.');
      setEditingDeposit(null);
      await loadCashData(holderType, holderId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update pending deposit.');
    }
  };
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
      await loadCashData(holderType, holderId);
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
      await loadCashData(holderType, holderId);
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-700">
          <div className="text-sm text-gray-500">Total Sales</div>
          <div className="text-lg font-bold">PKR {Number(cashPosition?.salesAmount || 0).toFixed(2)}</div>
          <div className="text-xs text-gray-600">All received sales for selected holder</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-600">
          <div className="text-sm text-gray-500">Total Expenses</div>
          <div className="text-lg font-bold">PKR {Number(cashPosition?.expenseAmount || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-700">
          <div className="text-sm text-gray-500">Accepted Deposits</div>
          <div className="text-lg font-bold">PKR {Number(cashPosition?.acceptedDepositAmount || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-amber-600">
          <div className="text-sm text-gray-500">Pending Verification</div>
          <div className="text-lg font-bold">PKR {Number(cashPosition?.pendingDepositAmount || 0).toFixed(2)}</div>
          <div className="text-xs text-gray-600">{Number(cashPosition?.pendingDepositCount || 0)} deposit(s)</div>
        </div>
        <div className="bg-white rounded shadow p-4 border-l-4 border-gray-900">
          <div className="text-sm text-gray-500">Net Cash In Hand</div>
          <div className="text-lg font-bold">PKR {Number(cashPosition?.cashAvailable || 0).toFixed(2)}</div>
          <div className="text-xs text-gray-600">Pending deposits are excluded</div>
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

      <div className="bg-white rounded shadow p-4 mb-5">
        <h3 className="text-lg font-semibold mb-3">Deposit Cash Back To Company Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Deposit Date</label>
            <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Company Account</label>
            <select value={depositPaymentMethodId} onChange={(e) => setDepositPaymentMethodId(e.target.value)} className="w-full border p-2 rounded">
              <option value={CASH_DEPOSIT_METHOD_ID}>Deposited in Cash</option>
              {paymentMethods.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount Deposited</label>
            <input type="number" min={0} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Amount" className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Remarks</label>
            <input value={depositRemarks} onChange={(e) => setDepositRemarks(e.target.value)} placeholder="Bank slip / notes" className="w-full border p-2 rounded" />
          </div>
          <div className="flex items-end">
            <button onClick={handleSaveDeposit} disabled={!canManage} className="w-full bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60">Post Deposit</button>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-2">Posted deposits move to pending verification and are not counted in cash in hand while waiting for company approval.</p>
      </div>

      <div className="bg-white rounded shadow mb-5 overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold">Cash Deposits Pending Verification</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Remarks</th>
              <th className="text-left px-3 py-2">Posted By</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingDepositRows.map((row) => (
              <tr key={row._id} className="border-t">
                <td className="px-3 py-2">{new Date(row.date).toLocaleDateString()}</td>
                <td className="px-3 py-2">{row.paymentMethodName}</td>
                <td className="px-3 py-2 text-right">PKR {Number(row.amount || 0).toFixed(2)}</td>
                <td className="px-3 py-2">{row.remarks || '-'}</td>
                <td className="px-3 py-2">{row.submittedByName || '-'}</td>
                <td className="px-3 py-2">
                  {canEditDeposit(row) ? (
                    <button onClick={() => openDepositEdit(row)} className="text-blue-700 hover:underline">Edit Pending</button>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!pendingDepositRows.length && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-500">No pending deposits for this holder.</td></tr>
            )}
          </tbody>
        </table>
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

      {editingDeposit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow-lg w-full max-w-xl p-4">
            <h3 className="text-xl font-semibold mb-3">Edit Pending Company Deposit</h3>
            <p className="text-sm text-gray-600 mb-3">Only pending deposits can be edited before company cash register verification.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Deposit Date</label>
                <input type="date" value={editDepositDate} onChange={(e) => setEditDepositDate(e.target.value)} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company Account</label>
                <select value={editDepositPaymentMethodId} onChange={(e) => setEditDepositPaymentMethodId(e.target.value)} className="w-full border p-2 rounded">
                  <option value={CASH_DEPOSIT_METHOD_ID}>Deposited in Cash</option>
                  {paymentMethods.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount Deposited</label>
                <input type="number" min={0} value={editDepositAmount} onChange={(e) => setEditDepositAmount(e.target.value)} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Remarks</label>
                <input value={editDepositRemarks} onChange={(e) => setEditDepositRemarks(e.target.value)} className="w-full border p-2 rounded" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingDeposit(null)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={saveDepositEdit} className="px-4 py-2 rounded bg-blue-700 text-white">Update Pending Deposit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddExpenses;
