import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyBlockForm = { name: '', code: '', acreage: 1, description: '', isActive: true };
const emptyClusterForm = { name: '', code: '', description: '', isActive: true };

const FarmBlocks = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmBlocks?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmBlocks?.manage;

  const [blocks, setBlocks] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [clusterForm, setClusterForm] = useState(emptyClusterForm);
  const [editingBlockId, setEditingBlockId] = useState('');
  const [editingClusterId, setEditingClusterId] = useState('');
  const [pendingDeleteBlock, setPendingDeleteBlock] = useState(null);

  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [draggingBlockId, setDraggingBlockId] = useState('');
  const [blockToPlaceId, setBlockToPlaceId] = useState('');
  const [focusCreateBlock, setFocusCreateBlock] = useState(false);

  const selectedCluster = useMemo(() => clusters.find((c) => c._id === selectedClusterId) || null, [clusters, selectedClusterId]);

  const clusterBlocks = useMemo(
    () => blocks.filter((b) => String(b.clusterId || '') === String(selectedClusterId || '')).sort((a, b) => Number(a.clusterRow || 9999) - Number(b.clusterRow || 9999) || Number(a.clusterCol || 9999) - Number(b.clusterCol || 9999)),
    [blocks, selectedClusterId]
  );
  const unassignedBlocks = useMemo(() => blocks.filter((b) => !b.clusterId), [blocks]);
  const maxRow = Math.max(1, Number(selectedCluster?.gridRows || 1), ...clusterBlocks.map((b) => Number(b.clusterRow || 0)));
  const maxCol = Math.max(1, Number(selectedCluster?.gridCols || 1), ...clusterBlocks.map((b) => Number(b.clusterCol || 0)));
  const blockBySlot = useMemo(() => {
    const m = new Map();
    clusterBlocks.forEach((b) => {
      if (b.clusterRow && b.clusterCol) m.set(`${b.clusterRow}-${b.clusterCol}`, b);
    });
    return m;
  }, [clusterBlocks]);

  const loadAll = async () => {
    const [blocksRes, clustersRes] = await Promise.all([api.get('/farm/blocks'), api.get('/farm/clusters')]);
    setBlocks(blocksRes.data || []);
    setClusters(clustersRes.data || []);
  };

  useEffect(() => {
    if (!focusCreateBlock) return;
    const el = document.getElementById('create-block-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstInput = el.querySelector('input');
      if (firstInput) firstInput.focus();
    }
    setFocusCreateBlock(false);
  }, [focusCreateBlock]);

  useEffect(() => {
    if (canView) loadAll().catch(() => toast.error('Failed to load farm blocks/clusters'));
  }, [canView]);

  const saveBlock = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editingBlockId) {
        await api.put(`/farm/blocks/${editingBlockId}`, blockForm);
        toast.success('Block updated');
      } else {
        await api.post('/farm/blocks', blockForm);
        toast.success('Block created');
      }
      setBlockForm(emptyBlockForm);
      setEditingBlockId('');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save block');
    }
  };

  const saveCluster = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      if (editingClusterId) {
        await api.put(`/farm/clusters/${editingClusterId}`, clusterForm);
        toast.success('Cluster updated');
      } else {
        await api.post('/farm/clusters', clusterForm);
        toast.success('Cluster created');
      }
      setClusterForm(emptyClusterForm);
      setEditingClusterId('');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save cluster');
    }
  };

  const removeBlock = async (id) => {
    if (!canManage) return;
    const target = blocks.find((b) => b._id === id) || null;
    setPendingDeleteBlock(target || { _id: id, name: 'this block', code: '' });
  };

  const confirmDeleteBlock = async () => {
    if (!pendingDeleteBlock?._id) return;
    try {
      await api.delete(`/farm/blocks/${pendingDeleteBlock._id}`);
      toast.success('Block deleted');
      setPendingDeleteBlock(null);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete block');
    }
  };

  const removeCluster = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Delete this cluster? Blocks will be unassigned from it.')) return;
    try {
      await api.delete(`/farm/clusters/${id}`);
      toast.success('Cluster deleted');
      if (selectedClusterId === id) setSelectedClusterId('');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete cluster');
    }
  };

  const placeBlockAt = async (blockId, row, col, targetClusterId = selectedClusterId) => {
    if (!canManage) return;
    if (!targetClusterId) {
      try {
        await api.put(`/farm/blocks/${blockId}/cluster`, { clusterId: null, clusterRow: null, clusterCol: null });
        toast.success('Block unassigned from cluster');
        await loadAll();
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Failed to unassign block');
      }
      return;
    }
    try {
      await api.put(`/farm/blocks/${blockId}/cluster`, { clusterId: targetClusterId, clusterRow: row, clusterCol: col });
      toast.success('Block placed');
      setBlockToPlaceId('');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to place block');
    }
  };

  const openEditBlock = (b) => {
    setEditingBlockId(b._id);
    setBlockForm({
      name: b.name || '',
      code: b.code || '',
      acreage: b.acreage || 0,
      description: b.description || '',
      isActive: b.isActive !== false,
    });
  };

  const moveBlockAt = async (blockId, row, col) => {
    if (!canManage) return;
    try {
      const occupied = blockBySlot.get(`${row}-${col}`);
      const allowSwap = Boolean(occupied && occupied._id !== blockId);
      if (allowSwap) {
        const ok = window.confirm(`Target has block ${occupied.code}. Swap positions?`);
        if (!ok) return;
      }
      await api.put(`/farm/blocks/${blockId}/cluster-move`, { clusterId: selectedClusterId, clusterRow: row, clusterCol: col, allowSwap });
      toast.success('Block position updated');
      setDraggingBlockId('');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to move block');
    }
  };

  const adjustClusterGrid = async (operation, index) => {
    if (!canManage) return;
    if (!selectedClusterId) return toast.warn('Select cluster first.');
    if (['delete_row', 'delete_col'].includes(operation)) {
      const ok = window.confirm('Deleting row/column will unassign blocks placed there. Continue?');
      if (!ok) return;
    }
    try {
      await api.post('/farm/clusters/grid-adjust', { clusterId: selectedClusterId, operation, index });
      toast.success('Cluster grid updated');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to adjust cluster grid');
    }
  };

  const printBlockQr = (block) => {
    if (!block) return;
    const qrData = String(block.code || block.name || block._id || '').trim();
    if (!qrData) return toast.warn('No block data to print QR.');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&data=${encodeURIComponent(qrData)}`;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Block QR - ${block.code || block.name || ''}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { margin: 0; font-family: Arial, sans-serif; color: #111; }
      .page { width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      .card { text-align: center; width: 100%; }
      .title { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
      .subtitle { font-size: 20px; margin-bottom: 14px; color: #333; }
      .qr-wrap { display: flex; justify-content: center; }
      .qr { width: 72vh; max-width: 88vw; max-height: 72vh; border: 2px solid #111; padding: 12px; box-sizing: border-box; }
      .code { margin-top: 12px; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="title">JM Mangoes Farm</div>
        <div class="subtitle">Block QR Code</div>
        <div class="qr-wrap">
          <img class="qr" src="${qrUrl}" alt="Block QR" />
        </div>
        <div class="code">${(block.code || '-')}${block.name ? ` - ${block.name}` : ''}</div>
      </div>
    </div>
    <script>window.onload=function(){window.print();}</script>
  </body>
</html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Popup blocked. Please allow popups.');
    win.document.write(html);
    win.document.close();
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Land Blocks</h2>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Cluster Management</h3>
        <form onSubmit={saveCluster} className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <input className="border p-2 rounded" placeholder="Cluster Name" value={clusterForm.name} onChange={(e) => setClusterForm({ ...clusterForm, name: e.target.value })} required />
          <input className="border p-2 rounded" placeholder="Cluster Code" value={clusterForm.code} onChange={(e) => setClusterForm({ ...clusterForm, code: e.target.value })} required />
          <input className="border p-2 rounded md:col-span-2" placeholder="Description (optional)" value={clusterForm.description} onChange={(e) => setClusterForm({ ...clusterForm, description: e.target.value })} />
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!clusterForm.isActive} onChange={(e) => setClusterForm({ ...clusterForm, isActive: e.target.checked })} />Active</label>
          <div className="flex gap-2">
            <button className="bg-green-600 text-white px-3 py-2 rounded">{editingClusterId ? 'Update Cluster' : 'Create Cluster'}</button>
            {editingClusterId ? <button type="button" className="px-3 py-2 rounded border" onClick={() => { setEditingClusterId(''); setClusterForm(emptyClusterForm); }}>Cancel</button> : null}
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1">Name</th>
                <th className="border px-2 py-1">Code</th>
                <th className="border px-2 py-1">Grid</th>
                <th className="border px-2 py-1">Status</th>
                <th className="border px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c._id}>
                  <td className="border px-2 py-1">{c.name}</td>
                  <td className="border px-2 py-1">{c.code}</td>
                  <td className="border px-2 py-1">{c.gridRows} x {c.gridCols}</td>
                  <td className="border px-2 py-1">{c.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="border px-2 py-1">
                    <div className="flex gap-2">
                      <button type="button" className="text-blue-600 hover:underline" onClick={() => { setEditingClusterId(c._id); setClusterForm({ name: c.name || '', code: c.code || '', description: c.description || '', isActive: c.isActive !== false }); }}>Edit</button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => removeCluster(c._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4">
        <h3 className="text-lg font-semibold mb-2">Blocks Map by Cluster</h3>
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <div>
            <label className="text-sm font-medium">Select Cluster</label>
            <select className="w-full md:w-80 border rounded p-2 mt-1" value={selectedClusterId} onChange={(e) => setSelectedClusterId(e.target.value)}>
              <option value="">Select Cluster</option>
              {clusters.map((c) => <option key={c._id} value={c._id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Block to Place in Empty Slot</label>
            <select className="w-full md:w-80 border rounded p-2 mt-1" value={blockToPlaceId} onChange={(e) => setBlockToPlaceId(e.target.value)}>
              <option value="">Select Unassigned Block</option>
              {unassignedBlocks.map((b) => <option key={b._id} value={b._id}>{b.code} - {b.name}</option>)}
            </select>
          </div>
          <button type="button" className="px-3 py-2 rounded border border-green-700 text-green-700" onClick={() => loadAll()}>Refresh Map</button>
        </div>

        {selectedClusterId ? (
          <div className="overflow-auto">
            <div className="inline-block border rounded">
              <div className="flex items-center justify-between p-2 bg-gray-50 border-b">
                <button type="button" className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs" onClick={() => adjustClusterGrid('append_row', maxRow)}>Add Row Below Last</button>
                <button type="button" className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs" onClick={() => adjustClusterGrid('append_col', maxCol)}>Add Column Right of Last</button>
              </div>
              <div className="flex">
                <div className="w-40 border-r bg-gray-100 p-1 text-xs font-semibold">Row / Actions</div>
                {Array.from({ length: maxCol }).map((_, cIdx) => {
                  const col = cIdx + 1;
                  return (
                    <div key={`c-${col}`} className="w-24 border-r p-1 text-[10px] bg-gray-100">
                      <div className="text-center font-semibold mb-1">Col {col}</div>
                      <div className="flex flex-col gap-1">
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustClusterGrid('add_col_left', col)}>+ Left</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustClusterGrid('add_col_right', col)}>+ Right</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-red-100 text-red-700" onClick={() => adjustClusterGrid('delete_col', col)}>Del Col</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Array.from({ length: maxRow }).map((_, rIdx) => {
                const row = rIdx + 1;
                return (
                  <div key={`r-${row}`} className="flex">
                    <div className="w-40 border-r p-1 text-[10px] bg-gray-50">
                      <div className="font-semibold mb-1">Row {row}</div>
                      <div className="flex flex-col gap-1">
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustClusterGrid('add_row_top', row)}>+ Top</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustClusterGrid('add_row_bottom', row)}>+ Bottom</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-red-100 text-red-700" onClick={() => adjustClusterGrid('delete_row', row)}>Del Row</button>
                      </div>
                    </div>
                    {Array.from({ length: maxCol }).map((__, cIdx) => {
                      const col = cIdx + 1;
                      const block = blockBySlot.get(`${row}-${col}`);
                      return (
                        <div
                          key={`${row}-${col}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => draggingBlockId ? moveBlockAt(draggingBlockId, row, col) : null}
                          className={`w-24 h-24 border flex flex-col items-center justify-center text-xs ${block ? 'bg-green-50' : 'bg-gray-50'}`}
                        >
                          <div className="text-[9px] text-gray-500">R{row} C{col}</div>
                          {block ? (
                            <div
                              draggable={canManage}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', block._id);
                                setDraggingBlockId(block._id);
                              }}
                              onDragEnd={() => setDraggingBlockId('')}
                              className="cursor-move text-center"
                            >
                              <div className="font-semibold text-[11px]">{block.code}</div>
                              <div className="text-[9px] text-gray-600">{block.name}</div>
                              <div className="flex flex-wrap gap-1 justify-center mt-1">
                                <button
                                  type="button"
                                  className="text-[9px] text-blue-700 hover:underline"
                                  onClick={() => openEditBlock(block)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-[9px] text-emerald-700 hover:underline"
                                  onClick={() => printBlockQr(block)}
                                >
                                  Print QR
                                </button>
                                <button
                                  type="button"
                                  className="text-[9px] text-amber-700 hover:underline"
                                  onClick={() => placeBlockAt(block._id, null, null, null)}
                                >
                                  Del Map
                                </button>
                                <button
                                  type="button"
                                  className="text-[9px] text-red-700 hover:underline"
                                  onClick={() => removeBlock(block._id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center">
                              <button
                                type="button"
                                className="text-green-700 text-[9px] hover:underline"
                                onClick={() => {
                                  if (blockToPlaceId) {
                                    placeBlockAt(blockToPlaceId, row, col);
                                    return;
                                  }
                                  setEditingBlockId('');
                                  setBlockForm(emptyBlockForm);
                                  setFocusCreateBlock(true);
                                  toast.info('Create a new block first, then select it to place on the map.');
                                }}
                              >
                                Add Block
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">Select a cluster to view/manage block map.</p>
        )}
      </div>

      <form id="create-block-form" onSubmit={saveBlock} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <input className="border p-2 rounded" placeholder="Block Name" value={blockForm.name} onChange={(e) => setBlockForm({ ...blockForm, name: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Block Code" value={blockForm.code} onChange={(e) => setBlockForm({ ...blockForm, code: e.target.value })} required />
        <input type="number" min="0" step="0.1" className="border p-2 rounded" placeholder="Acreage" value={blockForm.acreage} onChange={(e) => setBlockForm({ ...blockForm, acreage: e.target.value })} />
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!blockForm.isActive} onChange={(e) => setBlockForm({ ...blockForm, isActive: e.target.checked })} />Active</label>
        <textarea className="border p-2 rounded md:col-span-2" placeholder="Description" value={blockForm.description} onChange={(e) => setBlockForm({ ...blockForm, description: e.target.value })} />
        <div className="md:col-span-2 flex gap-2">
          <button className="bg-green-600 text-white px-4 py-2 rounded">{editingBlockId ? 'Update Block' : 'Create Block'}</button>
          {editingBlockId ? <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditingBlockId(''); setBlockForm(emptyBlockForm); }}>Cancel Edit</button> : null}
        </div>
      </form>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Code</th>
              <th className="border px-3 py-2">Acreage</th>
              <th className="border px-3 py-2">Cluster</th>
              <th className="border px-3 py-2">Map Position</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b._id}>
                <td className="border px-3 py-2">{b.name}</td>
                <td className="border px-3 py-2">{b.code}</td>
                <td className="border px-3 py-2">{b.acreage}</td>
                <td className="border px-3 py-2">{b.clusterName || '-'}</td>
                <td className="border px-3 py-2">{b.clusterRow && b.clusterCol ? `R${b.clusterRow} C${b.clusterCol}` : '-'}</td>
                <td className="border px-3 py-2">{b.isActive ? 'Active' : 'Inactive'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => openEditBlock(b)}>Edit</button>
                    {b.clusterId ? <button type="button" className="text-amber-700 hover:underline" onClick={() => placeBlockAt(b._id, null, null, null)}>Unassign</button> : null}
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removeBlock(b._id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!blocks.length ? <tr><td colSpan="7" className="border px-3 py-4 text-center text-gray-500">No blocks found.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {pendingDeleteBlock ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow w-full max-w-md p-4">
            <h3 className="text-lg font-semibold mb-2 text-red-700">Confirm Block Deletion</h3>
            <p className="text-sm text-gray-700 mb-3">
              You are about to permanently delete block{' '}
              <span className="font-semibold">
                {pendingDeleteBlock.code ? `${pendingDeleteBlock.code} - ` : ''}
                {pendingDeleteBlock.name}
              </span>.
            </p>
            <p className="text-xs text-gray-600 mb-4">
              This action cannot be undone and related references may be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => setPendingDeleteBlock(null)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 rounded bg-red-600 text-white" onClick={confirmDeleteBlock}>
                Delete Block
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FarmBlocks;
