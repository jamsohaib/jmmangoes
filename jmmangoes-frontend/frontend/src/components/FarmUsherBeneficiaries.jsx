import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const FarmUsherBeneficiaries = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmUsherBeneficiaries?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmUsherBeneficiaries?.manage;
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [isRelative, setIsRelative] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/farm/usher/beneficiaries');
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load beneficiaries.'));
  }, [canView]);

  const resetForm = () => {
    setName('');
    setContactNumber('');
    setAddress('');
    setIsRelative(false);
    setEditingId('');
  };

  const saveBeneficiary = async () => {
    if (!name.trim()) return toast.warn('Beneficiary name is required.');
    try {
      const payload = { name, contactNumber, address, isRelative };
      if (editingId) {
        await api.put(`/farm/usher/beneficiaries/${editingId}`, payload);
      } else {
        await api.post('/farm/usher/beneficiaries', payload);
      }
      toast.success(editingId ? 'Beneficiary updated.' : 'Beneficiary added.');
      resetForm();
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save beneficiary.');
    }
  };

  const editRow = (row) => {
    setEditingId(row._id);
    setName(row.name || '');
    setContactNumber(row.contactNumber || '');
    setAddress(row.address || '');
    setIsRelative(Boolean(row.isRelative));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleRow = async (row) => {
    try {
      await api.put(`/farm/usher/beneficiaries/${row._id}/toggle`, {});
      toast.success(row.isActive ? 'Beneficiary marked inactive.' : 'Beneficiary marked active.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update beneficiary status.');
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm(`Remove beneficiary ${row.name}?`)) return;
    try {
      await api.delete(`/farm/usher/beneficiaries/${row._id}`);
      toast.success('Beneficiary removed.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove beneficiary.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q) ||
      String(row.address || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Usher Beneficiary Management</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">{editingId ? 'Edit Beneficiary' : 'Add Beneficiary'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Beneficiary name" className="border p-2 rounded" />
          <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Contact number (optional)" className="border p-2 rounded" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" className="border p-2 rounded" />
          <label className="flex items-center gap-2 border rounded px-3 py-2">
            <input type="checkbox" checked={isRelative} onChange={(e) => setIsRelative(e.target.checked)} />
            Is Relative
          </label>
          <div className="flex gap-2">
            <button onClick={saveBeneficiary} disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">{editingId ? 'Update' : 'Save'}</button>
            {editingId ? <button onClick={resetForm} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button> : null}
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Beneficiaries</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search beneficiaries..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { name: 'Name', selector: (row) => row.name || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', sortable: true, wrap: true },
            { name: 'Address', selector: (row) => row.address || '-', sortable: true, wrap: true, grow: 2 },
            { name: 'Relative', selector: (row) => row.isRelative ? 'Yes' : 'No', sortable: true },
            { name: 'Status', selector: (row) => row.isActive ? 'Active' : 'Inactive', sortable: true },
            {
              name: 'Actions',
              minWidth: '230px',
              cell: (row) => (
                <div className="flex flex-wrap gap-2 py-1">
                  <button onClick={() => editRow(row)} disabled={!canManage} className="bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-60">Edit</button>
                  <button onClick={() => toggleRow(row)} disabled={!canManage} className="bg-orange-700 text-white px-3 py-1 rounded disabled:opacity-60">{row.isActive ? 'Inactive' : 'Active'}</button>
                  <button onClick={() => deleteRow(row)} disabled={!canManage} className="bg-red-700 text-white px-3 py-1 rounded disabled:opacity-60">Remove</button>
                </div>
              ),
            },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No beneficiaries found."
        />
      </div>
    </div>
  );
};

export default FarmUsherBeneficiaries;
