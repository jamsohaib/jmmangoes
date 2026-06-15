import React, { useEffect, useMemo, useState } from 'react';
import DataTable from './common/DataTable';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');

const statusBadgeClass = (statusRaw) => {
  const status = String(statusRaw || '').toLowerCase();
  if (status === 'accepted') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'modified') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'returned') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'cancelled' || status === 'rejected') return 'bg-gray-200 text-gray-800 border-gray-300';
  if (status === 'pending') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const toCsvValue = (v) => {
  const str = String(v ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const preventNumberScroll = (e) => {
  e.target.blur();
};

const preventNonIntegerKeys = (e) => {
  if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
};

const downloadCsv = (filename, columns, rows) => {
  const headers = columns.map((c) => c.name).join(',');
  const lines = rows.map((row) => columns.map((c) => toCsvValue(c.getter(row))).join(','));
  const blob = new Blob([[headers, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const StockTransfer = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.stockTransfer?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.stockTransfer?.manage;
  const [sites, setSites] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [wholesellers, setWholesellers] = useState([]);
  const [targetSites, setTargetSites] = useState([]);
  const [targetWarehouses, setTargetWarehouses] = useState([]);
  const [targetWholesellers, setTargetWholesellers] = useState([]);
  const [lots, setLots] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [orderRequests, setOrderRequests] = useState([]);
  const [orderRequestLotsBySite, setOrderRequestLotsBySite] = useState({});
  const [orderRequestLotSelection, setOrderRequestLotSelection] = useState({});
  const [modifyModal, setModifyModal] = useState({ open: false, transfer: null, items: [], returnDisposition: 'return_to_sender', receiverRemarks: '' });
  const [form, setForm] = useState({ fromType: 'warehouse', fromId: '', toType: 'site', toId: '', lotId: '', quantity: '' });
  const [transferSearch, setTransferSearch] = useState('');
  const [requestSearch, setRequestSearch] = useState('');

  const sourceHolderOptions = useMemo(() => ({
    site: sites.map((s) => ({ id: s._id, label: `${s.name}` })),
    warehouse: warehouses.map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` })),
    wholeseller: wholesellers.map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` })),
    online: sites.filter((s) => String(s.name || '').toLowerCase() === 'online').map((s) => ({ id: s._id, label: 'online' })),
  }), [sites, warehouses, wholesellers]);

  const targetHolderOptions = useMemo(() => ({
    site: targetSites.map((s) => ({ id: s._id, label: `${s.name}` })),
    warehouse: targetWarehouses.map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` })),
    wholeseller: targetWholesellers.map((w) => ({ id: w._id, label: `${w.code} - ${w.name}` })),
    online: targetSites.filter((s) => String(s.name || '').toLowerCase() === 'online').map((s) => ({ id: s._id, label: 'online' })),
  }), [targetSites, targetWarehouses, targetWholesellers]);

  const fromChoices = sourceHolderOptions[form.fromType] || [];
  const toChoices = targetHolderOptions[form.toType] || [];
  const selectedLot = lots.find((l) => l._id === form.lotId);

  const canAccessEntity = (type, id) => {
    if (user?.role === 'admin') return true;
    const idStr = String(id || '');
    if (type === 'site' || type === 'online') return (user?.siteAccess || []).map(String).includes(idStr);
    if (type === 'warehouse') return (user?.warehouseAccess || []).map(String).includes(idStr);
    if (type === 'wholeseller') return (user?.wholesellerAccess || []).map(String).includes(idStr);
    return false;
  };

  const loadMaster = async () => {
    const res = await api.get('/stock/transfer-holders');
    setSites(res.data?.source?.sites || []);
    setWarehouses(res.data?.source?.warehouses || []);
    setWholesellers(res.data?.source?.wholesellers || []);
    setTargetSites(res.data?.target?.sites || []);
    setTargetWarehouses(res.data?.target?.warehouses || []);
    setTargetWholesellers(res.data?.target?.wholesellers || []);
  };

  const loadTransfers = async () => {
    const res = await api.get('/stock/transfers');
    setTransfers(res.data || []);
  };

  const loadOrderRequests = async () => {
    const res = await api.get('/stock/order-requests');
    const rows = res.data || [];
    setOrderRequests(rows);
    const siteIds = [...new Set(rows.map((r) => String(r.sourceSiteId || '')).filter(Boolean))];
    await Promise.all(siteIds.map(async (siteId) => {
      if (orderRequestLotsBySite[siteId]) return;
      const lotsRes = await api.get('/stock/lots', { params: { holderType: 'site', holderId: siteId } });
      setOrderRequestLotsBySite((prev) => ({
        ...prev,
        [siteId]: (lotsRes.data || []).filter((l) => Number(l.quantityAvailable || 0) > 0),
      }));
    }));
  };

  const loadLots = async () => {
    if (!form.fromId) return setLots([]);
    const res = await api.get('/stock/lots', { params: { holderType: form.fromType, holderId: form.fromId } });
    setLots((res.data || []).filter((l) => Number(l.quantityAvailable || 0) > 0));
  };

  useEffect(() => {
    if (canView) {
      loadMaster().catch(() => toast.error('Failed to load masters'));
      loadTransfers().catch(() => toast.error('Failed to load transfers'));
      loadOrderRequests().catch(() => toast.error('Failed to load order stock requests'));
    }
  }, [canView]);

  useEffect(() => {
    if (canView) loadLots().catch(() => toast.error('Failed to load lots'));
  }, [canView, form.fromType, form.fromId]);

  const createTransfer = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    const qty = Number(form.quantity);
    if (!form.fromId || !form.toId || !form.lotId || Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return toast.warn('Complete transfer form. Quantity must be a whole number.');
    }
    try {
      await api.post('/stock/transfers', {
        fromType: form.fromType,
        fromId: form.fromId,
        toType: form.toType,
        toId: form.toId,
        items: [{ lotId: form.lotId, quantity: qty }],
      });
      toast.success('Transfer initiated');
      setForm((p) => ({ ...p, lotId: '', quantity: '' }));
      await loadLots();
      await loadTransfers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create transfer');
    }
  };

  const respond = async (t, action) => {
    if (!canManage) return;
    try {
      const items = (t.items || []).map((it) => ({ itemId: it._id, acceptedQty: action === 'accepted' ? it.requestedQty : (action === 'returned' ? 0 : it.requestedQty) }));
      await api.put(`/stock/transfers/${t._id}/respond`, { action, items });
      toast.success(`Transfer ${action}`);
      await loadTransfers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to respond transfer');
    }
  };

  const openModifyTransfer = (t) => {
    setModifyModal({
      open: true,
      transfer: t,
      items: (t.items || []).map((it) => ({
        itemId: it._id,
        productName: it.productName,
        lotCode: it.lotCode,
        requestedQty: Number(it.requestedQty || 0),
        acceptedQty: Number(it.requestedQty || 0),
      })),
      returnDisposition: 'return_to_sender',
      receiverRemarks: '',
    });
  };

  const submitModifyTransfer = async () => {
    if (!modifyModal.transfer?._id) return;
    for (const it of modifyModal.items) {
      const accepted = Number(it.acceptedQty || 0);
      if (Number.isNaN(accepted) || !Number.isInteger(accepted) || accepted < 0 || accepted > Number(it.requestedQty || 0)) {
        return toast.warn(`Accepted qty for ${it.productName} must be between 0 and ${it.requestedQty}.`);
      }
    }
    try {
      await api.put(`/stock/transfers/${modifyModal.transfer._id}/respond`, {
        action: 'modified',
        items: modifyModal.items.map((it) => ({ itemId: it.itemId, acceptedQty: Number(it.acceptedQty || 0) })),
        returnDisposition: modifyModal.returnDisposition,
        receiverRemarks: modifyModal.receiverRemarks,
      });
      toast.success('Transfer modified');
      setModifyModal({ open: false, transfer: null, items: [], returnDisposition: 'return_to_sender', receiverRemarks: '' });
      await loadTransfers();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to modify transfer');
    }
  };

  const cancelTransfer = async (t) => {
    if (!canManage) return;
    if (!window.confirm('Cancel this pending transfer? Stock will be returned to source lots.')) return;
    try {
      await api.put(`/stock/transfers/${t._id}/cancel`, {});
      toast.success('Transfer cancelled');
      await loadTransfers();
      await loadLots();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to cancel transfer');
    }
  };

  const resolveDifference = async (t, resolution) => {
    if (!canManage) return;
    const notes = window.prompt(
      resolution === 'mark_wasted'
        ? 'Optional comments for wastage resolution:'
        : 'Optional comments for return-to-sender resolution:',
      ''
    );
    if (notes === null) return;
    try {
      await api.put(`/stock/transfers/${t._id}/resolve-difference`, { resolution, notes });
      toast.success(resolution === 'mark_wasted' ? 'Difference marked wasted.' : 'Difference accepted back to sender.');
      await loadTransfers();
      await loadLots();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to resolve transfer difference');
    }
  };

  const respondOrderRequest = async (requestRow, action) => {
    if (!canManage) return;
    try {
      const lotSelections = action === 'accepted'
        ? (requestRow.items || []).map((it, idx) => {
          const siteLots = orderRequestLotsBySite[String(requestRow.sourceSiteId || '')] || [];
          const productLots = siteLots.filter((l) =>
            String(l.productName || '').trim().toLowerCase() === String(it.productName || '').trim().toLowerCase()
          );
          const allocations = productLots
            .map((l) => ({
              lotId: l._id,
              quantity: Number(orderRequestLotSelection[`${requestRow._id}:${idx}:${l._id}`] || 0),
            }))
            .filter((a) => a.quantity > 0);
          if (allocations.some((a) => !Number.isInteger(Number(a.quantity || 0)))) {
            throw new Error(`Only whole-number quantities are allowed for ${it.productName}`);
          }
          return { itemIndex: idx, allocations };
        })
        : [];

      if (action === 'accepted') {
        for (let idx = 0; idx < (requestRow.items || []).length; idx += 1) {
          const reqItem = requestRow.items[idx];
          const selected = lotSelections.find((x) => Number(x.itemIndex) === idx);
          const selectedQty = (selected?.allocations || []).reduce((sum, a) => sum + Number(a.quantity || 0), 0);
          if (Number(selectedQty) !== Number(reqItem.quantity || 0)) {
            return toast.warn(`For ${reqItem.productName}, selected total must be exactly ${reqItem.quantity}.`);
          }
        }
      }

      await api.put(`/stock/order-requests/${requestRow._id}/respond`, { action, lotSelections });
      toast.success(`Order stock request ${action}.`);
      await loadOrderRequests();
      await loadTransfers();
      await loadLots();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to respond order stock request');
    }
  };

  const renderInitiatedItems = (t) => (t.items || []).map((i) => `${i.productName} (${i.lotCode}) x ${Number(i.requestedQty || 0)}`).join(', ');
  const renderFinalItems = (t) => {
    if (t.status === 'accepted') {
      return (t.items || []).map((i) => `${i.productName} (${i.lotCode}) x ${Number(i.requestedQty || 0)}`).join(', ');
    }
    if (t.status === 'returned' || t.status === 'cancelled') return '-';
    return (t.items || []).map((i) => {
      const acceptedQty = i.acceptedQty === undefined || i.acceptedQty === null ? i.requestedQty : i.acceptedQty;
      return `${i.productName} (${i.lotCode}) x ${Number(acceptedQty || 0)}`;
    }).join(', ');
  };

  const transferColumns = [
    { name: 'Transfer#', selector: (row) => row.transferNumber || '-', sortable: true, wrap: true, grow: 1.2, getter: (row) => row.transferNumber || '-' },
    { name: 'Requested At', selector: (row) => formatDateTime(row.createdAt), sortable: true, wrap: true, grow: 1.2, getter: (row) => formatDateTime(row.createdAt) },
    { name: 'Responded At', selector: (row) => formatDateTime(row.responseAt || row.updatedAt), sortable: true, wrap: true, grow: 1.2, getter: (row) => formatDateTime(row.responseAt || row.updatedAt) },
    { name: 'From', selector: (row) => row.fromName || '-', sortable: true, wrap: true, getter: (row) => row.fromName || '-' },
    { name: 'To', selector: (row) => row.toName || '-', sortable: true, wrap: true, getter: (row) => row.toName || '-' },
    {
      name: 'Status',
      cell: (row) => {
        const pendingDiff = row.status === 'modified' && row.differenceStatus === 'pending_sender';
        return (
          <div className="flex flex-col">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${statusBadgeClass(row.status)}`}>
              {row.status || '-'}
            </span>
            {pendingDiff && <span className="text-[11px] text-amber-700 mt-1">Awaiting sender decision</span>}
          </div>
        );
      },
      sortable: true,
      selector: (row) => row.status || '-',
      wrap: true,
      getter: (row) => row.status || '-',
    },
    { name: 'Initiated Items', selector: (row) => renderInitiatedItems(row), wrap: true, grow: 2.5, getter: (row) => renderInitiatedItems(row) },
    { name: 'Final Accepted Items', selector: (row) => renderFinalItems(row), wrap: true, grow: 2.5, getter: (row) => renderFinalItems(row) },
    {
      name: 'Difference Resolution',
      cell: (row) => {
        if (row.status !== 'modified') return <span className="text-gray-500">N/A</span>;
        if (row.differenceStatus === 'pending_sender') {
          return <span className="text-amber-700 font-medium">Pending Sender Decision</span>;
        }
        if (row.differenceStatus === 'resolved_returned') {
          return (
            <div className="text-xs">
              <div className="text-green-700 font-medium">Accepted Back</div>
              <div className="text-gray-600">{formatDateTime(row.differenceResolvedAt)}</div>
            </div>
          );
        }
        if (row.differenceStatus === 'resolved_wasted') {
          return (
            <div className="text-xs">
              <div className="text-red-700 font-medium">Marked Wasted</div>
              <div className="text-gray-600">{formatDateTime(row.differenceResolvedAt)}</div>
            </div>
          );
        }
        return <span className="text-gray-500">-</span>;
      },
      sortable: true,
      selector: (row) => row.differenceStatus || 'none',
      wrap: true,
      grow: 1.4,
      getter: (row) => `${row.differenceStatus || 'none'} ${formatDateTime(row.differenceResolvedAt)}`,
    },
    {
      name: 'Actions',
      cell: (t) => {
        const canRespond = t.status === 'pending' && canAccessEntity(t.toType, t.toId);
        const canCancel = t.status === 'pending' && (user?.role === 'admin' || (t.createdBy && String(t.createdBy) === String(user?.id)));
        const canResolveDifference = t.status === 'modified'
          && t.differenceStatus === 'pending_sender'
          && canAccessEntity(t.fromType, t.fromId);
        if (canRespond) {
          return (
            <div className="flex flex-col gap-1 py-1">
              <button className="text-green-700 hover:underline text-left" onClick={() => respond(t, 'accepted')}>Accept</button>
              <button className="text-yellow-700 hover:underline text-left" onClick={() => openModifyTransfer(t)}>Modify</button>
              <button className="text-red-700 hover:underline text-left" onClick={() => respond(t, 'returned')}>Return</button>
            </div>
          );
        }
        if (canResolveDifference) {
          return (
            <div className="flex flex-col gap-1 py-1">
              <button className="text-green-700 hover:underline text-left" onClick={() => resolveDifference(t, 'return_to_sender')}>Accept Back</button>
              <button className="text-red-700 hover:underline text-left" onClick={() => resolveDifference(t, 'mark_wasted')}>Mark Wasted</button>
            </div>
          );
        }
        if (canCancel) return <button className="text-red-700 hover:underline" onClick={() => cancelTransfer(t)}>Cancel</button>;
        return <span className="text-gray-500">Completed</span>;
      },
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      grow: 1.2,
      getter: () => '',
    },
  ];

  const requestColumns = [
    { name: 'Request#', selector: (r) => r.requestNumber || '-', sortable: true, wrap: true, getter: (r) => r.requestNumber || '-' },
    { name: 'Requested At', selector: (r) => formatDateTime(r.createdAt || r.requestedAt), sortable: true, wrap: true, getter: (r) => formatDateTime(r.createdAt || r.requestedAt) },
    { name: 'Order#', selector: (r) => r.orderNumber || '-', sortable: true, wrap: true, getter: (r) => r.orderNumber || '-' },
    { name: 'Source Site', selector: (r) => r.sourceSiteName || '-', sortable: true, wrap: true, getter: (r) => r.sourceSiteName || '-' },
    {
      name: 'Items',
      cell: (r) => (
        <div className="space-y-2 py-1 w-full">
          {(r.items || []).map((i, idx) => {
            const siteLots = orderRequestLotsBySite[String(r.sourceSiteId || '')] || [];
            const productLots = siteLots.filter((l) =>
              String(l.productName || '').trim().toLowerCase() === String(i.productName || '').trim().toLowerCase()
            );
            return (
              <div key={`${r._id}-${idx}`} className="border rounded p-2">
                <div className="text-xs mb-1">{i.productName} x {i.quantity}</div>
                <div className="space-y-1">
                  {productLots.map((l) => (
                    <div key={l._id} className="flex flex-col gap-2 text-xs">
                      <div className="flex-1 break-all">{l.lotCode} (Avail: {Number(l.quantityAvailable || 0)})</div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        max={Number(l.quantityAvailable || 0)}
                        className="border rounded w-full h-10 px-2 text-base"
                        placeholder="Qty"
                        value={orderRequestLotSelection[`${r._id}:${idx}:${l._id}`] ?? ''}
                        onWheel={preventNumberScroll}
                        onKeyDown={preventNonIntegerKeys}
                        onChange={(e) => setOrderRequestLotSelection((prev) => ({ ...prev, [`${r._id}:${idx}:${l._id}`]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="text-[11px] text-gray-600">
                    Selected total: {
                      productLots.reduce((sum, l) => sum + Number(orderRequestLotSelection[`${r._id}:${idx}:${l._id}`] || 0), 0)
                    } / Required: {Number(i.quantity || 0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ),
      grow: 2.2,
      minWidth: '300px',
      getter: (r) => (r.items || []).map((i) => `${i.productName} x ${i.quantity}`).join('; '),
    },
    { name: 'Requested By', selector: (r) => r.requestedByName || '-', sortable: true, wrap: true, getter: (r) => r.requestedByName || '-' },
    {
      name: 'Status',
      cell: (r) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${statusBadgeClass(r.status)}`}>
          {r.status || '-'}
        </span>
      ),
      sortable: true,
      selector: (r) => r.status || '-',
      wrap: true,
      getter: (r) => r.status || '-',
    },
    {
      name: 'Actions',
      cell: (r) => (
        <div className="flex flex-col gap-1 py-1">
          <button className="text-green-700 hover:underline text-left" onClick={() => respondOrderRequest(r, 'accepted')}>Accept</button>
          <button className="text-red-700 hover:underline text-left" onClick={() => respondOrderRequest(r, 'rejected')}>Reject</button>
        </div>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      getter: () => '',
    },
  ];

  const transferFiltered = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) => [
      t.transferNumber,
      t.fromName,
      t.toName,
      t.status,
      renderInitiatedItems(t),
      renderFinalItems(t),
      formatDateTime(t.createdAt),
      formatDateTime(t.responseAt || t.updatedAt),
    ].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)));
  }, [transfers, transferSearch]);

  const requestFiltered = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    if (!q) return orderRequests;
    return orderRequests.filter((r) => [
      r.requestNumber,
      r.orderNumber,
      r.sourceSiteName,
      r.requestedByName,
      r.status,
      formatDateTime(r.createdAt || r.requestedAt),
      (r.items || []).map((i) => `${i.productName} x ${i.quantity}`).join(', '),
    ].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)));
  }, [orderRequests, requestSearch]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  const requestTableStyles = {
    tableWrapper: {
      style: {
        display: 'block',
        overflowX: 'auto',
      },
    },
    rows: {
      style: {
        minHeight: '84px',
        alignItems: 'flex-start',
      },
    },
    cells: {
      style: {
        paddingTop: '10px',
        paddingBottom: '10px',
        overflow: 'visible',
        alignItems: 'flex-start',
      },
    },
    headCells: {
      style: {
        fontSize: '13px',
      },
    },
  };

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Stock Transfer & Receiving (Lot Based)</h2>
      <form onSubmit={createTransfer} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <select className="border p-2 rounded" value={form.fromType} onChange={(e) => setForm({ ...form, fromType: e.target.value, fromId: '', lotId: '' })}>
          <option value="warehouse">From Warehouse</option><option value="site">From Sale Point/Site</option><option value="wholeseller">From Wholeseller</option><option value="online">From Online</option>
        </select>
        <select className="border p-2 rounded" value={form.fromId} onChange={(e) => setForm({ ...form, fromId: e.target.value, lotId: '' })} required>
          <option value="">Select Source</option>{fromChoices.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.toType} onChange={(e) => setForm({ ...form, toType: e.target.value, toId: '' })}>
          <option value="site">To Sale Point/Site</option><option value="warehouse">To Warehouse</option><option value="wholeseller">To Wholeseller</option><option value="online">To Online</option>
        </select>
        <select className="border p-2 rounded" value={form.toId} onChange={(e) => setForm({ ...form, toId: e.target.value })} required>
          <option value="">Select Target</option>{toChoices.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select className="border p-2 rounded md:col-span-2" value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} required>
          <option value="">Select Source Lot</option>{lots.map((l) => <option key={l._id} value={l._id}>{l.lotCode} | {l.productName} | Available: {l.quantityAvailable}</option>)}
        </select>
        <input type="number" min="1" step="1" className="border p-2 rounded" placeholder="Quantity" value={form.quantity} onWheel={preventNumberScroll} onKeyDown={preventNonIntegerKeys} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <div className="md:col-span-2 text-sm text-gray-600">{selectedLot ? `Product: ${selectedLot.productName} | Lot: ${selectedLot.lotCode}` : 'Pick a lot to transfer.'}</div>
        <button className="bg-green-600 text-white px-4 py-2 rounded">Initiate Transfer</button>
      </form>

      <div className="bg-white rounded shadow p-3 mb-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
          <input className="border p-2 rounded w-full md:max-w-sm" placeholder="Search transfers..." value={transferSearch} onChange={(e) => setTransferSearch(e.target.value)} />
          <div className="flex gap-2">
            <button className="border px-3 py-1 rounded" onClick={() => downloadCsv('stock-transfers-visible.csv', transferColumns, transferFiltered)}>Download Visible</button>
            <button className="border px-3 py-1 rounded" onClick={() => downloadCsv('stock-transfers-all.csv', transferColumns, transfers)}>Download All</button>
          </div>
        </div>
        <DataTable columns={transferColumns} data={transferFiltered} pagination highlightOnHover dense responsive persistTableHead noDataComponent="No transfers." />
      </div>

      <div className="bg-white rounded shadow p-3">
        <div className="font-semibold mb-2">Pending Online Order Stock Requests (from Order Management)</div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
          <input className="border p-2 rounded w-full md:max-w-sm" placeholder="Search order stock requests..." value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} />
          <div className="flex gap-2">
            <button className="border px-3 py-1 rounded" onClick={() => downloadCsv('order-stock-requests-visible.csv', requestColumns, requestFiltered)}>Download Visible</button>
            <button className="border px-3 py-1 rounded" onClick={() => downloadCsv('order-stock-requests-all.csv', requestColumns, orderRequests)}>Download All</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            columns={requestColumns}
            data={requestFiltered}
            pagination
            highlightOnHover
            responsive
            persistTableHead
            customStyles={requestTableStyles}
            noDataComponent="No pending requests."
          />
        </div>
      </div>

      {modifyModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-3">Modify Transfer {modifyModal.transfer?.transferNumber}</h3>
            <div className="space-y-2">
              {modifyModal.items.map((it, idx) => (
                <div key={it.itemId} className="border rounded p-2 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                  <div className="md:col-span-2 text-sm">{it.productName} ({it.lotCode})</div>
                  <div className="text-sm">Requested: {it.requestedQty}</div>
                  <div className="text-sm">Accepted:</div>
                  <input
                    type="number"
                    min="0"
                    max={it.requestedQty}
                    step="1"
                    className="border p-1 rounded"
                    value={it.acceptedQty}
                    onWheel={preventNumberScroll}
                    onKeyDown={preventNonIntegerKeys}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModifyModal((p) => ({
                        ...p,
                        items: p.items.map((x, i) => i === idx ? { ...x, acceptedQty: val } : x),
                      }));
                    }}
                  />
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <label className="text-sm">
                  Difference Handling
                  <select
                    className="border p-2 rounded w-full"
                    value={modifyModal.returnDisposition}
                    onChange={(e) => setModifyModal((p) => ({ ...p, returnDisposition: e.target.value }))}
                  >
                    <option value="return_to_sender">Return difference to sender</option>
                    <option value="mark_wasted">Mark difference as wasted</option>
                  </select>
                </label>
                <label className="text-sm">
                  Remarks
                  <input
                    className="border p-2 rounded w-full"
                    value={modifyModal.receiverRemarks}
                    onChange={(e) => setModifyModal((p) => ({ ...p, receiverRemarks: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="border px-3 py-2 rounded" onClick={() => setModifyModal({ open: false, transfer: null, items: [], returnDisposition: 'return_to_sender', receiverRemarks: '' })}>Cancel</button>
              <button className="bg-yellow-600 text-white px-3 py-2 rounded" onClick={submitModifyTransfer}>Submit Modification</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTransfer;
