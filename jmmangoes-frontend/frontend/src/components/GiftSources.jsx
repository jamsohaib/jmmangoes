import React, { useEffect, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyForm = { name: '', relation: '', contactNumber: '', isActive: true };

const GiftSources = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.giftSourceManagement?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.giftSourceManagement?.manage;
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    const res = await api.get('/gift-sources');
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) loadRows().catch(() => toast.error('Failed to load gift sources.'));
  }, [canView]);

  const save = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editing?._id) {
        await api.put(`/gift-sources/${editing._id}`, form);
        toast.success('Gift source updated.');
      } else {
        await api.post('/gift-sources', form);
        toast.success('Gift source added.');
      }
      setForm(emptyForm);
      setEditing(null);
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save gift source.');
    }
  };

  const edit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      relation: row.relation || '',
      contactNumber: row.contactNumber || '',
      isActive: row.isActive !== false,
    });
  };

  const remove = async (row) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm(`Delete "${row.name}"? Used sources cannot be deleted.`)) return;
    try {
      await api.delete(`/gift-sources/${row._id}`);
      toast.success('Gift source deleted.');
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete gift source.');
    }
  };

  const filteredRows = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(row.name || '').toLowerCase().includes(q) ||
      String(row.relation || '').toLowerCase().includes(q) ||
      String(row.contactNumber || '').toLowerCase().includes(q);
  });

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Gift Sources / Family Members</h2>

      <form onSubmit={save} className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border p-2 rounded w-full" placeholder="Family member name" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Relation</label>
          <input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} className="border p-2 rounded w-full" placeholder="Owner / Family / Friend" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contact</label>
          <input value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} className="border p-2 rounded w-full" placeholder="Optional contact" />
        </div>
        <div className="flex items-center">
          <label className="inline-flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>
        </div>
        <div className="flex items-end gap-2">
          <button disabled={!canManage} className="bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded w-full">
            {editing ? 'Update' : 'Add'}
          </button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }} className="border px-4 py-2 rounded">Cancel</button>}
        </div>
      </form>

      <div className="bg-white rounded shadow">
        <DataTable
          title="Authorized Gift Sources"
          columns={[
            { name: 'Name', selector: (row) => row.name || '-', sortable: true, wrap: true },
            { name: 'Relation', selector: (row) => row.relation || '-', sortable: true, wrap: true },
            { name: 'Contact', selector: (row) => row.contactNumber || '-', wrap: true },
            { name: 'Status', selector: (row) => row.isActive ? 'Active' : 'Inactive', sortable: true },
            { name: 'Created By', selector: (row) => row.createdByName || '-', wrap: true },
            {
              name: 'Actions',
              minWidth: '170px',
              cell: (row) => (
                <div className="flex gap-2">
                  <button disabled={!canManage} onClick={() => edit(row)} className="bg-blue-600 disabled:bg-gray-400 text-white px-2 py-1 rounded text-xs">Edit</button>
                  <button disabled={!canManage} onClick={() => remove(row)} className="bg-red-600 disabled:bg-gray-400 text-white px-2 py-1 rounded text-xs">Delete</button>
                </div>
              ),
            },
          ]}
          data={filteredRows}
          pagination
          dense
          highlightOnHover
          subHeader
          subHeaderComponent={<input value={search} onChange={(e) => setSearch(e.target.value)} className="border rounded px-3 py-2 w-full md:max-w-sm" placeholder="Search gift sources..." />}
          noDataComponent="No gift sources added."
        />
      </div>
    </div>
  );
};

export default GiftSources;
