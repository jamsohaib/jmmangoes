import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from 'react-data-table-component';
import api, { toPublicAssetUrl } from '../lib/api';
import useAuthStore from '../store/authStore';

const OrderManagement = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.orderManagement?.view;
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [dispatchForm, setDispatchForm] = useState({});

  const [rejectModal, setRejectModal] = useState({ open: false, orderId: '', reason: 'Order cancelled due to stock unavailability' });
  const [cancelModal, setCancelModal] = useState({ open: false, orderId: '', reason: '' });
  const [returnModal, setReturnModal] = useState({ open: false, orderId: '', reason: 'Customer return request' });
  const [modifyModal, setModifyModal] = useState({ open: false, order: null, discountAmount: '0', items: [] });
  const [viewOrderModal, setViewOrderModal] = useState({ open: false, order: null });
  const [feedbackModal, setFeedbackModal] = useState({ open: false, order: null });
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [newItem, setNewItem] = useState({ productId: '', quantity: 1 });
  const [tableSearch, setTableSearch] = useState({});
  const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');

  const load = async () => {
    const [o, c] = await Promise.all([api.get('/orders'), api.get('/couriers')]);
    setOrders(o.data || []);
    setCouriers(c.data || []);
  };
  useEffect(() => { if (canView) load().catch(console.error); }, [canView]);
  useEffect(() => {
    if (!canView) return;
    api.get('/payment-methods')
      .then((res) => setPaymentMethods(res.data || []))
      .catch(() => {});
  }, [canView]);
  useEffect(() => {
    if (!canView) return;
    api.get('/getProductsForPublic')
      .then((res) => setProducts(
        (res.data || []).filter((p) => (
          p?.isActive &&
          p?.isAvailableForCart !== false &&
          p?.productChannel === 'website'
        ))
      ))
      .catch(() => {});
  }, [canView]);

  const grouped = useMemo(() => ({
    pending: orders.filter((o) => o.status === 'pending_confirmation'),
    courier: orders.filter((o) => o.status === 'confirmed'),
    dispatched: orders.filter((o) => o.status === 'dispatched'),
    delivered: orders.filter((o) => o.status === 'delivered'),
    returned: orders.filter((o) => o.status === 'returned'),
    cancelled: orders.filter((o) => o.status === 'cancelled' || o.status === 'rejected'),
  }), [orders]);

  const amount = (o) => Number(o.finalAmount || o.totalCost || 0).toFixed(2);
  const paymentLabel = (o) => o?.paymentDetails?.methodName || o?.paymentMode || '-';
  const isCodOrder = (o) => o?.paymentMode === 'cod' || o?.paymentDetails?.methodCode === 'cash-on-delivery';
  const modifySubtotal = modifyModal.items.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
  const modifyShipping = Number(modifyModal.order?.shippingCost || 0);
  const modifyDiscount = Number(modifyModal.discountAmount || 0);
  const modifyBase = Math.max(0, modifySubtotal + modifyShipping - modifyDiscount);
  const selectedModifyPaymentMethod = paymentMethods.find((m) => String(m._id) === String(modifyModal.paymentMethodId));
  const modifyPaymentDiscount = selectedModifyPaymentMethod?.discountType === 'fixed'
    ? Number(selectedModifyPaymentMethod.discountValue || 0)
    : selectedModifyPaymentMethod?.discountType === 'percentage'
      ? (modifyBase * Number(selectedModifyPaymentMethod.discountValue || 0)) / 100
      : 0;
  const modifyPaymentCharge = selectedModifyPaymentMethod?.chargeType === 'fixed'
    ? Number(selectedModifyPaymentMethod.chargeValue || 0)
    : selectedModifyPaymentMethod?.chargeType === 'percentage'
      ? (modifyBase * Number(selectedModifyPaymentMethod.chargeValue || 0)) / 100
      : 0;
  const modifyFinal = Math.max(0, modifyBase - modifyPaymentDiscount + modifyPaymentCharge);

  const confirmOrder = async (id) => {
    if (!window.confirm('Confirm this order?')) return;
    await api.put(`/orders/${id}/confirm`, {});
    toast.success('Order confirmed.');
    await load();
  };

  const dispatch = async (id) => {
    const order = orders.find((o) => String(o._id) === String(id));
    const f = dispatchForm[id] || {};
    if (!f.courierId) return toast.warn('Select courier.');
    const payload = { ...f, paymentMode: f.paymentMode || order?.paymentMode || 'cod' };
    if (!window.confirm('Dispatch this order?')) return;
    await api.put(`/orders/${id}/dispatch`, payload);
    toast.success('Order dispatched.');
    await load();
  };

  const markDelivered = async (id) => {
    if (!window.confirm('Mark as delivered?')) return;
    await api.put(`/orders/${id}/deliver`, {});
    toast.success('Order marked delivered.');
    await load();
  };

  const verifyPayment = async (id) => {
    if (!window.confirm('Mark this payment as verified?')) return;
    try {
      await api.put(`/orders/${id}/verify-payment`, {});
      toast.success('Payment verified.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to verify payment.');
    }
  };

  const openModify = (order) => {
    setModifyModal({
      open: true,
      order,
      discountAmount: String(order.discountAmount || 0),
      paymentMethodId: order?.paymentDetails?.methodId ? String(order.paymentDetails.methodId) : '',
      items: (order.items || []).map((i) => ({ ...i, quantity: Number(i.quantity || 1) })),
    });
    setNewItem({ productId: '', quantity: 1 });
  };

  const saveModify = async () => {
    const { order, items, discountAmount, paymentMethodId } = modifyModal;
    if (!order) return;
    if (!window.confirm('Save modified order and send email?')) return;
    try {
      await api.put(`/orders/${order._id}/modify`, {
        items,
        discountAmount: Number(discountAmount || 0),
        paymentMethodId: paymentMethodId || undefined,
      });
      toast.success('Order modified.');
      setModifyModal({ open: false, order: null, discountAmount: '0', paymentMethodId: '', items: [] });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to modify order.');
    }
  };

  const addProductToModifyOrder = () => {
    const product = products.find((p) => String(p._id) === String(newItem.productId));
    const qtyToAdd = Number(newItem.quantity || 0);
    if (!product) return toast.warn('Select a product.');
    if (qtyToAdd < 1) return toast.warn('Quantity must be at least 1.');
    if (qtyToAdd > Number(product.quantity || 0)) {
      return toast.warn(`Insufficient stock. Available: ${Number(product.quantity || 0)}`);
    }

    const existing = modifyModal.items.find((it) => String(it.productId) === String(product._id));
    if (existing) {
      const updatedQty = Number(existing.quantity || 0) + qtyToAdd;
      if (updatedQty > Number(product.quantity || 0)) {
        return toast.warn(`Cannot exceed stock for ${product.name}. Available: ${Number(product.quantity || 0)}`);
      }
      setModifyModal((p) => ({
        ...p,
        items: p.items.map((it) => String(it.productId) === String(product._id) ? { ...it, quantity: updatedQty } : it),
      }));
    } else {
      setModifyModal((p) => ({
        ...p,
        items: [...p.items, { productId: product._id, name: product.name, price: Number(product.price || 0), quantity: qtyToAdd }],
      }));
    }

    setNewItem({ productId: '', quantity: 1 });
  };

  const submitReject = async () => {
    await api.put(`/orders/${rejectModal.orderId}/reject`, { reason: rejectModal.reason || 'Order cancelled due to stock unavailability' });
    toast.success('Order cancelled.');
    setRejectModal({ open: false, orderId: '', reason: 'Order cancelled due to stock unavailability' });
    await load();
  };

  const submitCancel = async () => {
    await api.put(`/orders/${cancelModal.orderId}/cancel`, { reason: cancelModal.reason || 'Cancelled by request' });
    toast.success('Order cancelled.');
    setCancelModal({ open: false, orderId: '', reason: '' });
    await load();
  };

  const submitReturn = async () => {
    await api.put(`/orders/${returnModal.orderId}/return`, { reason: returnModal.reason || 'Customer return request' });
    toast.success('Order marked returned.');
    setReturnModal({ open: false, orderId: '', reason: 'Customer return request' });
    await load();
  };

  const sendFeedbackReminder = async (id) => {
    if (!window.confirm('Send feedback reminder email to customer?')) return;
    try {
      await api.put(`/orders/${id}/feedback-reminder`, {});
      toast.success('Feedback reminder sent.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reminder.');
    }
  };

  const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const downloadOrdersCsv = (title, sourceRows, suffix = 'all') => {
    const headers = ['Order #', 'Date & Time', 'Customer Name', 'Customer Email', 'Amount', 'Payment', 'Receipt', 'Payment Verified', 'Status'];
    const csvRows = sourceRows.map((o) => [
      csvEscape(o.orderNumber || '-'),
      csvEscape(new Date(o.createdAt || o.updatedAt || Date.now()).toLocaleString()),
      csvEscape(o.customer?.name || '-'),
      csvEscape(o.customer?.email || '-'),
      csvEscape(Number(o.finalAmount || o.totalCost || 0).toFixed(2)),
      csvEscape(paymentLabel(o)),
      csvEscape(o?.paymentDetails?.receiptUrl ? toPublicAssetUrl(o.paymentDetails.receiptUrl) : '-'),
      csvEscape(o?.paymentDetails?.isVerified ? 'Yes' : 'No'),
      csvEscape(o.status || '-'),
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderTable = (tableKey, title, rows, actions) => {
    const q = String(tableSearch[tableKey] || '').trim().toLowerCase();
    const filteredRows = !q ? rows : rows.filter((o) =>
      String(o.orderNumber || '').toLowerCase().includes(q) ||
      String(o.customer?.name || '').toLowerCase().includes(q) ||
      String(o.customer?.email || '').toLowerCase().includes(q) ||
      String(o.status || '').toLowerCase().includes(q) ||
      String(paymentLabel(o) || '').toLowerCase().includes(q)
    );
    return (
    <div className="bg-white rounded shadow mb-5 overflow-x-auto">
      <div className="px-4 py-3 border-b font-semibold">{title}</div>
      <div className="px-4 py-3 border-b flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <input
          type="text"
          value={tableSearch[tableKey] || ''}
          onChange={(e) => setTableSearch((p) => ({ ...p, [tableKey]: e.target.value }))}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="border rounded px-3 py-2 text-sm w-full md:max-w-sm"
        />
        <div className="flex gap-2">
          <button onClick={() => downloadOrdersCsv(title, filteredRows, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
          <button onClick={() => downloadOrdersCsv(title, rows, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
        </div>
      </div>
      <DataTable
        columns={[
          { name: 'Order #', selector: (o) => o.orderNumber || '-', sortable: true, wrap: true },
          {
            name: 'Date & Time',
            selector: (o) => new Date(o.createdAt || o.updatedAt || Date.now()).toLocaleString(),
            sortable: true,
            wrap: true,
          },
          {
            name: 'Customer',
            selector: (o) => `${o.customer?.name || '-'} ${o.customer?.email || ''}`.trim(),
            sortable: true,
            wrap: true,
            grow: 1.2,
            cell: (o) => (
              <div>
                <div>{o.customer?.name || '-'}</div>
                <div className="text-xs text-gray-600">{o.customer?.email || '-'}</div>
              </div>
            ),
          },
          {
            name: 'Amount',
            selector: (o) => Number(o.finalAmount || o.totalCost || 0),
            sortable: true,
            right: true,
            cell: (o) => `PKR ${amount(o)}`,
          },
          { name: 'Payment', selector: (o) => paymentLabel(o), sortable: true, wrap: true },
          {
            name: 'Receipt',
            selector: (o) => (o?.paymentDetails?.receiptUrl ? 'View' : '-'),
            wrap: true,
            cell: (o) => (
              <div>
                {o?.paymentDetails?.receiptUrl ? (
                  <a className="text-blue-700 hover:underline" href={toPublicAssetUrl(o.paymentDetails.receiptUrl)} target="_blank" rel="noreferrer">View</a>
                ) : '-'}
                <div className="text-xs text-gray-600 mt-1">
                  {o?.paymentDetails?.isVerified ? `Verified${o?.paymentDetails?.verifiedByName ? ` by ${o.paymentDetails.verifiedByName}` : ''}` : 'Not Verified'}
                </div>
              </div>
            ),
          },
          {
            name: 'Actions',
            cell: (o) => actions(o),
            ignoreRowClick: true,
            allowOverflow: true,
            button: true,
            grow: 0,
            width: tableKey === 'courier' ? '300px' : '240px',
            minWidth: tableKey === 'courier' ? '300px' : '240px',
            maxWidth: tableKey === 'courier' ? '300px' : '240px',
          },
        ]}
        data={filteredRows}
        pagination
        highlightOnHover
        striped
        dense
        noDataComponent="No orders"
      />
    </div>
    );
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Order Management</h2>
      {renderTable('pending', 'Pending For Confirmation', grouped.pending, (o) => (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          {!isCodOrder(o) && !o?.paymentDetails?.isVerified ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Verify Payment</button> : null}
          <button onClick={() => confirmOrder(o._id)} className="text-green-700 hover:underline">Confirm</button>
          <button onClick={() => setRejectModal({ open: true, orderId: o._id, reason: 'Order cancelled due to stock unavailability' })} className="text-red-600 hover:underline">Cancel Order</button>
          <button onClick={() => openModify(o)} className="text-blue-600 hover:underline">Modify</button>
        </div>
      ))}

      {renderTable('courier', 'Enter Courier Details', grouped.courier, (o) => (
        <div className="space-y-3 w-full">
          <div className="flex gap-2">
            <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <select className="border p-2 rounded text-sm w-full" onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), courierId: e.target.value } }))}>
              <option value="">Courier</option>
              {couriers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input className="border p-2 rounded text-sm w-full" placeholder="Tracking #" onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), trackingNumber: e.target.value } }))} />
            <select
              className="border p-2 rounded text-sm w-full"
              value={dispatchForm[o._id]?.paymentMode ?? o.paymentMode ?? 'cod'}
              onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), paymentMode: e.target.value } }))}
            >
              <option value="cod">Cash On Delivery</option><option value="prepaid">Prepaid</option><option value="free">Free</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => dispatch(o._id)} className="text-blue-700 hover:underline">Order Dispatched</button>
            {!isCodOrder(o) && !o?.paymentDetails?.isVerified && o?.paymentDetails?.receiptUrl ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Mark Payment Verified</button> : null}
            <button onClick={() => setCancelModal({ open: true, orderId: o._id, reason: '' })} className="text-red-600 hover:underline">Cancel Order</button>
          </div>
        </div>
      ))}

      {renderTable('dispatched', 'Dispatched Orders', grouped.dispatched, (o) => (
        <div className="flex gap-2">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          {!isCodOrder(o) && !o?.paymentDetails?.isVerified && o?.paymentDetails?.receiptUrl ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Mark Payment Verified</button> : null}
          <button onClick={() => markDelivered(o._id)} className="text-green-700 hover:underline">Mark Delivered</button>
          <button onClick={() => setReturnModal({ open: true, orderId: o._id, reason: 'Customer return request' })} className="text-red-600 hover:underline">Mark Returned</button>
        </div>
      ))}

      {renderTable('delivered', 'Delivered Orders', grouped.delivered, (o) => (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          {o.feedback?.rating ? (
            <button onClick={() => setFeedbackModal({ open: true, order: o })} className="text-green-700 hover:underline">View Feedback</button>
          ) : (
            <button onClick={() => sendFeedbackReminder(o._id)} className="text-blue-700 hover:underline">Send Feedback Reminder</button>
          )}
        </div>
      ))}
      {renderTable('returned', 'Returned Orders', grouped.returned, (o) => (
        <div className="flex flex-col gap-1">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline text-left">View Order</button>
          <span>{o.adminRemarks || '-'}</span>
        </div>
      ))}
      {renderTable('cancelled', 'Cancelled Orders', grouped.cancelled, (o) => (
        <div className="flex flex-col gap-1">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline text-left">View Order</button>
          <span>{o.adminRemarks || o.rejectionReason || '-'}</span>
        </div>
      ))}

      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3"><div className="bg-white rounded shadow p-4 w-full max-w-md"><h3 className="font-semibold mb-2">Cancel Order</h3><textarea value={rejectModal.reason} onChange={(e) => setRejectModal((p) => ({ ...p, reason: e.target.value }))} className="w-full border p-2 rounded" rows={3} /><div className="flex justify-end gap-2 mt-3"><button className="border px-3 py-2 rounded" onClick={() => setRejectModal({ open: false, orderId: '', reason: 'Order cancelled due to stock unavailability' })}>Back</button><button className="bg-red-600 text-white px-3 py-2 rounded" onClick={submitReject}>Confirm Cancellation</button></div></div></div>
      )}

      {cancelModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3"><div className="bg-white rounded shadow p-4 w-full max-w-md"><h3 className="font-semibold mb-2">Cancel Order</h3><textarea value={cancelModal.reason} onChange={(e) => setCancelModal((p) => ({ ...p, reason: e.target.value }))} className="w-full border p-2 rounded" rows={3} /><div className="flex justify-end gap-2 mt-3"><button className="border px-3 py-2 rounded" onClick={() => setCancelModal({ open: false, orderId: '', reason: '' })}>Back</button><button className="bg-red-600 text-white px-3 py-2 rounded" onClick={submitCancel}>Submit</button></div></div></div>
      )}

      {returnModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3"><div className="bg-white rounded shadow p-4 w-full max-w-md"><h3 className="font-semibold mb-2">Return Order</h3><textarea value={returnModal.reason} onChange={(e) => setReturnModal((p) => ({ ...p, reason: e.target.value }))} className="w-full border p-2 rounded" rows={3} /><div className="flex justify-end gap-2 mt-3"><button className="border px-3 py-2 rounded" onClick={() => setReturnModal({ open: false, orderId: '', reason: 'Customer return request' })}>Back</button><button className="bg-red-600 text-white px-3 py-2 rounded" onClick={submitReturn}>Submit</button></div></div></div>
      )}

      {modifyModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="font-semibold mb-3">Modify Order {modifyModal.order?.orderNumber}</h3>
            <div className="space-y-2">
              {modifyModal.items.map((it, idx) => (
                <div key={`${it.productId}-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div>{it.name}</div>
                  <div>Price: PKR {it.price}</div>
                  <div className="flex gap-2">
                    <input type="number" min={1} value={it.quantity} onChange={(e) => setModifyModal((p) => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value || 1) } : x) }))} className="border p-2 rounded w-full" />
                    <button
                      type="button"
                      className="px-2 py-1 border rounded text-red-600"
                      onClick={() => setModifyModal((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="border rounded p-3 mt-2">
                <div className="font-medium mb-2">Add Product</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                  <select
                    className="border p-2 rounded md:col-span-2"
                    value={newItem.productId}
                    onChange={(e) => setNewItem((p) => ({ ...p, productId: e.target.value }))}
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} (Stock: {Number(p.quantity || 0)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="border p-2 rounded"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem((p) => ({ ...p, quantity: Number(e.target.value || 1) }))}
                  />
                  <button type="button" className="bg-blue-600 text-white px-3 py-2 rounded" onClick={addProductToModifyOrder}>
                    Add
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                <label className="flex items-center gap-2">Discount Amount<input type="number" min={0} value={modifyModal.discountAmount} onChange={(e) => setModifyModal((p) => ({ ...p, discountAmount: e.target.value }))} className="border p-2 rounded w-full" /></label>
                <label className="flex items-center gap-2">
                  Payment Method
                  <select
                    className="border p-2 rounded w-full"
                    value={modifyModal.paymentMethodId || ''}
                    onChange={(e) => setModifyModal((p) => ({ ...p, paymentMethodId: e.target.value }))}
                  >
                    <option value="">Keep current</option>
                    {paymentMethods.map((m) => (
                      <option key={m._id} value={m._id}>{m.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 border rounded p-3 bg-gray-50 text-sm space-y-1">
                <div><strong>Products Subtotal:</strong> PKR {modifySubtotal.toFixed(2)}</div>
                <div><strong>Delivery Cost:</strong> PKR {modifyShipping.toFixed(2)}</div>
                <div><strong>Discount:</strong> PKR {modifyDiscount.toFixed(2)}</div>
                <div><strong>Payment Discount:</strong> PKR {modifyPaymentDiscount.toFixed(2)}</div>
                <div><strong>Payment Charge:</strong> PKR {modifyPaymentCharge.toFixed(2)}</div>
                <div className="pt-1 border-t"><strong>Total Payable:</strong> PKR {modifyFinal.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="border px-3 py-2 rounded" onClick={() => setModifyModal({ open: false, order: null, discountAmount: '0', paymentMethodId: '', items: [] })}>Cancel</button>
              <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={saveModify}>Save</button>
            </div>
          </div>
        </div>
      )}

      {viewOrderModal.open && viewOrderModal.order && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-3xl max-h-[90vh] overflow-auto text-black">
            <h3 className="text-xl font-semibold mb-2">Order Details</h3>
            <div className="text-sm mb-3">
              <div><strong>Order #:</strong> {viewOrderModal.order.orderNumber}</div>
              <div><strong>Placed At:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.placedAt || viewOrderModal.order?.createdAt)}</div>
              <div><strong>Customer:</strong> {viewOrderModal.order.customer?.name || '-'}</div>
              <div><strong>Email:</strong> {viewOrderModal.order.customer?.email || '-'}</div>
              <div><strong>Mobile:</strong> {viewOrderModal.order.customer?.mobile || '-'}</div>
              <div><strong>Status:</strong> {viewOrderModal.order.status}</div>
              <div><strong>Payment Mode:</strong> {viewOrderModal.order.paymentMode}</div>
              <div><strong>Payment Method:</strong> {viewOrderModal.order.paymentDetails?.methodName || '-'}</div>
              {viewOrderModal.order.paymentDetails?.receiptUrl ? (
                <div>
                  <strong>Receipt:</strong>{' '}
                  <a className="text-blue-700 hover:underline" href={toPublicAssetUrl(viewOrderModal.order.paymentDetails.receiptUrl)} target="_blank" rel="noreferrer">
                    View receipt
                  </a>
                </div>
              ) : null}
              <div><strong>Payment Verified:</strong> {viewOrderModal.order.paymentDetails?.isVerified ? 'Yes' : 'No'}</div>
            </div>

            <div className="mb-3 text-sm border rounded p-3 bg-gray-50">
              <div className="font-semibold mb-2">Order Timeline</div>
              <div><strong>Order Placed:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.placedAt || viewOrderModal.order?.createdAt)}</div>
              <div><strong>Order Confirmed:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.confirmedAt)}</div>
              <div><strong>Order Dispatched:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.dispatchedAt)}</div>
              <div><strong>Order Delivered:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.deliveredAt)}</div>
              <div><strong>Order Cancelled:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.cancelledAt)}</div>
              <div><strong>Order Returned:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.returnedAt)}</div>
            </div>

            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-3 py-2">Item</th>
                    <th className="border px-3 py-2">Qty</th>
                    <th className="border px-3 py-2">Price</th>
                    <th className="border px-3 py-2">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewOrderModal.order.items || []).map((it, idx) => (
                    <tr key={`${it.productId || it.name}-${idx}`}>
                      <td className="border px-3 py-2">{it.name}</td>
                      <td className="border px-3 py-2">{it.quantity}</td>
                      <td className="border px-3 py-2">PKR {Number(it.price || 0).toFixed(2)}</td>
                      <td className="border px-3 py-2">PKR {(Number(it.price || 0) * Number(it.quantity || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-sm">
              <div><strong>Subtotal:</strong> PKR {Number(viewOrderModal.order.subtotal || 0).toFixed(2)}</div>
              <div><strong>Shipping:</strong> PKR {Number(viewOrderModal.order.shippingCost || 0).toFixed(2)}</div>
              <div><strong>Payment Discount:</strong> PKR {Number(viewOrderModal.order.paymentDetails?.paymentDiscount || 0).toFixed(2)}</div>
              <div><strong>Payment Charge:</strong> PKR {Number(viewOrderModal.order.paymentDetails?.paymentCharge || 0).toFixed(2)}</div>
              <div><strong>Discount:</strong> PKR {Number(viewOrderModal.order.discountAmount || 0).toFixed(2)}</div>
              <div><strong>Final Amount:</strong> PKR {Number(viewOrderModal.order.finalAmount || viewOrderModal.order.totalCost || 0).toFixed(2)}</div>
              <div><strong>Payable Amount:</strong> PKR {Number(viewOrderModal.order.paymentDetails?.payableAmount || viewOrderModal.order.finalAmount || viewOrderModal.order.totalCost || 0).toFixed(2)}</div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                className="border px-4 py-2 rounded"
                onClick={() => setViewOrderModal({ open: false, order: null })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.open && feedbackModal.order && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-xl text-black">
            <h3 className="text-lg font-semibold mb-2">Order Feedback</h3>
            <div className="text-sm space-y-1">
              <div><strong>Order #:</strong> {feedbackModal.order.orderNumber}</div>
              <div><strong>Customer:</strong> {feedbackModal.order.customer?.name || '-'}</div>
              <div><strong>Rating:</strong> {feedbackModal.order.feedback?.rating || '-'} / 5</div>
              <div><strong>Comments:</strong> {feedbackModal.order.feedback?.comments || '-'}</div>
              <div><strong>Submitted At:</strong> {feedbackModal.order.feedback?.submittedAt ? new Date(feedbackModal.order.feedback.submittedAt).toLocaleString() : '-'}</div>
            </div>
            <div className="flex justify-end mt-4">
              <button className="border px-4 py-2 rounded" onClick={() => setFeedbackModal({ open: false, order: null })}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
