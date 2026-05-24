import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const blank = {
  blockId: '',
  treeCode: '',
  treeId: '',
  qrCodeData: '',
  rowNumber: '',
  rowTreeNumber: '',
  latitude: '',
  longitude: '',
  ageYears: '',
  varietiesText: '',
  plantingDate: '',
  isActive: true,
};

const FarmTrees = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmTrees?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmTrees?.manage;
  const [clusters, setClusters] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [trees, setTrees] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [draggingTreeId, setDraggingTreeId] = useState('');
  const [dropHoverSlot, setDropHoverSlot] = useState('');
  const [generatorRows, setGeneratorRows] = useState('');
  const [generatorTreesPerRow, setGeneratorTreesPerRow] = useState('');
  const [searchTreeCode, setSearchTreeCode] = useState('');
  const [searchQrCode, setSearchQrCode] = useState('');
  const navigate = useNavigate();

  const selectedCluster = useMemo(() => clusters.find((c) => c._id === selectedClusterId) || null, [clusters, selectedClusterId]);
  const clusterBlocks = useMemo(
    () => blocks.filter((b) => String(b.clusterId || '') === String(selectedClusterId || '')),
    [blocks, selectedClusterId]
  );
  const clusterRows = useMemo(
    () => Math.max(1, Number(selectedCluster?.gridRows || 1), ...clusterBlocks.map((b) => Number(b.clusterRow || 0))),
    [selectedCluster, clusterBlocks]
  );
  const clusterCols = useMemo(
    () => Math.max(1, Number(selectedCluster?.gridCols || 1), ...clusterBlocks.map((b) => Number(b.clusterCol || 0))),
    [selectedCluster, clusterBlocks]
  );
  const clusterBlockBySlot = useMemo(() => {
    const map = new Map();
    clusterBlocks.forEach((b) => {
      if (b.clusterRow && b.clusterCol) map.set(`${b.clusterRow}-${b.clusterCol}`, b);
    });
    return map;
  }, [clusterBlocks]);

  const selectedBlockObj = useMemo(() => blocks.find((b) => b._id === selectedBlock) || null, [blocks, selectedBlock]);
  const filteredTrees = useMemo(() => (selectedBlock ? trees.filter((t) => String(t.blockId) === String(selectedBlock)) : trees), [trees, selectedBlock]);
  const orderedTrees = useMemo(
    () => [...filteredTrees].sort((a, b) => {
      const aRow = Number(a.rowNumber || 999999);
      const bRow = Number(b.rowNumber || 999999);
      if (aRow !== bRow) return aRow - bRow;
      const aPos = Number(a.rowTreeNumber || 999999);
      const bPos = Number(b.rowTreeNumber || 999999);
      if (aPos !== bPos) return aPos - bPos;
      return String(a.treeCode || '').localeCompare(String(b.treeCode || ''));
    }),
    [filteredTrees]
  );
  const maxRow = useMemo(
    () => Math.max(1, Number(selectedBlockObj?.gridRows || 1), ...filteredTrees.map((t) => Number(t.rowNumber || 0))),
    [filteredTrees, selectedBlockObj]
  );
  const maxPos = useMemo(
    () => Math.max(1, Number(selectedBlockObj?.gridCols || 1), ...filteredTrees.map((t) => Number(t.rowTreeNumber || 0))),
    [filteredTrees, selectedBlockObj]
  );

  const mapBySlot = useMemo(() => {
    const map = new Map();
    filteredTrees.forEach((t) => {
      if (t.rowNumber && t.rowTreeNumber) map.set(`${t.rowNumber}-${t.rowTreeNumber}`, t);
    });
    return map;
  }, [filteredTrees]);

  const qrPreview = useMemo(() => {
    const value = form.qrCodeData || `${form.treeCode || ''}|${form.treeId || ''}`;
    return value ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}` : '';
  }, [form.qrCodeData, form.treeCode, form.treeId]);

  const loadData = async () => {
    const [clustersRes, blocksRes, treesRes] = await Promise.all([api.get('/farm/clusters'), api.get('/farm/blocks'), api.get('/farm/trees')]);
    setClusters(clustersRes.data || []);
    setBlocks(blocksRes.data || []);
    setTrees(treesRes.data || []);
  };

  useEffect(() => {
    if (canView) loadData().catch(() => toast.error('Failed to load trees'));
  }, [canView]);

  const applyTreeToForm = (tree) => {
    if (!tree) return;
    setForm({
      blockId: tree.blockId,
      treeCode: tree.treeCode || '',
      treeId: tree.treeId || '',
      qrCodeData: tree.qrCodeData || '',
      rowNumber: tree.rowNumber ?? '',
      rowTreeNumber: tree.rowTreeNumber ?? '',
      latitude: tree.latitude ?? '',
      longitude: tree.longitude ?? '',
      ageYears: tree.ageYears ?? '',
      varietiesText: (tree.varieties || []).join(', '),
      plantingDate: tree.plantingDate ? new Date(tree.plantingDate).toISOString().slice(0, 10) : '',
      isActive: tree.isActive !== false,
    });
    setEditingId(tree._id);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    const payload = {
      blockId: form.blockId,
      treeCode: form.treeCode,
      treeId: form.treeId,
      qrCodeData: form.qrCodeData || `${form.treeCode}|${form.treeId}`,
      rowNumber: form.rowNumber || null,
      rowTreeNumber: form.rowTreeNumber || null,
      latitude: form.latitude,
      longitude: form.longitude,
      ageYears: form.ageYears,
      plantingDate: form.plantingDate || null,
      varieties: String(form.varietiesText || '').split(',').map((v) => v.trim()).filter(Boolean),
      isActive: !!form.isActive,
    };
    try {
      if (editingId) {
        await api.put(`/farm/trees/${editingId}`, payload);
        toast.success('Tree updated');
      } else {
        await api.post('/farm/trees', payload);
        toast.success('Tree added');
      }
      setForm(blank);
      setEditingId('');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save tree');
    }
  };

  const remove = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this tree and related logs?')) return;
    try {
      await api.delete(`/farm/trees/${id}`);
      toast.success('Tree deleted');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete tree');
    }
  };

  const generateTrees = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!selectedBlock) return toast.warn('Please select a block first.');
    const rows = Number(generatorRows || 0);
    const treesPerRow = Number(generatorTreesPerRow || 0);
    if (!rows || !treesPerRow) return toast.warn('Enter valid rows and trees per row.');
    try {
      const res = await api.post('/farm/trees/generate', { blockId: selectedBlock, rows, treesPerRow });
      toast.success(`${res?.data?.created || 0} trees generated`);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to generate trees');
    }
  };

  const addTreeToRow = async (rowNumber) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!selectedBlockObj) return toast.warn('Select a block first.');
    const treesInRow = filteredTrees.filter((t) => Number(t.rowNumber) === Number(rowNumber));
    const nextPos = treesInRow.length ? Math.max(...treesInRow.map((t) => Number(t.rowTreeNumber || 0))) + 1 : 1;
    try {
      await api.post('/farm/trees/auto-create-slot', { blockId: selectedBlockObj._id, rowNumber, rowTreeNumber: nextPos });
      toast.success(`Added tree in row ${rowNumber}`);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add tree');
    }
  };

  const removeLastTreeFromRow = async (rowNumber) => {
    if (!canManage) return toast.warn('No manage permission.');
    const treesInRow = filteredTrees.filter((t) => Number(t.rowNumber) === Number(rowNumber)).sort((a, b) => Number(b.rowTreeNumber || 0) - Number(a.rowTreeNumber || 0));
    if (!treesInRow.length) return toast.warn(`No tree found in row ${rowNumber}`);
    await remove(treesInRow[0]._id);
  };

  const addTreeAtSlot = async (rowNumber, rowTreeNumber) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!selectedBlock) return toast.warn('Select a block first.');
    try {
      await api.post('/farm/trees/auto-create-slot', { blockId: selectedBlock, rowNumber, rowTreeNumber });
      toast.success(`Tree added at R${rowNumber} T${rowTreeNumber}`);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add tree at slot');
    }
  };

  const adjustGrid = async (operation, index) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!selectedBlock) return toast.warn('Select a block first.');
    if (['delete_row', 'delete_col'].includes(operation)) {
      const ok = window.confirm('This will remove trees in the selected row/column before shifting others. Continue?');
      if (!ok) return;
    }
    try {
      await api.post('/farm/trees/grid-adjust', { blockId: selectedBlock, operation, index });
      toast.success('Grid updated');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update grid');
      // In case backend applied partial updates before responding with error, refresh UI immediately.
      await loadData().catch(() => {});
    }
  };

  const onDropToSlot = async (event, targetRow, targetPos) => {
    if (!canManage) return;
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain') || draggingTreeId;
    if (!draggedId) return;
    const occupied = mapBySlot.get(`${targetRow}-${targetPos}`);
    const allowSwap = Boolean(occupied);
    if (occupied) {
      const ok = window.confirm(`Target slot has tree ${occupied.treeCode}. Do you want to swap positions?`);
      if (!ok) return;
    }
    try {
      const res = await api.put(`/farm/trees/${draggedId}/move`, { blockId: selectedBlock, rowNumber: targetRow, rowTreeNumber: targetPos, allowSwap });
      toast.success(res?.data?.swapped ? 'Trees swapped' : 'Tree moved');
      setDraggingTreeId('');
      setDropHoverSlot('');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to move tree');
    }
  };

  const printLabels = (labelTrees, title = 'Tree QR Labels') => {
    const rows = (labelTrees || []).filter((t) => t.qrCodeData);
    if (!rows.length) return toast.warn('No QR data available for printing labels.');
    const html = `<!doctype html><html><head><title>Tree QR Labels</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body{font-family:Arial,sans-serif;padding:0;margin:0}
        .grid{display:grid;grid-template-columns:repeat(2,1fr);column-gap:10mm;row-gap:18mm}
        .card{border:1px solid #333;padding:6mm 4mm;text-align:center;min-height:82mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center}
        img{width:62mm;height:62mm;object-fit:contain}
        .txt{font-size:12px;margin-top:6mm}
        @media print { .card { break-inside: avoid; page-break-inside: avoid; } }
      </style></head><body>
      <h3>JM Mangoes Farm - ${title}</h3>
      <div class="grid">
      ${rows.map((t) => `<div class="card"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(t.qrCodeData)}" /><div class="txt">${t.treeCode} (${t.treeId})</div></div>`).join('')}
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Popup blocked. Please allow popups to print labels.');
    win.document.write(html);
    win.document.close();
  };

  const printSingleTree = (tree) => printLabels([tree], `Tree ${tree.treeCode} (${tree.treeId})`);
  const printRowTrees = (rowNumber) => {
    const rowTrees = filteredTrees.filter((t) => Number(t.rowNumber) === Number(rowNumber)).sort((a, b) => Number(a.rowTreeNumber || 0) - Number(b.rowTreeNumber || 0));
    if (!rowTrees.length) return toast.warn(`No trees found in row ${rowNumber}`);
    printLabels(rowTrees, `Row ${rowNumber} QR Labels`);
  };

  const runSearch = () => {
    const code = String(searchTreeCode || '').trim().toLowerCase();
    const qr = String(searchQrCode || '').trim().toLowerCase();
    if (!code && !qr) return toast.warn('Enter Tree Code or QR code text to search.');
    const found = filteredTrees.find((t) => {
      const codeMatch = code ? String(t.treeCode || '').toLowerCase() === code : true;
      const qrMatch = qr ? String(t.qrCodeData || '').toLowerCase().includes(qr) : true;
      return codeMatch && qrMatch;
    });
    if (!found) return toast.warn('No tree found in selected block for this search.');
    applyTreeToForm(found);
    toast.success(`Tree found: ${found.treeCode}`);
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Trees</h2>

      <div className="mb-4 bg-white p-3 rounded shadow">
        <label className="text-sm font-medium">Select Cluster</label>
        <select
          className="w-full md:w-80 border rounded p-2 mt-1"
          value={selectedClusterId}
          onChange={(e) => {
            setSelectedClusterId(e.target.value);
            setSelectedBlock('');
            setForm((prev) => ({ ...prev, blockId: '' }));
          }}
        >
          <option value="">Select Cluster</option>
          {clusters.map((c) => <option key={c._id} value={c._id}>{c.code} - {c.name}</option>)}
        </select>
      </div>

      {selectedClusterId ? (
        <div className="mb-4 bg-white p-3 rounded shadow">
          <h3 className="font-semibold mb-2">Select Block from Cluster Map ({selectedCluster?.code || ''})</h3>
          <div className="overflow-auto">
            <div className="inline-block border rounded">
              {Array.from({ length: clusterRows }).map((_, rIdx) => {
                const r = rIdx + 1;
                return (
                  <div key={`cr-${r}`} className="flex">
                    {Array.from({ length: clusterCols }).map((__, cIdx) => {
                      const c = cIdx + 1;
                      const b = clusterBlockBySlot.get(`${r}-${c}`);
                      const isSelected = b && String(b._id) === String(selectedBlock);
                      return (
                        <div key={`cc-${r}-${c}`} className={`w-28 h-20 border p-1 text-[10px] ${isSelected ? 'bg-green-100' : b ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <div className="text-gray-500">R{r} C{c}</div>
                          {b ? (
                            <div className="mt-1">
                              <div className="font-semibold text-[11px]">{b.code}</div>
                              <button
                                type="button"
                                className="text-blue-700 hover:underline text-[10px]"
                                onClick={() => {
                                  setSelectedBlock(b._id);
                                  setForm((prev) => ({ ...prev, blockId: b._id }));
                                }}
                              >
                                Select Block
                              </button>
                            </div>
                          ) : <span className="text-gray-300">Empty</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {selectedBlock ? (
      <div className="mb-4 bg-white p-3 rounded shadow">
        <h3 className="font-semibold mb-2">Auto Generate Tree Codes and QR</h3>
        <p className="text-sm text-gray-700 mb-3">Row counting instruction: stand facing east and number rows from left to right in that direction.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input type="number" min="1" className="border p-2 rounded" placeholder="Number of rows" value={generatorRows} onChange={(e) => setGeneratorRows(e.target.value)} />
          <input type="number" min="1" className="border p-2 rounded" placeholder="Trees in each row" value={generatorTreesPerRow} onChange={(e) => setGeneratorTreesPerRow(e.target.value)} />
          <button type="button" onClick={generateTrees} className="bg-green-600 text-white px-4 py-2 rounded">Generate</button>
        </div>
      </div>
      ) : null}

      {selectedBlock ? (
        <div className="bg-white rounded shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Block Tree Map ({selectedBlockObj?.code || ''})</h3>
            <button type="button" className="px-3 py-1 rounded border border-green-700 text-green-700 text-sm" onClick={() => loadData()}>
              Refresh Map
            </button>
          </div>
          <p className="text-sm text-gray-700 mb-3">Drag and drop to move/swap. Each slot supports add/edit/log/print actions.</p>
          <div className="overflow-auto">
            <div className="inline-block border rounded">
              <div className="flex items-center justify-between p-2 bg-gray-50 border-b">
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs"
                  onClick={() => adjustGrid('append_row', maxRow)}
                >
                  Add Row Below Last
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs"
                  onClick={() => adjustGrid('append_col', maxPos)}
                >
                  Add Column Right of Last
                </button>
              </div>
              <div className="flex">
                <div className="w-40 border-r bg-gray-100 p-1 text-xs font-semibold">Row / Actions</div>
                {Array.from({ length: maxPos }).map((__, cIdx) => {
                  const col = cIdx + 1;
                  return (
                    <div key={`col-head-${col}`} className="w-24 border-r p-1 text-[10px] bg-gray-100">
                      <div className="text-center font-semibold mb-1">Col {col}</div>
                      <div className="flex flex-col gap-1">
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustGrid('add_col_left', col)}>+ Left</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustGrid('add_col_right', col)}>+ Right</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-red-100 text-red-700" onClick={() => adjustGrid('delete_col', col)}>Del Col</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Array.from({ length: maxRow }).map((_, rIdx) => {
                const rowNumber = rIdx + 1;
                return (
                  <div key={rowNumber} className="flex">
                    <div className="w-40 border-r p-1 text-[10px] bg-gray-50">
                      <div className="font-semibold mb-1">Row {rowNumber}</div>
                      <div className="flex flex-col gap-1">
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustGrid('add_row_top', rowNumber)}>+ Top</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-blue-100 text-blue-700" onClick={() => adjustGrid('add_row_bottom', rowNumber)}>+ Bottom</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-red-100 text-red-700" onClick={() => adjustGrid('delete_row', rowNumber)}>Del Row</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-green-100 text-green-700" onClick={() => addTreeToRow(rowNumber)}>+ Tree</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-red-100 text-red-700" onClick={() => removeLastTreeFromRow(rowNumber)}>- Tree</button>
                        <button type="button" className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700" onClick={() => printRowTrees(rowNumber)}>Print QR</button>
                      </div>
                    </div>
                    {Array.from({ length: maxPos }).map((__, cIdx) => {
                      const pos = cIdx + 1;
                      const tree = mapBySlot.get(`${rowNumber}-${pos}`);
                      return (
                        <div
                          key={`${rowNumber}-${pos}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (!tree) setDropHoverSlot(`${rowNumber}-${pos}`);
                          }}
                          onDragLeave={() => setDropHoverSlot('')}
                          onDrop={(e) => onDropToSlot(e, rowNumber, pos)}
                          className={`w-24 h-24 border flex flex-col items-center justify-center text-xs ${tree ? 'bg-green-50' : dropHoverSlot === `${rowNumber}-${pos}` ? 'bg-yellow-100' : 'bg-gray-50'}`}
                        >
                          <div className="text-[9px] text-gray-500">R{rowNumber} T{pos}</div>
                          {tree ? (
                            <div
                              draggable={canManage}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', tree._id);
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingTreeId(tree._id);
                              }}
                              onDragEnd={() => {
                                setDraggingTreeId('');
                                setDropHoverSlot('');
                              }}
                              className="cursor-move text-center"
                              title="Drag to move tree"
                            >
                              <div className="font-semibold text-[11px]">{tree.treeCode}</div>
                              <div className="text-[9px] text-gray-600">{tree.treeId}</div>
                              <div className="flex gap-1 mt-1">
                                <button type="button" className="text-blue-600 text-[9px] hover:underline" onClick={() => applyTreeToForm(tree)}>Edit</button>
                                <button type="button" className="text-emerald-700 text-[9px] hover:underline" onClick={() => printSingleTree(tree)}>Print</button>
                                <button type="button" className="text-indigo-600 text-[9px] hover:underline" onClick={() => navigate(`/farm-logs?treeId=${tree._id}`)}>Logs</button>
                                <button type="button" className="text-red-600 text-[9px] hover:underline" onClick={() => remove(tree._id)}>Del</button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center">
                              <span className="text-gray-300 text-[10px]">Empty</span>
                              <div>
                                <button type="button" className="text-green-700 text-[9px] hover:underline" onClick={() => addTreeAtSlot(rowNumber, pos)}>Add Tree</button>
                              </div>
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
        </div>
      ) : null}

      {selectedBlock ? (
        <div className="bg-white rounded shadow p-4 mt-4">
          <h3 className="text-lg font-semibold mb-2">Search Tree (Selected Block)</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input className="border p-2 rounded" placeholder="Search by unique tree code" value={searchTreeCode} onChange={(e) => setSearchTreeCode(e.target.value)} />
            <input className="border p-2 rounded md:col-span-2" placeholder="Search by QR code text" value={searchQrCode} onChange={(e) => setSearchQrCode(e.target.value)} />
            <button type="button" onClick={runSearch} className="bg-green-600 text-white px-4 py-2 rounded">Search Tree</button>
          </div>
        </div>
      ) : null}

      {selectedBlock ? (
      <form onSubmit={submit} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 mt-4">
        <h3 className="md:col-span-3 text-lg font-semibold">Tree Details (Create / Edit)</h3>
        <select className="border p-2 rounded" value={form.blockId} onChange={(e) => setForm({ ...form, blockId: e.target.value })} required>
          <option value="">Select Block</option>
          {blocks.map((b) => <option key={b._id} value={b._id}>{b.code} - {b.name}</option>)}
        </select>
        <input className="border p-2 rounded" placeholder="Tree Code (unique number)" value={form.treeCode} onChange={(e) => setForm({ ...form, treeCode: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Tree Identifier (Block-Row-Tree format)" value={form.treeId} onChange={(e) => setForm({ ...form, treeId: e.target.value })} required />
        <input type="number" min="1" className="border p-2 rounded" placeholder="Row Number" value={form.rowNumber} onChange={(e) => setForm({ ...form, rowNumber: e.target.value })} />
        <input type="number" min="1" className="border p-2 rounded" placeholder="Tree # in Row" value={form.rowTreeNumber} onChange={(e) => setForm({ ...form, rowTreeNumber: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Latitude (optional)" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Longitude (optional)" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
        <input type="number" min="0" className="border p-2 rounded" placeholder="Tree Age (years)" value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value })} />
        <input type="date" className="border p-2 rounded" value={form.plantingDate} onChange={(e) => setForm({ ...form, plantingDate: e.target.value })} />
        <input className="border p-2 rounded md:col-span-2" placeholder="Varieties (comma separated)" value={form.varietiesText} onChange={(e) => setForm({ ...form, varietiesText: e.target.value })} />
        <input className="border p-2 rounded md:col-span-2" placeholder="QR Code data (optional, auto-generated if blank)" value={form.qrCodeData} onChange={(e) => setForm({ ...form, qrCodeData: e.target.value })} />
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active</label>
        <div className="md:col-span-3 flex items-start gap-4">
          {qrPreview ? <img src={qrPreview} alt="Tree QR preview" className="w-24 h-24 border rounded" /> : null}
          <div className="flex gap-2">
            <button className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Update Tree' : 'Add Tree'}</button>
            {editingId ? <button type="button" className="px-4 py-2 rounded border" onClick={() => { setForm(blank); setEditingId(''); }}>Cancel Edit</button> : null}
          </div>
        </div>
      </form>
      ) : null}

      {selectedBlock ? (
        <div className="overflow-x-auto bg-white rounded shadow mb-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="border px-3 py-2">Block</th>
                <th className="border px-3 py-2">Tree Code</th>
                <th className="border px-3 py-2">Tree ID</th>
                <th className="border px-3 py-2">Row</th>
                <th className="border px-3 py-2">Tree in Row</th>
                <th className="border px-3 py-2">QR</th>
                <th className="border px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedTrees.map((row) => (
                <tr key={row._id}>
                  <td className="border px-3 py-2">{row.blockName}</td>
                  <td className="border px-3 py-2">{row.treeCode}</td>
                  <td className="border px-3 py-2">{row.treeId}</td>
                  <td className="border px-3 py-2">{row.rowNumber || '-'}</td>
                  <td className="border px-3 py-2">{row.rowTreeNumber || '-'}</td>
                  <td className="border px-3 py-2">{row.qrCodeData ? <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(row.qrCodeData)}`} alt={`QR ${row.treeCode}`} className="w-16 h-16 border rounded" /> : '-'}</td>
                  <td className="border px-3 py-2">
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" className="text-emerald-700 hover:underline" onClick={() => printSingleTree(row)}>Print QR</button>
                      <button type="button" className="text-indigo-600 hover:underline" onClick={() => navigate(`/farm-logs?treeId=${row._id}`)}>Logs</button>
                      <button type="button" className="text-blue-600 hover:underline" onClick={() => applyTreeToForm(row)}>Edit</button>
                      {canManage ? <button type="button" className="text-red-600 hover:underline" onClick={() => remove(row._id)}>Delete</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredTrees.length ? <tr><td colSpan="7" className="border px-3 py-4 text-center text-gray-500">No trees found for selected block.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};

export default FarmTrees;
