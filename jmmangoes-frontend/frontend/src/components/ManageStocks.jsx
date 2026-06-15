import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const ManageStocks = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.manageStocks?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.manageStocks?.manage;
  const [products, setProducts] = useState([]);
  const [sites, setSites] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [holders, setHolders] = useState({ sites: [], warehouses: [], wholesellers: [] });
  const [stockStatusAll, setStockStatusAll] = useState({ sites: [], warehouses: [], wholesellers: [] });
  const [adjustForm, setAdjustForm] = useState({
    holderType: 'warehouse',
    holderId: '',
    productId: '',
    lotId: '',
    operation: 'add',
    quantity: '',
    unitCost: '',
    notes: '',
  });
  const [lotForm, setLotForm] = useState({
    holderType: 'warehouse',
    holderId: '',
    productId: '',
    lotCode: '',
    quantity: '',
    unitCost: '',
    receivedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [holderLots, setHolderLots] = useState([]);
  const [adjustLots, setAdjustLots] = useState([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [downloadingLedgerAll, setDownloadingLedgerAll] = useState(false);

  const loadData = async () => {
    const [productsRes, ledgerRes, holdersRes, stockStatusRes] = await Promise.all([
      api.get('/stocks/products'),
      api.get('/stocks/ledger'),
      api.get('/stocks/holders'),
      api.get('/stocks/status-all'),
    ]);
    setProducts(productsRes.data || []);
    setSites((stockStatusRes.data?.sites || []).map((s) => ({ _id: s.holderId, name: s.holderName, isActive: true })));
    setLedgerRows(ledgerRes.data || []);
    setHolders(holdersRes.data || { sites: [], warehouses: [], wholesellers: [] });
    setStockStatusAll(stockStatusRes.data || { sites: [], warehouses: [], wholesellers: [] });
  };

  useEffect(() => {
    if (canView) loadData().catch(console.error);
  }, [canView]);

  const holderTypeOptions = [
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'site', label: 'Sale Point / Site' },
    { value: 'wholeseller', label: 'Wholeseller' },
    { value: 'online', label: 'Online' },
  ];

  const holderChoices = useMemo(() => {
    if (lotForm.holderType === 'warehouse') return (holders.warehouses || []).map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` }));
    if (lotForm.holderType === 'wholeseller') return (holders.wholesellers || []).map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` }));
    if (lotForm.holderType === 'site') return (holders.sites || []).map((s) => ({ id: s._id, label: s.name }));
    if (lotForm.holderType === 'online') return (holders.sites || []).filter((s) => String(s.name || '').toLowerCase() === 'online').map((s) => ({ id: s._id, label: 'online' }));
    return [];
  }, [lotForm.holderType, holders]);

  const adjustHolderChoices = useMemo(() => {
    if (adjustForm.holderType === 'warehouse') return (holders.warehouses || []).map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` }));
    if (adjustForm.holderType === 'wholeseller') return (holders.wholesellers || []).map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` }));
    if (adjustForm.holderType === 'site') return (holders.sites || []).map((s) => ({ id: s._id, label: s.name }));
    if (adjustForm.holderType === 'online') return (holders.sites || []).filter((s) => String(s.name || '').toLowerCase() === 'online').map((s) => ({ id: s._id, label: 'online' }));
    return [];
  }, [adjustForm.holderType, holders]);

  const adjustLotsForProduct = useMemo(() => {
    if (!adjustForm.productId) return adjustLots;
    return adjustLots.filter((l) => String(l.productId) === String(adjustForm.productId));
  }, [adjustLots, adjustForm.productId]);

  const topCards = useMemo(() => {
    const siteCards = (stockStatusAll.sites || []).map((x) => ({ key: `site-${x.holderId}`, name: x.holderName, type: 'Site', totalStock: x.totalStock || 0, productsCount: (x.products || []).length }));
    const warehouseCards = (stockStatusAll.warehouses || []).map((x) => ({ key: `warehouse-${x.holderId}`, name: `${x.holderCode ? `${x.holderCode} - ` : ''}${x.holderName}`, type: 'Warehouse', totalStock: x.totalStock || 0, productsCount: (x.products || []).length }));
    const wholesellerCards = (stockStatusAll.wholesellers || []).map((x) => ({ key: `wholeseller-${x.holderId}`, name: `${x.holderCode ? `${x.holderCode} - ` : ''}${x.holderName}`, type: 'Wholeseller', totalStock: x.totalStock || 0, productsCount: (x.products || []).length }));
    return [...siteCards, ...warehouseCards, ...wholesellerCards];
  }, [stockStatusAll]);

  const filteredLedgerRows = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return ledgerRows;
    return ledgerRows.filter((row) =>
      String(row.holderType || '').toLowerCase().includes(q) ||
      String(row.holderName || '').toLowerCase().includes(q) ||
      String(row.productName || '').toLowerCase().includes(q) ||
      String(row.movementType || '').toLowerCase().includes(q) ||
      String(row.lotCode || '').toLowerCase().includes(q) ||
      String(row.createdByName || '').toLowerCase().includes(q) ||
      String(row.remarks || '').toLowerCase().includes(q)
    );
  }, [ledgerRows, ledgerSearch]);

  const downloadLedgerCsv = (rows, suffix) => {
    const headers = ['Date', 'Holder Type', 'Holder', 'Product', 'Movement', 'Lot', 'Qty', 'Unit Cost', 'Updated By', 'Remarks'];
    const csvRows = rows.map((row) => [
      `"${new Date(row.createdAt).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(row.holderType || '').replace(/"/g, '""')}"`,
      `"${String(row.holderName || '').replace(/"/g, '""')}"`,
      `"${String(row.productName || '').replace(/"/g, '""')}"`,
      `"${String(row.movementType || '').replace(/"/g, '""')}"`,
      `"${String(row.lotCode || '').replace(/"/g, '""')}"`,
      `"${Number(row.quantity || 0)}"`,
      `"${Number(row.unitCost || 0).toFixed(2)}"`,
      `"${String(row.createdByName || '-').replace(/"/g, '""')}"`,
      `"${String(row.remarks || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stock_update_history_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAllLedgerEntries = async () => {
    setDownloadingLedgerAll(true);
    try {
      const res = await api.get('/stocks/ledger', { params: { all: true } });
      const rows = res.data || [];
      downloadLedgerCsv(rows, 'all_entries');
      toast.success(`Downloaded ${rows.length} stock transaction entr${rows.length === 1 ? 'y' : 'ies'}.`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to download all stock transaction entries.');
    } finally {
      setDownloadingLedgerAll(false);
    }
  };

  const ledgerColumns = useMemo(() => ([
    { name: 'Date', selector: (row) => new Date(row.createdAt).toLocaleString(), sortable: true, wrap: true },
    { name: 'Holder Type', selector: (row) => row.holderType || '-', sortable: true, wrap: true },
    { name: 'Holder', selector: (row) => row.holderName || '-', sortable: true, wrap: true },
    { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
    { name: 'Movement', selector: (row) => String(row.movementType || '').replaceAll('_', ' '), sortable: true, wrap: true },
    { name: 'Lot', selector: (row) => row.lotCode || '-', sortable: true, wrap: true },
    { name: 'Qty', selector: (row) => Number(row.quantity || 0), sortable: true, right: true },
    { name: 'Unit Cost', selector: (row) => Number(row.unitCost || 0), sortable: true, right: true, cell: (row) => Number(row.unitCost || 0).toFixed(2) },
    { name: 'Updated By', selector: (row) => row.createdByName || '-', sortable: true, wrap: true },
    { name: 'Remarks', selector: (row) => row.remarks || '-', wrap: true, grow: 1.4 },
  ]), []);

  const loadHolderLots = async () => {
    if (!lotForm.holderType || !lotForm.holderId) return setHolderLots([]);
    const res = await api.get('/stock/lots', { params: { holderType: lotForm.holderType, holderId: lotForm.holderId } });
    setHolderLots(res.data || []);
  };

  useEffect(() => {
    loadHolderLots().catch(() => {});
  }, [lotForm.holderType, lotForm.holderId]);

  useEffect(() => {
    const loadAdjustLots = async () => {
      if (!adjustForm.holderType || !adjustForm.holderId) return setAdjustLots([]);
      const res = await api.get('/stock/lots', { params: { holderType: adjustForm.holderType, holderId: adjustForm.holderId } });
      setAdjustLots(res.data || []);
    };
    loadAdjustLots().catch(() => setAdjustLots([]));
  }, [adjustForm.holderType, adjustForm.holderId]);

  const handleAdjustStock = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const qty = Number(adjustForm.quantity);
    if (!adjustForm.holderType || !adjustForm.holderId || !adjustForm.productId || Number.isNaN(qty) || qty <= 0) {
      toast.warn('Please select holder, product, and valid quantity.');
      return;
    }
    const selectedHolderLabel = adjustHolderChoices.find((h) => String(h.id) === String(adjustForm.holderId))?.label || 'selected holder';
    const selectedProductLabel = products.find((p) => String(p._id) === String(adjustForm.productId))?.name || 'selected product';
    const confirmed = window.confirm(
      `Confirm stock ${adjustForm.operation}?\nHolder: ${selectedHolderLabel}\nProduct: ${selectedProductLabel}\nQuantity: ${qty}`
    );
    if (!confirmed) return;
    try {
      await api.post('/stocks/adjust-holder', {
        holderType: adjustForm.holderType,
        holderId: adjustForm.holderId,
        productId: adjustForm.productId,
        lotId: adjustForm.lotId || null,
        operation: adjustForm.operation,
        quantity: qty,
        unitCost: Number(adjustForm.unitCost || 0),
        notes: adjustForm.notes,
      });
      toast.success('Stock updated.');
      setAdjustForm((p) => ({ ...p, quantity: '', unitCost: '', notes: '' }));
      await loadData();
      if (adjustForm.holderType && adjustForm.holderId) {
        const res = await api.get('/stock/lots', { params: { holderType: adjustForm.holderType, holderId: adjustForm.holderId } });
        setAdjustLots(res.data || []);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update stock.');
    }
  };

  const handleCreateLot = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const qty = Number(lotForm.quantity);
    if (!lotForm.holderType || !lotForm.holderId || !lotForm.productId || !lotForm.lotCode.trim() || Number.isNaN(qty) || qty <= 0) {
      return toast.warn('Please complete holder, product, lot code, and quantity.');
    }
    try {
      await api.post('/stock/lots', {
        holderType: lotForm.holderType,
        holderId: lotForm.holderId,
        productId: lotForm.productId,
        lotCode: lotForm.lotCode.trim(),
        quantity: qty,
        unitCost: Number(lotForm.unitCost || 0),
        receivedAt: lotForm.receivedAt,
        notes: lotForm.notes,
      });
      toast.success('Stock lot added successfully.');
      setLotForm((p) => ({ ...p, lotCode: '', quantity: '', unitCost: '', notes: '' }));
      await loadHolderLots();
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add stock lot.');
    }
  };

  const generateLotCode = () => {
    if (!lotForm.productId) return toast.warn('Please select product before generating lot code.');
    const qty = Number(lotForm.quantity);
    if (Number.isNaN(qty) || qty <= 0) return toast.warn('Please enter valid quantity before generating lot code.');
    if (!lotForm.receivedAt) return toast.warn('Please select date before generating lot code.');

    const productName = products.find((p) => String(p._id) === String(lotForm.productId))?.name || 'product';
    const productPart = String(productName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    const [yyyy, mm, dd] = String(lotForm.receivedAt).split('-');
    const datePart = `${dd}${mm}${yyyy}`;
    const qtyPart = String(qty).replace(/\.0+$/, '').replace(/\./g, '_');
    const base = `${productPart}-${datePart}-${qtyPart}`;

    const maxSerial = (holderLots || []).reduce((max, lot) => {
      const lotCode = String(lot.lotCode || '').toLowerCase();
      const prefix = `${base.toLowerCase()}-`;
      if (!lotCode.startsWith(prefix)) return max;
      const n = Number(lotCode.slice(prefix.length));
      if (Number.isFinite(n) && n > max) return n;
      return max;
    }, 0);

    const nextSerial = maxSerial + 1;
    const code = `${base}-${nextSerial}`;
    setLotForm((p) => ({ ...p, lotCode: code }));
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Stocks</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {topCards.map((s) => (
          <div key={s.key} className="bg-white rounded shadow p-4">
            <div className="font-semibold">{s.name}</div>
            <div className="text-sm text-gray-600">{s.type}</div>
            <div className="text-sm text-gray-600">Products: {s.productsCount}</div>
            <div className="text-lg font-bold text-green-700">Total Stock: {s.totalStock}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Add / Remove Stock</h3>
        <p className="text-sm text-gray-600 mb-3">
          You can adjust stock for Site, Warehouse, Wholeseller, or Online. For remove, you may choose a specific lot or let the system consume FIFO.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            value={adjustForm.holderType}
            onChange={(e) => setAdjustForm((p) => ({ ...p, holderType: e.target.value, holderId: '', lotId: '' }))}
            className="border p-2 rounded"
          >
            {holderTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={adjustForm.holderId}
            onChange={(e) => setAdjustForm((p) => ({ ...p, holderId: e.target.value, lotId: '' }))}
            className="border p-2 rounded"
          >
            <option value="">Select Holder</option>
            {adjustHolderChoices.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
          <select
            value={adjustForm.productId}
            onChange={(e) => setAdjustForm((p) => ({ ...p, productId: e.target.value, lotId: '' }))}
            className="border p-2 rounded"
          >
            <option value="">Select Product</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select
            value={adjustForm.operation}
            onChange={(e) => setAdjustForm((p) => ({ ...p, operation: e.target.value }))}
            className="border p-2 rounded"
          >
            <option value="add">Add</option>
            <option value="remove">Remove</option>
          </select>
          <select
            value={adjustForm.lotId}
            onChange={(e) => setAdjustForm((p) => ({ ...p, lotId: e.target.value }))}
            className="border p-2 rounded"
          >
            <option value="">No specific lot (FIFO / adjustment lot)</option>
            {adjustLotsForProduct.map((l) => (
              <option key={l._id} value={l._id}>
                {l.lotCode} (Avail: {l.quantityAvailable})
              </option>
            ))}
          </select>
          <input
            type="number"
            value={adjustForm.quantity}
            onChange={(e) => setAdjustForm((p) => ({ ...p, quantity: e.target.value }))}
            placeholder="Quantity"
            className="border p-2 rounded"
          />
          <input
            type="number"
            value={adjustForm.unitCost}
            onChange={(e) => setAdjustForm((p) => ({ ...p, unitCost: e.target.value }))}
            placeholder="Unit Cost (optional)"
            className="border p-2 rounded"
          />
          <input
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notes (optional)"
            className="border p-2 rounded"
          />
          <button onClick={handleAdjustStock} className="bg-green-600 text-white rounded px-3 py-2">Update Stock</button>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Add Stock as Lot (Primary Intake)</h3>
        <p className="text-sm text-gray-600 mb-3">Use this to add stock lots primarily into Warehouse, then move via Stock Transfer.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
          <select className="border p-2 rounded" value={lotForm.holderType} onChange={(e) => setLotForm((p) => ({ ...p, holderType: e.target.value, holderId: '' }))}>
            {holderTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="border p-2 rounded" value={lotForm.holderId} onChange={(e) => setLotForm((p) => ({ ...p, holderId: e.target.value }))}>
            <option value="">Select Holder</option>
            {holderChoices.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
          <select className="border p-2 rounded" value={lotForm.productId} onChange={(e) => setLotForm((p) => ({ ...p, productId: e.target.value }))}>
            <option value="">Select Product</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <input type="number" className="border p-2 rounded" placeholder="Quantity" value={lotForm.quantity} onChange={(e) => setLotForm((p) => ({ ...p, quantity: e.target.value }))} />
          <input type="number" className="border p-2 rounded" placeholder="Unit Cost (optional)" value={lotForm.unitCost} onChange={(e) => setLotForm((p) => ({ ...p, unitCost: e.target.value }))} />
          <input type="date" className="border p-2 rounded" value={lotForm.receivedAt} onChange={(e) => setLotForm((p) => ({ ...p, receivedAt: e.target.value }))} />
          <button type="button" onClick={generateLotCode} className="border border-blue-600 text-blue-700 rounded px-3 py-2 whitespace-nowrap">Generate Lot Code</button>
          <input className="border p-2 rounded md:col-span-2" placeholder="Lot Code" value={lotForm.lotCode} onChange={(e) => setLotForm((p) => ({ ...p, lotCode: e.target.value }))} />
          <button onClick={handleCreateLot} className="bg-green-600 text-white rounded px-3 py-2">Add Lot</button>
        </div>
        <textarea className="border p-2 rounded w-full" placeholder="Notes (optional)" value={lotForm.notes} onChange={(e) => setLotForm((p) => ({ ...p, notes: e.target.value }))} />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        <div className="px-4 py-3 border-b bg-gray-50 font-semibold">Stock Lots for Selected Holder</div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Lot Code</th>
              <th className="border px-3 py-2">Product</th>
              <th className="border px-3 py-2">Initial</th>
              <th className="border px-3 py-2">Available</th>
              <th className="border px-3 py-2">Unit Cost</th>
              <th className="border px-3 py-2">Received At</th>
            </tr>
          </thead>
          <tbody>
            {holderLots.map((l) => (
              <tr key={l._id}>
                <td className="border px-3 py-2">{l.lotCode}</td>
                <td className="border px-3 py-2">{l.productName}</td>
                <td className="border px-3 py-2">{l.quantityInitial}</td>
                <td className="border px-3 py-2">{l.quantityAvailable}</td>
                <td className="border px-3 py-2">{l.unitCost || 0}</td>
                <td className="border px-3 py-2">{l.receivedAt ? new Date(l.receivedAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {holderLots.length === 0 && (
              <tr><td colSpan={6} className="border px-3 py-3 text-center text-gray-500">No lots found for selected holder.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sites
        .filter((s) => s.isActive)
        .map((site) => {
          const siteSummary = (stockStatusAll.sites || []).find((s) => String(s.holderId) === String(site._id));
          const siteProducts = siteSummary?.products || [];
          return (
            <div key={site._id} className="overflow-x-auto bg-white rounded shadow mb-5">
              <div className="px-4 py-3 border-b bg-gray-50">
                <div className="font-semibold">{site.name}</div>
                <div className="text-sm text-gray-600">Total Stock: {siteSummary?.totalStock || 0}</div>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-3 py-2">Product</th>
                    <th className="border px-3 py-2">Current Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {siteProducts.map((p) => (
                    <tr key={`${site._id}-${p.productId}`}>
                      <td className="border px-3 py-2">{p.productName}</td>
                      <td className="border px-3 py-2">{p.quantity || 0}</td>
                    </tr>
                  ))}
                  {siteProducts.length === 0 && (
                    <tr>
                      <td colSpan={2} className="border px-3 py-3 text-center text-gray-500">
                        No products assigned to this site.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}

      {(stockStatusAll.warehouses || []).map((wh) => (
        <div key={wh.holderId} className="overflow-x-auto bg-white rounded shadow mb-5">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="font-semibold">Warehouse: {wh.holderCode ? `${wh.holderCode} - ` : ''}{wh.holderName}</div>
            <div className="text-sm text-gray-600">Total Stock: {wh.totalStock || 0}</div>
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="border px-3 py-2">Product</th>
                <th className="border px-3 py-2">Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {(wh.products || []).map((p) => (
                <tr key={`${wh.holderId}-${p.productId}`}>
                  <td className="border px-3 py-2">{p.productName}</td>
                  <td className="border px-3 py-2">{p.quantity || 0}</td>
                </tr>
              ))}
              {(!wh.products || wh.products.length === 0) && (
                <tr>
                  <td colSpan={2} className="border px-3 py-3 text-center text-gray-500">
                    No products in this warehouse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {(stockStatusAll.wholesellers || []).map((ws) => (
        <div key={ws.holderId} className="overflow-x-auto bg-white rounded shadow mb-5">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="font-semibold">Wholeseller: {ws.holderCode ? `${ws.holderCode} - ` : ''}{ws.holderName}</div>
            <div className="text-sm text-gray-600">Total Stock: {ws.totalStock || 0}</div>
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="border px-3 py-2">Product</th>
                <th className="border px-3 py-2">Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {(ws.products || []).map((p) => (
                <tr key={`${ws.holderId}-${p.productId}`}>
                  <td className="border px-3 py-2">{p.productName}</td>
                  <td className="border px-3 py-2">{p.quantity || 0}</td>
                </tr>
              ))}
              {(!ws.products || ws.products.length === 0) && (
                <tr>
                  <td colSpan={2} className="border px-3 py-3 text-center text-gray-500">
                    No products in this wholeseller.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <div className="overflow-x-auto bg-white rounded shadow mt-6">
        <div className="px-4 py-3 border-b bg-gray-50 font-semibold">Stock Update Transaction History</div>
        <div className="px-4 py-3 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <input
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            placeholder="Search stock transactions..."
            className="border rounded px-3 py-2 text-sm w-full md:max-w-md"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => downloadLedgerCsv(filteredLedgerRows, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">
              Download Visible CSV
            </button>
            <button
              type="button"
              onClick={downloadAllLedgerEntries}
              disabled={downloadingLedgerAll}
              className="bg-green-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
            >
              {downloadingLedgerAll ? 'Preparing...' : 'Download All Entries CSV'}
            </button>
          </div>
        </div>
        <DataTable
          columns={ledgerColumns}
          data={filteredLedgerRows}
          pagination
          highlightOnHover
          striped
          dense
          noDataComponent="No stock update transactions found."
        />
      </div>
    </div>
  );
};

export default ManageStocks;
