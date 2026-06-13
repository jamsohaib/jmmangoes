import React, { useEffect, useMemo, useState } from 'react';
import DataTable from 'react-data-table-component';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const ManageOwners = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.ownerManagement?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.ownerManagement?.manage;
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [sharePercentage, setSharePercentage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/owners');
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load owners.'));
  }, [canView]);

  const resetForm = () => {
    setName('');
    setContactNumber('');
    setEmail('');
    setSharePercentage('');
    setEditingId('');
  };

  const saveOwner = async () => {
    const share = Number(sharePercentage);
    if (!name.trim() || Number.isNaN(share) || share < 0 || share > 100) {
      return toast.warn('Enter owner name and valid share percentage.');
    }
    try {
      const payload = { name, contactNumber, email, sharePercentage: share };
      if (editingId) {
        await api.put(`/owners/${editingId}`, payload);
      } else {
        await api.post('/owners', payload);
      }
      toast.success(editingId ? 'Owner updated.' : 'Owner added.');
      resetForm();
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save owner.');
    }
  };

  const editOwner = (row) => {
    setEditingId(row._id);
    setName(row.name || '');
    setContactNumber(row.contactNumber || '');
    setEmail(row.email || '');
    setSharePercentage(String(Number(row.sharePercentage || 0)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteOwner = async (row) => {
    if (!window.confirm(`Remove owner ${row.name}?`)) return;
    try {
      await api.delete(`/owners/${row._id}`);
      toast.success('Owner removed.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove owner.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q) ||
      String(row.email || '').toLowerCase().includes(q)
    );
  }, [rows, search]);
  const totalShare = useMemo(() => rows.reduce((sum, row) => sum + Number(row.sharePercentage || 0), 0), [rows]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Owners</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">{editingId ? 'Edit Owner' : 'Add Owner'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Owner name" className="border p-2 rounded" />
          <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Contact number (optional)" className="border p-2 rounded" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="border p-2 rounded" />
          <input type="number" min="0" max="100" step="0.01" value={sharePercentage} onChange={(e) => setSharePercentage(e.target.value)} placeholder="Share %" className="border p-2 rounded" />
          <div className="flex gap-2">
            <button onClick={saveOwner} disabled={!canManage} className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">{editingId ? 'Update' : 'Save'}</button>
            {editingId ? <button onClick={resetForm} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button> : null}
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 border-l-4 border-blue-700">
        <div className="text-sm text-gray-600">Total Owner Share Percentage</div>
        <div className={`text-2xl font-bold ${Math.abs(totalShare - 100) > 0.01 ? 'text-red-700' : 'text-green-700'}`}>{totalShare.toFixed(2)}%</div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Owners</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owners..." className="border p-2 rounded mb-3 w-full md:w-80" />
        <DataTable
          columns={[
            { name: 'Name', selector: (row) => row.name || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', sortable: true, wrap: true },
            { name: 'Email', selector: (row) => row.email || '-', sortable: true, wrap: true },
            { name: 'Share %', selector: (row) => Number(row.sharePercentage || 0), sortable: true, cell: (row) => `${Number(row.sharePercentage || 0).toFixed(2)}%` },
            {
              name: 'Actions',
              minWidth: '150px',
              cell: (row) => (
                <div className="flex flex-wrap gap-2 py-1">
                  <button onClick={() => editOwner(row)} disabled={!canManage} className="bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-60">Edit</button>
                  <button onClick={() => deleteOwner(row)} disabled={!canManage} className="bg-red-700 text-white px-3 py-1 rounded disabled:opacity-60">Remove</button>
                </div>
              ),
            },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          noDataComponent="No owners found."
        />
      </div>
    </div>
  );
};

export default ManageOwners;
