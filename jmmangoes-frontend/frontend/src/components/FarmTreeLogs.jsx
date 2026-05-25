import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import jsQR from 'jsqr';
import DataTable from 'react-data-table-component';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const logTypes = [
  { value: 'production', label: 'Production' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'disease', label: 'Disease' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'irrigation', label: 'Irrigation' },
];

const blank = {
  treeId: '',
  logType: 'production',
  logDate: new Date().toISOString().slice(0, 10),
  year: new Date().getFullYear(),
  quantity: '',
  quality: '',
  fertilizerType: '',
  fertilizerQuantity: '',
  diseaseName: '',
  maintenanceJob: '',
  gradeA: '',
  gradeB: '',
  gradeC: '',
  gradeD: '',
  remarks: '',
};

const FarmTreeLogs = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.farmTreeLogs?.view || user?.permissions?.farmLogs?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.farmTreeLogs?.manage || user?.permissions?.farmLogs?.manage;
  const [searchParams, setSearchParams] = useSearchParams();
  const [trees, setTrees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [searchTreeCode, setSearchTreeCode] = useState('');
  const [searchTreeIdentifier, setSearchTreeIdentifier] = useState('');
  const [searchQrText, setSearchQrText] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanRafRef = useRef(null);
  const scanCanvasRef = useRef(null);

  const downloadCsv = () => {
    if (!logs.length) return toast.warn('No logs to export.');
    const header = ['Date', 'Type', 'Year', 'Quantity', 'GradeA', 'GradeB', 'GradeC', 'GradeD', 'FertilizerType', 'FertilizerQty', 'Disease', 'Maintenance', 'Quality', 'Remarks'];
    const lines = logs.map((r) => [
      r.logDate ? new Date(r.logDate).toISOString().slice(0, 10) : '',
      r.logType || '',
      r.year || '',
      r.quantity ?? 0,
      r.gradeA ?? 0,
      r.gradeB ?? 0,
      r.gradeC ?? 0,
      r.gradeD ?? 0,
      r.fertilizerType || '',
      r.fertilizerQuantity ?? 0,
      r.diseaseName || '',
      r.maintenanceJob || '',
      r.quality || '',
      (r.remarks || '').replaceAll('\n', ' '),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const treeLabel = selectedTree ? `${selectedTree.treeCode}_${selectedTree.treeId}` : 'all';
    a.download = `farm_tree_logs_${treeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printPdf = () => {
    if (!logs.length) return toast.warn('No logs to print.');
    const title = selectedTree ? `${selectedTree.blockName} / ${selectedTree.treeCode} (${selectedTree.treeId})` : 'Tree Logs';
    const rows = logs.map((r) => `
      <tr>
        <td>${r.logDate ? new Date(r.logDate).toLocaleDateString() : '-'}</td>
        <td>${r.logType || ''}</td>
        <td>${r.year || ''}</td>
        <td>${r.quantity ?? 0}</td>
        <td>${r.gradeA ?? 0}/${r.gradeB ?? 0}/${r.gradeC ?? 0}/${r.gradeD ?? 0}</td>
        <td>${[r.fertilizerType, r.diseaseName, r.maintenanceJob, r.quality, r.remarks].filter(Boolean).join(' | ')}</td>
      </tr>
    `).join('');
    const html = `<!doctype html><html><head><title>Farm Tree Logs</title><style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f2f2f2}</style></head><body><h3>JM Mangoes Farm - Tree Logs</h3><p>${title}</p><table><thead><tr><th>Date</th><th>Type</th><th>Year</th><th>Qty</th><th>Grades</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return toast.error('Popup blocked. Please allow popups.');
    win.document.write(html);
    win.document.close();
  };

  const selectedTreeId = form.treeId;
  const selectedTree = useMemo(() => trees.find((t) => t._id === selectedTreeId), [trees, selectedTreeId]);
  const isProductionTask = form.logType === 'production';
  const isFertilizerTask = form.logType === 'fertilizer';
  const isMaintenanceTask = form.logType === 'maintenance';
  const isDiseaseTask = form.logType === 'disease';
  const isWaterTask = form.logType === 'irrigation';
  const productionTotalKg = useMemo(() => {
    if (!isProductionTask) return Number(form.quantity || 0);
    const a = Number(form.gradeA || 0);
    const b = Number(form.gradeB || 0);
    const c = Number(form.gradeC || 0);
    const d = Number(form.gradeD || 0);
    const total = a + b + c + d;
    return Number.isFinite(total) ? total : 0;
  }, [isProductionTask, form.gradeA, form.gradeB, form.gradeC, form.gradeD, form.quantity]);
  const categorizedLogs = useMemo(() => ({
    production: logs.filter((r) => ['production', 'harvest'].includes(r.logType)),
    fertilizer: logs.filter((r) => r.logType === 'fertilizer'),
    disease: logs.filter((r) => r.logType === 'disease'),
    maintenance: logs.filter((r) => r.logType === 'maintenance'),
    irrigation: logs.filter((r) => ['irrigation', 'watering'].includes(r.logType)),
  }), [logs]);
  const currentSection = useMemo(() => ({
    production: { key: 'production', title: 'Production Logs' },
    fertilizer: { key: 'fertilizer', title: 'Fertilizer Logs' },
    disease: { key: 'disease', title: 'Disease Logs' },
    maintenance: { key: 'maintenance', title: 'Maintenance Logs' },
    irrigation: { key: 'irrigation', title: 'Irrigation Logs' },
  }[form.logType] || { key: 'production', title: 'Production Logs' }), [form.logType]);
  const currentSectionRows = categorizedLogs[currentSection.key] || [];
  const filteredCurrentSectionRows = useMemo(() => {
    const q = String(tableSearch || '').trim().toLowerCase();
    if (!q) return currentSectionRows;
    return currentSectionRows.filter((row) =>
      String(row.logType || '').toLowerCase().includes(q) ||
      String(row.quality || '').toLowerCase().includes(q) ||
      String(row.fertilizerType || '').toLowerCase().includes(q) ||
      String(row.diseaseName || '').toLowerCase().includes(q) ||
      String(row.maintenanceJob || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q) ||
      String(row.quantity ?? '').toLowerCase().includes(q)
    );
  }, [currentSectionRows, tableSearch]);
  const sectionValueText = (sectionKey, row) => {
    if (sectionKey === 'fertilizer') return `Fertilizer: ${row.fertilizerType || '-'} | Quantity: ${row.fertilizerQuantity ?? 0}${row.remarks ? ` | Remarks: ${row.remarks}` : ''}`;
    if (sectionKey === 'maintenance') return `Task: ${row.maintenanceJob || '-'}${row.remarks ? ` | Remarks: ${row.remarks}` : ''}`;
    if (sectionKey === 'disease') return `Disease: ${row.diseaseName || '-'}${row.remarks ? ` | Remarks: ${row.remarks}` : ''}`;
    if (sectionKey === 'production') return `Quantity: ${row.quantity ?? 0} | Grades: A:${row.gradeA || 0} B:${row.gradeB || 0} C:${row.gradeC || 0} D:${row.gradeD || 0}${row.remarks ? ` | Remarks: ${row.remarks}` : ''}`;
    return `Quantity: ${row.quantity ?? 0}${row.remarks ? ` | Remarks: ${row.remarks}` : ''}`;
  };
  const downloadSectionCsv = (section, rows, suffix = 'all') => {
    if (!rows.length) return toast.warn('No rows to export.');
    const header = ['Date', 'Type', 'Values'];
    const lines = rows.map((r) => [
      r.logDate ? new Date(r.logDate).toISOString().slice(0, 10) : '',
      r.logType || '',
      sectionValueText(section.key, r),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const treeLabel = selectedTree ? `${selectedTree.treeCode}_${selectedTree.treeId}` : 'all';
    a.download = `farm_tree_logs_${section.key}_${treeLabel}_${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadTrees = async () => {
    const res = await api.get('/farm/trees');
    setTrees(res.data || []);
  };

  const loadLogs = async (treeId) => {
    if (!treeId) return setLogs([]);
    const res = await api.get('/farm/tree-logs', { params: { treeId } });
    setLogs(res.data || []);
  };

  useEffect(() => {
    if (!canView) return;
    loadTrees().catch(() => toast.error('Failed to load trees'));
  }, [canView]);

  useEffect(() => {
    const treeId = searchParams.get('treeId') || '';
    if (treeId) setForm((prev) => ({ ...prev, treeId }));
  }, [searchParams]);

  useEffect(() => {
    if (canView) loadLogs(selectedTreeId).catch(() => toast.error('Failed to load logs'));
  }, [canView, selectedTreeId]);

  useEffect(() => {
    if (!isProductionTask) return;
    const nextQty = String(productionTotalKg);
    if (String(form.quantity || '') !== nextQty) {
      setForm((prev) => ({ ...prev, quantity: nextQty }));
    }
  }, [isProductionTask, productionTotalKg]);

  const stopScanner = () => {
    setIsScanning(false);
    if (scanRafRef.current) {
      cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const findTree = ({ code = '', identifier = '', qr = '' }) => {
    const codeN = String(code || '').trim().toLowerCase();
    const idN = String(identifier || '').trim().toLowerCase();
    const qrN = String(qr || '').trim().toLowerCase();
    if (!codeN && !idN && !qrN) return null;
    return trees.find((t) => {
      const codeMatch = codeN ? String(t.treeCode || '').toLowerCase() === codeN : true;
      const idMatch = idN ? String(t.treeId || '').toLowerCase() === idN : true;
      const qrMatch = qrN ? String(t.qrCodeData || '').toLowerCase().includes(qrN) : true;
      return codeMatch && idMatch && qrMatch;
    }) || null;
  };

  const applyFoundTree = (tree) => {
    if (!tree) return false;
    setForm((prev) => ({ ...prev, treeId: tree._id }));
    setSearchParams({ treeId: tree._id });
    toast.success(`Tree selected: ${tree.treeCode} (${tree.treeId})`);
    return true;
  };

  const runTreeSearch = () => {
    const found = findTree({ code: searchTreeCode, identifier: searchTreeIdentifier, qr: searchQrText });
    if (!found) return toast.warn('No tree matched your search.');
    applyFoundTree(found);
  };

  const beginCameraScan = async () => {
    setScanError('');
    if (!window.isSecureContext) {
      setScanError('Camera scanning requires secure context (https) or localhost.');
      return;
    }
    const supportsBarcodeDetector = 'BarcodeDetector' in window;
    let detector = null;
    if (supportsBarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (_) {
        detector = null;
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);
      const scanFrame = async () => {
        if (!videoRef.current || !mediaStreamRef.current) return;
        try {
          let rawValue = '';
          if (detector) {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) rawValue = barcodes[0]?.rawValue || '';
          } else {
            const video = videoRef.current;
            const w = video.videoWidth || 0;
            const h = video.videoHeight || 0;
            if (w > 0 && h > 0) {
              if (!scanCanvasRef.current) scanCanvasRef.current = document.createElement('canvas');
              const canvas = scanCanvasRef.current;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
                rawValue = code?.data || '';
              }
            }
          }
          if (rawValue) {
            stopScanner();
            setIsScannerOpen(false);
            setSearchQrText(rawValue);
            const found = findTree({ qr: rawValue });
            if (!found) {
              toast.warn('QR scanned, but no tree found.');
            } else {
              applyFoundTree(found);
            }
            return;
          }
        } catch (_) {
          // keep scanning
        }
        scanRafRef.current = requestAnimationFrame(scanFrame);
      };
      scanRafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      setScanError(err?.message || 'Unable to access camera.');
      stopScanner();
    }
  };

  useEffect(() => {
    if (isScannerOpen) beginCameraScan();
    else stopScanner();
    return () => stopScanner();
  }, [isScannerOpen]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!form.treeId) return toast.warn('Please select a tree.');
    const payload = {
      ...form,
      year: Number((form.logDate || new Date().toISOString().slice(0, 10)).slice(0, 4)),
    };
    try {
      if (editingId) {
        await api.put(`/farm/tree-logs/${editingId}`, payload);
        toast.success('Log updated');
      } else {
        await api.post('/farm/tree-logs', payload);
        toast.success('Log created');
      }
      setEditingId('');
      setForm((prev) => ({ ...blank, treeId: prev.treeId }));
      await loadLogs(form.treeId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save log');
    }
  };

  const remove = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this log?')) return;
    try {
      await api.delete(`/farm/tree-logs/${id}`);
      toast.success('Log deleted');
      await loadLogs(form.treeId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete log');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Tree Logs</h2>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={downloadCsv} className="px-3 py-2 rounded bg-green-700 text-white">Export Excel (CSV)</button>
        <button type="button" onClick={printPdf} className="px-3 py-2 rounded border border-green-700 text-green-700">Export PDF (Print)</button>
      </div>

      <form onSubmit={submit} className="bg-white rounded shadow p-4 space-y-3 mb-4">
        <h3 className="text-lg font-semibold">1. Search & Select Tree</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="border p-2 rounded" placeholder="Search by Tree Code" value={searchTreeCode} onChange={(e) => setSearchTreeCode(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Search by Tree Identifier" value={searchTreeIdentifier} onChange={(e) => setSearchTreeIdentifier(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Search by QR text" value={searchQrText} onChange={(e) => setSearchQrText(e.target.value)} />
          <button type="button" onClick={runTreeSearch} className="bg-green-600 text-white px-4 py-2 rounded">Search Tree</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => setIsScannerOpen(true)}>
            Scan QR with Camera
          </button>
          <select className="border p-2 rounded min-w-[300px]" value={form.treeId} onChange={(e) => { const v = e.target.value; setForm({ ...form, treeId: v }); setSearchParams(v ? { treeId: v } : {}); }} required>
            <option value="">Or select tree manually</option>
            {trees.map((t) => <option key={t._id} value={t._id}>{t.blockName} | {t.treeCode} ({t.treeId})</option>)}
          </select>
        </div>
        {isScannerOpen ? (
          <div className="mt-2 border rounded p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Camera Scanner</p>
              <button type="button" className="text-red-600 text-sm hover:underline" onClick={() => setIsScannerOpen(false)}>Close</button>
            </div>
            <video ref={videoRef} className="w-full max-w-md rounded border bg-black" muted playsInline />
            <p className="text-xs text-gray-600 mt-2">Point camera at tree QR code to auto-select tree.</p>
            {isScanning ? <p className="text-xs text-green-700 mt-1">Scanning...</p> : null}
            {scanError ? <p className="text-xs text-red-600 mt-1">{scanError}</p> : null}
          </div>
        ) : null}

        <h3 className="text-lg font-semibold pt-2 border-t">2. Select Task & Enter Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">Task Category</label>
            <select className="border p-2 rounded w-full" value={form.logType} onChange={(e) => setForm({ ...form, logType: e.target.value })}>
              {logTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">Date</label>
            <input type="date" className="border p-2 rounded w-full" value={form.logDate} onChange={(e) => setForm({ ...form, logDate: e.target.value })} />
          </div>
          {isProductionTask || isWaterTask ? (
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">{isProductionTask ? 'Total Quantity (kg)' : 'Quantity'}</label>
              <input
                type="number"
                step="0.01"
                className="border p-2 rounded w-full"
                placeholder={isProductionTask ? 'Auto-calculated from Grade A/B/C/D' : 'Enter quantity'}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                readOnly={isProductionTask}
              />
            </div>
          ) : null}
          {isProductionTask ? (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Grade A (kg)</label>
                <input type="number" step="0.01" className="border p-2 rounded w-full" placeholder="Grade A quantity in kg" value={form.gradeA} onChange={(e) => setForm({ ...form, gradeA: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Grade B (kg)</label>
                <input type="number" step="0.01" className="border p-2 rounded w-full" placeholder="Grade B quantity in kg" value={form.gradeB} onChange={(e) => setForm({ ...form, gradeB: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Grade C (kg)</label>
                <input type="number" step="0.01" className="border p-2 rounded w-full" placeholder="Grade C quantity in kg" value={form.gradeC} onChange={(e) => setForm({ ...form, gradeC: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Grade D (kg)</label>
                <input type="number" step="0.01" className="border p-2 rounded w-full" placeholder="Grade D quantity in kg" value={form.gradeD} onChange={(e) => setForm({ ...form, gradeD: e.target.value })} />
              </div>
            </>
          ) : null}
          {isFertilizerTask ? (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Fertilizer Type</label>
                <input className="border p-2 rounded w-full" placeholder="Enter fertilizer type" value={form.fertilizerType} onChange={(e) => setForm({ ...form, fertilizerType: e.target.value })} />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Fertilizer Quantity</label>
                <input type="number" step="0.01" className="border p-2 rounded w-full" placeholder="Enter fertilizer quantity" value={form.fertilizerQuantity} onChange={(e) => setForm({ ...form, fertilizerQuantity: e.target.value })} />
              </div>
            </>
          ) : null}
          {isDiseaseTask ? (
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">Disease Name</label>
              <input className="border p-2 rounded w-full" placeholder="Enter disease name" value={form.diseaseName} onChange={(e) => setForm({ ...form, diseaseName: e.target.value })} />
            </div>
          ) : null}
          {isMaintenanceTask ? (
            <div className="md:col-span-2">
              <label className="block mb-1 text-sm font-medium text-gray-700">Maintenance Task Details</label>
              <input className="border p-2 rounded w-full" placeholder="Enter maintenance details" value={form.maintenanceJob} onChange={(e) => setForm({ ...form, maintenanceJob: e.target.value })} />
            </div>
          ) : null}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Remarks</label>
          <textarea className="w-full border p-2 rounded" placeholder="Enter remarks (optional)" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        {selectedTree ? <p className="text-sm text-gray-600">Selected tree: {selectedTree.blockName} / {selectedTree.treeCode} / {selectedTree.treeId}</p> : null}
        <div className="flex gap-2">
          <button className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Update Log' : 'Add Log'}</button>
          {editingId ? <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditingId(''); setForm((prev) => ({ ...blank, treeId: prev.treeId })); }}>Cancel Edit</button> : null}
        </div>
      </form>

      <div className="overflow-x-auto bg-white rounded shadow mb-4">
        <h3 className="text-lg font-semibold px-4 pt-3">{currentSection.title}</h3>
        <DataTable
          columns={[
            {
              name: 'Date',
              selector: (row) => (row.logDate ? new Date(row.logDate).toLocaleDateString() : '-'),
              sortable: true,
              wrap: true,
            },
            { name: 'Type', selector: (row) => row.logType || '', sortable: true, wrap: true, cell: (row) => <span className="capitalize">{row.logType}</span> },
            {
              name: 'Values',
              selector: (row) => sectionValueText(currentSection.key, row),
              wrap: true,
              grow: 2,
              cell: (row) => (
                <div>
                  {currentSection.key === 'fertilizer' ? (
                    <>
                      <div><strong>Fertilizer:</strong> {row.fertilizerType || '-'}</div>
                      <div><strong>Quantity:</strong> {row.fertilizerQuantity ?? 0}</div>
                    </>
                  ) : currentSection.key === 'maintenance' ? (
                    <div><strong>Task:</strong> {row.maintenanceJob || '-'}</div>
                  ) : currentSection.key === 'disease' ? (
                    <div><strong>Disease:</strong> {row.diseaseName || '-'}</div>
                  ) : currentSection.key === 'production' ? (
                    <>
                      <div><strong>Quantity:</strong> {row.quantity ?? 0}</div>
                      <div><strong>Grades:</strong> A:{row.gradeA || 0} B:{row.gradeB || 0} C:{row.gradeC || 0} D:{row.gradeD || 0}</div>
                    </>
                  ) : (
                    <div><strong>Quantity:</strong> {row.quantity ?? 0}</div>
                  )}
                  {row.remarks ? <div><strong>Remarks:</strong> {row.remarks}</div> : null}
                </div>
              ),
            },
            {
              name: 'Actions',
              cell: (row) => (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-blue-600 hover:underline"
                    onClick={() => {
                      setEditingId(row._id);
                      setForm({
                        treeId: row.treeId,
                        logType: ['harvest'].includes(row.logType) ? 'production' : ['watering'].includes(row.logType) ? 'irrigation' : (row.logType || 'production'),
                        logDate: row.logDate ? new Date(row.logDate).toISOString().slice(0, 10) : '',
                        year: row.year || new Date().getFullYear(),
                        quantity: row.quantity ?? '',
                        quality: row.quality || '',
                        fertilizerType: row.fertilizerType || '',
                        fertilizerQuantity: row.fertilizerQuantity ?? '',
                        diseaseName: row.diseaseName || '',
                        maintenanceJob: row.maintenanceJob || '',
                        gradeA: row.gradeA ?? '',
                        gradeB: row.gradeB ?? '',
                        gradeC: row.gradeC ?? '',
                        gradeD: row.gradeD ?? '',
                        remarks: row.remarks || '',
                      });
                    }}
                  >
                    Edit
                  </button>
                  {canManage ? <button type="button" className="text-red-600 hover:underline" onClick={() => remove(row._id)}>Delete</button> : null}
                </div>
              ),
              ignoreRowClick: true,
              allowOverflow: true,
              button: true,
            },
          ]}
          data={filteredCurrentSectionRows}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder={`Search ${currentSection.title.toLowerCase()}...`}
                className="border rounded px-3 py-2 text-sm w-full md:max-w-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadSectionCsv(currentSection, filteredCurrentSectionRows, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button type="button" onClick={() => downloadSectionCsv(currentSection, currentSectionRows, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent={`No ${currentSection.title.toLowerCase()} found for selected tree.`}
        />
      </div>
    </div>
  );
};

export default FarmTreeLogs;
