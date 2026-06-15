import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const today = new Date().toISOString().slice(0, 10);
const toDateInput = (value) => {
  if (!value) return today;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return today;
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};
const money = (value) => `PKR ${Number(value || 0).toFixed(2)}`;

const FarmUsherEntries = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmUsherEntries?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmUsherEntries?.manage;
  const isSuperAdmin = user?.role === 'admin';
  const [years, setYears] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [rows, setRows] = useState([]);
  const [date, setDate] = useState(today);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [personName, setPersonName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');

  const loadYears = async () => {
    const [yearsRes, beneficiariesRes] = await Promise.all([
      api.get('/financial-years'),
      api.get('/farm/usher/beneficiaries', { params: { activeOnly: true } }),
    ]);
    const yearRows = yearsRes.data || [];
    setYears(yearRows);
    setBeneficiaries(beneficiariesRes.data || []);
    if (!financialYearId) {
      const current = yearRows.find((row) => row.isCurrent) || yearRows[0];
      if (current?._id) setFinancialYearId(current._id);
    }
  };

  const loadEntries = async () => {
    if (!financialYearId) return;
    const res = await api.get('/farm/usher/entries', { params: { financialYearId } });
    setRows(res.data?.rows || []);
  };

  useEffect(() => {
    if (canView) loadYears().catch(() => toast.error('Failed to load financial years.'));
  }, [canView]);

  useEffect(() => {
    if (canView && financialYearId) loadEntries().catch(() => toast.error('Failed to load Usher entries.'));
  }, [canView, financialYearId]);

  const resetForm = () => {
    setDate(today);
    setBeneficiaryId('');
    setPersonName('');
    setContactNumber('');
    setAmount('');
    setDetails('');
    setEditingId('');
  };

  const saveEntry = async () => {
    const value = Number(amount);
    const manualOther = beneficiaryId === 'other';
    if (!financialYearId || !date || !beneficiaryId || (manualOther && !personName.trim()) || Number.isNaN(value) || value < 0) {
      return toast.warn('Select financial year, date, beneficiary, and valid amount.');
    }
    try {
      const payload = { financialYearId, date, beneficiaryId, personName, contactNumber, amount: value, details };
      if (editingId) {
        await api.put(`/farm/usher/entries/${editingId}`, payload);
      } else {
        await api.post('/farm/usher/entries', payload);
      }
      toast.success(editingId ? 'Usher entry updated.' : 'Usher entry saved.');
      resetForm();
      await loadEntries();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save Usher entry.');
    }
  };

  const editEntry = (row) => {
    setEditingId(row._id);
    setFinancialYearId(String(row.financialYearId || financialYearId));
    setBeneficiaryId(row.beneficiaryId ? String(row.beneficiaryId) : 'other');
    setDate(toDateInput(row.date));
    setPersonName(row.personName || '');
    setContactNumber(row.contactNumber || '');
    setAmount(String(Number(row.amount || 0)));
    setDetails(row.details || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteEntry = async (row) => {
    if (!window.confirm(`Delete Usher entry of ${money(row.amount)} for ${row.personName}?`)) return;
    try {
      await api.delete(`/farm/usher/entries/${row._id}`);
      toast.success('Usher entry deleted.');
      if (editingId === row._id) resetForm();
      await loadEntries();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete Usher entry.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.personName || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q) ||
      String(row.details || '').toLowerCase().includes(q) ||
      String(row.enteredByName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);
  const totalPaid = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), [rows]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Add Usher Entries</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">{editingId ? 'Edit Usher Entry' : 'Add Usher Entry'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)} className="border p-2 rounded">
            <option value="">Select financial year</option>
            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border p-2 rounded" />
          <select value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} className="border p-2 rounded">
            <option value="">Select beneficiary</option>
            {beneficiaries.map((row) => <option key={row._id} value={row._id}>{row.name}{row.isRelative ? ' (Relative)' : ''}</option>)}
            <option value="other">Other / Not in list</option>
          </select>
          {beneficiaryId === 'other' ? (
            <>
              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Person name" className="border p-2 rounded" />
              <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Contact number (optional)" className="border p-2 rounded" />
            </>
          ) : null}
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount given" className="border p-2 rounded" />
          <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details" className="border p-2 rounded md:col-span-2" />
          <div className="flex flex-wrap gap-2">
            <button onClick={saveEntry} disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">{editingId ? 'Update Entry' : 'Save Entry'}</button>
            {editingId ? <button onClick={resetForm} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel Edit</button> : null}
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 border-l-4 border-green-700">
        <div className="text-sm text-gray-600">Total Usher Paid In Selected Financial Year</div>
        <div className="text-2xl font-bold">{money(totalPaid)}</div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Usher Entry History</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { id: 'date', name: 'Date', selector: (row) => row.date ? new Date(row.date).toLocaleString() : '-', sortable: true, wrap: true },
            { name: 'Person', selector: (row) => row.personName || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', sortable: true, wrap: true },
            { name: 'Amount', selector: (row) => Number(row.amount || 0), sortable: true, cell: (row) => money(row.amount) },
            { name: 'Details', selector: (row) => row.details || '-', wrap: true },
            { name: 'Entered By', selector: (row) => row.enteredByName || '-', sortable: true, wrap: true },
            {
              name: 'Actions',
              minWidth: '160px',
              cell: (row) => (
                <div className="flex flex-wrap gap-2 py-1">
                  <button onClick={() => editEntry(row)} disabled={!canManage} className="bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-60">Edit</button>
                  {isSuperAdmin ? <button onClick={() => deleteEntry(row)} className="bg-red-700 text-white px-3 py-1 rounded">Delete</button> : null}
                </div>
              ),
            },
          ]}
          data={filteredRows}
          defaultSortFieldId="date"
          defaultSortAsc={false}
          pagination
          dense
          highlightOnHover
          noDataComponent="No Usher entries found."
        />
      </div>
    </div>
  );
};

export default FarmUsherEntries;
