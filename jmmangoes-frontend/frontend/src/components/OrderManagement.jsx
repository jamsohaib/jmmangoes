import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from './common/DataTable';
import api, { toPublicAssetUrl } from '../lib/api';
import useAuthStore from '../store/authStore';

const OrderManagement = () => {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.id === 'super-admin' || String(user?.username || '').toLowerCase() === 'admin';
  const canView = user?.role === 'admin' || user?.permissions?.orderManagement?.view;
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [dispatchForm, setDispatchForm] = useState({});
  const [whatsAppPrefs, setWhatsAppPrefs] = useState({});

  const [rejectModal, setRejectModal] = useState({ open: false, orderId: '', reason: 'Order cancelled due to stock unavailability' });
  const [cancelModal, setCancelModal] = useState({ open: false, orderId: '', reason: '' });
  const [returnModal, setReturnModal] = useState({ open: false, orderId: '', reason: 'Customer return request' });
  const [modifyModal, setModifyModal] = useState({ open: false, order: null, discountAmount: '0', items: [], fulfilmentSiteId: '', fulfilmentOptions: [], loadingSites: false, sendModificationEmail: true });
  const [viewOrderModal, setViewOrderModal] = useState({ open: false, order: null });
  const [notesModal, setNotesModal] = useState({ open: false, order: null, text: '', saving: false });
  const [giftSources, setGiftSources] = useState([]);
  const [giftModal, setGiftModal] = useState({
    open: false,
    order: null,
    giftType: 'owner',
    ownerGiftSourceId: '',
    senderName: '',
    senderContact: '',
    senderAddress: '',
    giftPaymentType: 'prepaid',
    giftAmount: '0',
    giftNote: '',
    sendGiftWhatsApp: false,
    saving: false,
  });
  const [feedbackModal, setFeedbackModal] = useState({ open: false, order: null });
  const [redirectModal, setRedirectModal] = useState({
    open: false,
    order: null,
    customer: { name: '', email: '', mobile: '', address: '', city: '' },
    courierId: '',
    trackingNumber: '',
    paymentMode: 'prepaid',
    paymentMethodName: '',
    remarks: '',
  });
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [publicSites, setPublicSites] = useState([]);
  const [stockOptionsModal, setStockOptionsModal] = useState({ open: false, order: null, options: [], loading: false, reservingSiteId: '', mode: 'reserve' });
  const [newItem, setNewItem] = useState({ productId: '', quantity: 1 });
  const [fulfilmentProducts, setFulfilmentProducts] = useState([]);
  const [loadingFulfilmentProducts, setLoadingFulfilmentProducts] = useState(false);
  const [tableSearch, setTableSearch] = useState({});
  const [globalOrderSearch, setGlobalOrderSearch] = useState('');
  const [refreshingLeopardsStatuses, setRefreshingLeopardsStatuses] = useState(false);
  const [repairingOnlineDispatchStock, setRepairingOnlineDispatchStock] = useState(false);
  const formatDateTime = (v) => (v ? new Date(v).toLocaleString() : '-');
  const getConfirmedAtForView = (order) => {
    const explicit = order?.statusTimeline?.confirmedAt;
    if (explicit) return explicit;
    if (order?.status === 'confirmed' || order?.status === 'dispatched' || order?.status === 'delivered' || order?.status === 'returned') {
      return order?.updatedAt || null;
    }
    return null;
  };
  const orderItemsText = (o) => (o?.items || [])
    .map((it) => `${it?.name || 'Product'} x ${Number(it?.quantity || 0)}`)
    .join(', ');
  const fulfillmentSourceLabel = (o) => {
    const name = o?.stockReservation?.reservedSiteName || '';
    if (name) return name;
    if (o?.stockReservation?.isReserved) return 'Reserved (source unspecified)';
    return '-';
  };
  const customerConfirmationInfo = (o) => {
    const status = o?.customerConfirmation?.status || 'none';
    const source = String(o?.customerConfirmation?.responseSource || '').toLowerCase();
    if (status === 'confirmed') {
      return {
        label: source === 'whatsapp' ? 'Automatically Confirmed by Customer' : 'Customer Confirmed',
        className: source === 'whatsapp'
          ? 'bg-cyan-100 text-cyan-900 border-cyan-300'
          : 'bg-green-100 text-green-800 border-green-300',
      };
    }
    if (status === 'cancelled') {
      return {
        label: source === 'whatsapp' ? 'Cancelled by Customer' : 'Customer Cancelled',
        className: 'bg-red-100 text-red-800 border-red-300',
      };
    }
    return {
      label: 'Customer Not Confirmed',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    };
  };
  const CustomerConfirmationBadge = ({ order }) => {
    const info = customerConfirmationInfo(order);
    return (
      <div>
        <span className={`inline-flex items-center rounded border px-2 py-1 text-xs font-semibold ${info.className}`}>
          {info.label}
        </span>
        {order?.customerConfirmation?.respondedAt ? (
          <div className="text-[11px] text-gray-600 mt-1">{formatDateTime(order.customerConfirmation.respondedAt)}</div>
        ) : null}
      </div>
    );
  };
  const GiftBadge = ({ order }) => {
    if (!order?.giftInfo?.isGift) return null;
    const type = order.giftInfo.giftType === 'owner' ? 'Owner Gift' : 'Customer Gift';
    return (
      <span className="inline-flex items-center rounded-full border border-pink-300 bg-pink-50 px-2 py-0.5 text-[11px] font-semibold text-pink-800">
        {type}
      </span>
    );
  };
  const NotesBadge = ({ order }) => {
    const count = Array.isArray(order?.notes) ? order.notes.length : 0;
    if (!count) return null;
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        {count} note{count === 1 ? '' : 's'}
      </span>
    );
  };
  const giftRowStyles = [
    {
      when: (row) => row?.customerConfirmation?.status === 'confirmed' && row?.customerConfirmation?.responseSource === 'whatsapp',
      style: {
        backgroundColor: '#ecfeff',
        borderLeft: '4px solid #06b6d4',
      },
    },
    {
      when: (row) => row?.customerConfirmation?.status === 'cancelled' && row?.customerConfirmation?.responseSource === 'whatsapp',
      style: {
        backgroundColor: '#fee2e2',
        borderLeft: '4px solid #dc2626',
      },
    },
    {
      when: (row) => Boolean(row?.giftInfo?.isGift),
      style: {
        backgroundColor: '#f5f3ff',
        borderLeft: '4px solid #8b5cf6',
      },
    },
    {
      when: (row) => Array.isArray(row?.notes) && row.notes.length > 0,
      style: {
        boxShadow: 'inset 4px 0 0 #f59e0b',
      },
    },
  ];
  const CourierStatusBadge = ({ order }) => {
    const status = order?.courier?.latestStatus || '-';
    const remarks = order?.courier?.latestStatusRemarks || '';
    const updatedAt = order?.courier?.latestStatusAt;
    const normalized = String(status || '').toLowerCase();
    const colorClass = normalized.includes('deliver')
      ? 'bg-green-100 text-green-800 border-green-300'
      : normalized.includes('return') || normalized.includes('cancel') || normalized.includes('fail')
        ? 'bg-red-100 text-red-800 border-red-300'
        : status && status !== '-'
          ? 'bg-blue-100 text-blue-800 border-blue-300'
          : 'bg-gray-100 text-gray-700 border-gray-300';
    return (
      <div className="text-xs">
        <span className={`inline-flex items-center rounded border px-2 py-1 font-semibold ${colorClass}`}>
          {status}
        </span>
        {updatedAt ? <div className="text-[11px] text-gray-600 mt-1">{formatDateTime(updatedAt)}</div> : null}
        {remarks ? <div className="text-[11px] text-gray-600 mt-1">{remarks}</div> : null}
      </div>
    );
  };
  const whatsAppKey = (action, orderId) => `${action}:${orderId}`;
  const whatsAppEnabled = (action, orderId) => whatsAppPrefs[whatsAppKey(action, orderId)] !== false;
  const setWhatsAppEnabled = (action, orderId, checked) => {
    setWhatsAppPrefs((prev) => ({ ...prev, [whatsAppKey(action, orderId)]: checked }));
  };
  const WhatsAppCheckbox = ({ action, orderId, label = 'Send WhatsApp' }) => (
    <label className="inline-flex items-center gap-1 text-xs text-green-700">
      <input
        type="checkbox"
        checked={whatsAppEnabled(action, orderId)}
        onChange={(e) => setWhatsAppEnabled(action, orderId, e.target.checked)}
      />
      {label}
    </label>
  );

  const load = async () => {
    const ordersRes = await api.get('/orders');
    setOrders(ordersRes.data || []);
    try {
      const couriersRes = await api.get('/couriers');
      setCouriers(couriersRes.data || []);
    } catch (_) {
      setCouriers([]);
    }
  };

  const deleteTestOrder = async (order) => {
    if (!isSuperAdmin) return toast.warn('Only super admin can delete orders.');
    const ok = window.confirm(
      `Delete test order ${order.orderNumber}?\n\nCustomer: ${order.customer?.name || '-'}\nAmount: PKR ${amount(order)}\n\nThis removes it from order management and dashboards. If online dispatch stock was deducted, it will be restored.`
    );
    if (!ok) return;
    try {
      await api.delete(`/orders/${order._id}`);
      toast.success('Order deleted.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete order.');
    }
  };

  useEffect(() => { if (canView) load().catch(console.error); }, [canView]);
  useEffect(() => {
    if (!canView) return;
    api.get('/payment-methods/public')
      .then((res) => setPaymentMethods(res.data || []))
      .catch(() => {});
  }, [canView]);
  useEffect(() => {
    if (!canView) return;
    api.get('/sites/public').then((res) => setPublicSites(res.data || [])).catch(() => setPublicSites([]));
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
  useEffect(() => {
    if (!canView) return;
    api.get('/gift-sources', { params: { activeOnly: true } })
      .then((res) => setGiftSources(res.data || []))
      .catch(() => setGiftSources([]));
  }, [canView]);

  const grouped = useMemo(() => ({
    pending: orders.filter((o) => o.status === 'pending_confirmation'),
    courier: orders.filter((o) => o.status === 'confirmed'),
    dispatched: orders.filter((o) => o.status === 'dispatched'),
    delivered: orders.filter((o) => o.status === 'delivered'),
    returned: orders.filter((o) => o.status === 'returned'),
    cancelled: orders.filter((o) => o.status === 'cancelled' || o.status === 'rejected'),
  }), [orders]);

  const orderStatusInfo = (order) => {
    const status = String(order?.status || '').toLowerCase();
    if (status === 'pending_confirmation') return { label: 'Pending For Confirmation', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    if (status === 'confirmed') {
      const hasCourier = Boolean(order?.courier?.courierId || order?.courier?.courierName || order?.courier?.trackingNumber);
      return hasCourier
        ? { label: 'Courier Assigned', className: 'bg-indigo-100 text-indigo-800 border-indigo-300' }
        : { label: 'Confirmed', className: 'bg-blue-100 text-blue-800 border-blue-300' };
    }
    if (status === 'dispatched') return { label: 'Dispatched', className: 'bg-purple-100 text-purple-800 border-purple-300' };
    if (status === 'delivered') return { label: 'Delivered', className: 'bg-green-100 text-green-800 border-green-300' };
    if (status === 'returned') return { label: 'Returned', className: 'bg-orange-100 text-orange-800 border-orange-300' };
    if (status === 'cancelled') return { label: 'Cancelled', className: 'bg-red-100 text-red-800 border-red-300' };
    if (status === 'rejected') return { label: 'Cancelled / Rejected', className: 'bg-red-100 text-red-800 border-red-300' };
    return { label: order?.status || '-', className: 'bg-gray-100 text-gray-700 border-gray-300' };
  };

  const searchableOrderText = (order) => [
    order?.orderNumber,
    order?.customer?.name,
    order?.customer?.mobile,
    order?.customer?.phone,
    order?.customer?.email,
    order?.customer?.city,
    order?.courier?.trackingNumber,
  ].filter(Boolean).join(' ').toLowerCase();

  const globalSearchResults = useMemo(() => {
    const q = String(globalOrderSearch || '').trim().toLowerCase();
    if (!q) return [];
    return orders.filter((order) => searchableOrderText(order).includes(q));
  }, [orders, globalOrderSearch]);

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
    await api.put(`/orders/${id}/confirm`, { sendWhatsApp: whatsAppEnabled('confirm', id) });
    toast.success('Order confirmed.');
    await load();
  };

  const toggleCustomerConfirmation = async (order) => {
    const isConfirmed = order?.customerConfirmation?.status === 'confirmed';
    const nextStatus = isConfirmed ? 'none' : 'confirmed';
    const message = isConfirmed
      ? 'Mark this customer confirmation as not confirmed?'
      : 'Mark this customer as confirmed by admin/phone call?';
    if (!window.confirm(message)) return;
    await api.put(`/orders/${order._id}/customer-confirmation`, { status: nextStatus });
    toast.success(isConfirmed ? 'Customer confirmation removed.' : 'Customer marked confirmed.');
    await load();
  };

  const openNotes = (order) => {
    setNotesModal({ open: true, order, text: '', saving: false });
  };

  const saveOrderNote = async () => {
    const order = notesModal.order;
    const text = String(notesModal.text || '').trim();
    if (!order?._id) return;
    if (!text) return toast.warn('Please enter note text.');
    setNotesModal((p) => ({ ...p, saving: true }));
    try {
      const res = await api.post(`/orders/${order._id}/notes`, { text });
      const updatedOrder = res.data?.order || null;
      setNotesModal({ open: true, order: updatedOrder || order, text: '', saving: false });
      toast.success('Order note added.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add order note.');
      setNotesModal((p) => ({ ...p, saving: false }));
    }
  };

  const openGiftModal = (order) => {
    setGiftModal({
      open: true,
      order,
      giftType: 'owner',
      ownerGiftSourceId: giftSources[0]?._id || '',
      senderName: '',
      senderContact: '',
      senderAddress: '',
      giftPaymentType: 'prepaid',
      giftAmount: String(Number(order?.finalAmount || order?.totalCost || 0) || 0),
      giftNote: '',
      sendGiftWhatsApp: false,
      saving: false,
    });
  };

  const submitGiftOrder = async () => {
    const order = giftModal.order;
    if (!order?._id) return;
    if (giftModal.giftType === 'owner' && !giftModal.ownerGiftSourceId) {
      return toast.warn('Select the owner/family member gifting source.');
    }
    if (giftModal.giftType === 'customer') {
      if (!String(giftModal.senderName || '').trim()) return toast.warn('Enter sender name.');
      if (!String(giftModal.senderContact || '').trim()) return toast.warn('Enter sender contact.');
      if (!String(giftModal.senderAddress || '').trim()) return toast.warn('Enter sender address.');
    }
    const giftAmount = Math.max(0, Number(giftModal.giftAmount || 0));
    const confirmText = giftModal.giftType === 'owner'
      ? `Mark ${order.orderNumber} as owner gift?\n\nCourier/COD amount will be zero.`
      : `Mark ${order.orderNumber} as customer-sent gift?\n\nGift amount/value: PKR ${giftAmount.toFixed(2)}\nCourier/COD amount will be zero.`;
    if (!window.confirm(confirmText)) return;
    setGiftModal((p) => ({ ...p, saving: true }));
    try {
      await api.put(`/orders/${order._id}/gift`, {
        giftType: giftModal.giftType,
        ownerGiftSourceId: giftModal.ownerGiftSourceId,
        senderName: giftModal.senderName,
        senderContact: giftModal.senderContact,
        senderAddress: giftModal.senderAddress,
        giftPaymentType: giftModal.giftPaymentType,
        giftAmount,
        giftNote: giftModal.giftNote,
        sendWhatsApp: giftModal.sendGiftWhatsApp === true,
      });
      toast.success('Order marked as gift.');
      setGiftModal({
        open: false,
        order: null,
        giftType: 'owner',
        ownerGiftSourceId: '',
        senderName: '',
        senderContact: '',
        senderAddress: '',
        giftPaymentType: 'prepaid',
        giftAmount: '0',
        giftNote: '',
        sendGiftWhatsApp: false,
        saving: false,
      });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark order as gift.');
      setGiftModal((p) => ({ ...p, saving: false }));
    }
  };

  const openStockOptions = async (order) => {
    setStockOptionsModal({ open: true, order, options: [], loading: true, reservingSiteId: '', mode: 'reserve' });
    try {
      const res = await api.get(`/orders/${order._id}/stock-options`);
      setStockOptionsModal((p) => ({ ...p, options: res.data?.options || [], loading: false }));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load stock options.');
      setStockOptionsModal((p) => ({ ...p, loading: false }));
    }
  };

  const reserveStock = async (siteId) => {
    const order = stockOptionsModal.order;
    if (!order?._id) return;
    setStockOptionsModal((p) => ({ ...p, reservingSiteId: siteId }));
    try {
      await api.put(`/orders/${order._id}/reserve-stock`, { siteId });
      toast.success('Stock reserved for this order.');
      setStockOptionsModal({ open: false, order: null, options: [], loading: false, reservingSiteId: '', mode: 'reserve' });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reserve stock.');
      setStockOptionsModal((p) => ({ ...p, reservingSiteId: '' }));
    }
  };

  const createStockRequest = async (orderId, sourceSiteId) => {
    try {
      await api.post(`/orders/${orderId}/stock-request`, { sourceSiteId });
      toast.success('Stock request sent.');
      setStockOptionsModal({ open: false, order: null, options: [], loading: false, reservingSiteId: '', mode: 'reserve' });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to request stock.');
    }
  };

  const cancelStockRequest = async (orderId) => {
    if (!window.confirm('Cancel this stock request?')) return;
    try {
      await api.put(`/orders/${orderId}/stock-request/cancel`, {});
      toast.success('Stock request cancelled.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to cancel stock request.');
    }
  };

  const dispatch = async (id) => {
    const order = orders.find((o) => String(o._id) === String(id));
    const f = dispatchForm[id] || {};
    const courierId = f.courierId || order?.courier?.courierId || '';
    const trackingNumber = f.trackingNumber ?? order?.courier?.trackingNumber ?? '';
    if (!courierId) return toast.warn('Select courier.');
    const payload = {
      courierId,
      trackingNumber,
      paymentMode: order?.giftInfo?.isGift ? 'prepaid' : (f.paymentMode || order?.paymentMode || 'cod'),
      sendWhatsApp: whatsAppEnabled('dispatch', id),
    };
    if (!window.confirm('Dispatch this order?')) return;
    try {
      await api.put(`/orders/${id}/dispatch`, payload);
      toast.success('Order dispatched.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to dispatch order.');
    }
  };

  const changeFulfilmentSite = async (siteId, mode = 'request') => {
    const order = stockOptionsModal.order;
    if (!order?._id) return;
    const actionLabel = mode === 'reserve' ? 'reserve this site directly' : 'request stock from this site';
    if (!window.confirm(`Change fulfilment site for ${order.orderNumber} and ${actionLabel}? Existing reserved stock will be returned first.`)) return;
    setStockOptionsModal((p) => ({ ...p, reservingSiteId: siteId }));
    try {
      await api.put(`/orders/${order._id}/change-fulfilment-site`, { siteId, mode });
      toast.success(mode === 'reserve' ? 'Fulfilment site changed and stock reserved.' : 'Fulfilment site change requested.');
      setStockOptionsModal({ open: false, order: null, options: [], loading: false, reservingSiteId: '', mode: 'reserve' });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to change fulfilment site.');
      setStockOptionsModal((p) => ({ ...p, reservingSiteId: '' }));
    }
  };

  const openChangeFulfilment = async (order) => {
    setStockOptionsModal({ open: true, order, options: [], loading: true, reservingSiteId: '', mode: 'change' });
    try {
      const res = await api.get(`/orders/${order._id}/stock-options`);
      setStockOptionsModal((p) => ({ ...p, options: res.data?.options || [], loading: false }));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load stock options.');
      setStockOptionsModal((p) => ({ ...p, loading: false }));
    }
  };

  const assignCourier = async (id) => {
    const order = orders.find((o) => String(o._id) === String(id));
    const f = dispatchForm[id] || {};
    if (!f.courierId) return toast.warn('Select courier.');
    const payload = { ...f, paymentMode: order?.giftInfo?.isGift ? 'prepaid' : (f.paymentMode || order?.paymentMode || 'cod') };
    try {
      await api.put(`/orders/${id}/assign-courier`, payload);
      toast.success('Courier assigned.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to assign courier.');
    }
  };

  const refreshAllLeopardsStatuses = async () => {
    if (!window.confirm('Refresh status for all dispatched Leopards orders?')) return;
    setRefreshingLeopardsStatuses(true);
    try {
      const res = await api.post('/orders/leopards/refresh-statuses', {});
      const data = res.data || {};
      toast.success(`Leopards statuses refreshed. Updated ${data.updated || 0} of ${data.checked || 0}.`);
      if (Array.isArray(data.unmatched) && data.unmatched.length) {
        toast.info(`${data.unmatched.length} tracking number(s) did not return a status yet.`);
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to refresh Leopards statuses.');
    } finally {
      setRefreshingLeopardsStatuses(false);
    }
  };

  const repairOnlineDispatchStock = async () => {
    if (!window.confirm('Repair online stock deduction for already dispatched or delivered online orders? This will deduct only orders not already marked as deducted.')) return;
    setRepairingOnlineDispatchStock(true);
    try {
      const res = await api.post('/orders/online-dispatch-stock/repair', {});
      const data = res.data || {};
      toast.success(`Online dispatch stock repaired for ${data.repaired || 0} order(s).`);
      if (Array.isArray(data.failed) && data.failed.length) {
        toast.warn(`${data.failed.length} order(s) could not be repaired due to insufficient stock.`);
      }
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to repair online dispatch stock.');
    } finally {
      setRepairingOnlineDispatchStock(false);
    }
  };

  const printCourierLabels = (order) => {
    const w = window.open('', '_blank');
    if (!w) return toast.warn('Popup blocked. Please allow popups to print.');
    const orderDate = new Date(order?.createdAt || Date.now()).toLocaleString();
    const city = order?.customer?.city || '-';
    const customerName = order?.customer?.name || '-';
    const customerMobile = order?.customer?.mobile || '-';
    const address = order?.customer?.address || '-';
    const courierName = order?.courier?.courierName || '-';
    const tracking = order?.courier?.trackingNumber || '-';
    const courierHelp = order?.courier?.courierHelpline || '-';
    const processedBy = user?.name || user?.username || '-';
    const slips = [];
    const orderItemsSummary = (order?.items || [])
      .map((it) => `${it?.name || 'Product'} x ${Number(it?.quantity || 0)}`)
      .join(', ');
    (order?.items || []).forEach((it) => {
      const qty = Number(it.quantity || 0);
      for (let i = 1; i <= qty; i += 1) {
        slips.push({});
      }
    });
    const totalPieces = slips.length;
    const html = `
      <html><head><title>Courier Slips - ${order?.orderNumber || ''}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:8px}
        .slip{width:72mm;margin:0 auto 8mm auto;padding:6px;border:1px dashed #444;box-sizing:border-box;page-break-inside:avoid}
        .row{margin:2px 0;font-size:11px;line-height:1.25}
        .bold{font-weight:700}
        .city{font-weight:800;font-size:14px}
      </style></head><body>
      ${slips.map((s, index) => `
        <div class="slip">
          <div class="row bold">Order: ${order?.orderNumber || '-'}</div>
          <div class="row">Tracking: ${tracking}</div>
          <div class="row">Date: ${orderDate}</div>
          <div class="row">Customer: ${customerName}</div>
          <div class="row">Mobile: ${customerMobile}</div>
          <div class="row">Address: ${address}</div>
          <div class="row city">City: ${city}</div>
          <div class="row">Courier: ${courierName}</div>
          <div class="row">Courier Contact: ${courierHelp}</div>
          <div class="row">Processed By: ${processedBy}</div>
          <div class="row bold">Order Items: ${orderItemsSummary || '-'}</div>
          <div class="row bold">Piece ${index + 1} out of ${totalPieces}</div>
        </div>
      `).join('')}
      <script>window.onload=()=>window.print();</script>
      </body></html>
    `;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const markDelivered = async (id) => {
    if (!window.confirm('Mark as delivered?')) return;
    await api.put(`/orders/${id}/deliver`, { sendWhatsApp: whatsAppEnabled('deliver', id) });
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
      fulfilmentSiteId: '',
      fulfilmentOptions: [],
      loadingSites: false,
      sendModificationEmail: true,
    });
    setFulfilmentProducts([]);
    setNewItem({ productId: '', quantity: 1 });
  };

  const refreshFulfilmentSites = async (items) => {
    setModifyModal((p) => ({ ...p, loadingSites: true }));
    try {
      const res = await api.post('/orders/preview-fulfilment-sites', { items });
      const options = (res.data?.options || []).filter((o) => o.canFulfill);
      setModifyModal((p) => ({
        ...p,
        fulfilmentOptions: options,
        fulfilmentSiteId: options.some((x) => String(x.siteId) === String(p.fulfilmentSiteId)) ? p.fulfilmentSiteId : '',
        loadingSites: false,
      }));
    } catch (err) {
      setModifyModal((p) => ({ ...p, fulfilmentOptions: [], fulfilmentSiteId: '', loadingSites: false }));
      toast.error(err?.response?.data?.message || 'Failed to load fulfilment sites.');
    }
  };

  const loadFulfilmentProducts = async (siteId) => {
    if (!siteId) {
      setFulfilmentProducts([]);
      return;
    }
    setLoadingFulfilmentProducts(true);
    try {
      const res = await api.get('/orders/fulfilment-site-products', { params: { siteId } });
      setFulfilmentProducts(res.data || []);
    } catch (err) {
      setFulfilmentProducts([]);
      toast.error(err?.response?.data?.message || 'Failed to load site products.');
    } finally {
      setLoadingFulfilmentProducts(false);
    }
  };

  const saveModify = async () => {
    const { order, items, discountAmount, paymentMethodId, fulfilmentSiteId, sendModificationEmail } = modifyModal;
    if (!order) return;
    if (!window.confirm(`Save modified order${sendModificationEmail ? ' and send email?' : ' without customer email?'}`)) return;
    try {
      const modifyRes = await api.put(`/orders/${order._id}/modify`, {
        items,
        discountAmount: Number(discountAmount || 0),
        paymentMethodId: paymentMethodId || undefined,
        fulfilmentSiteId: fulfilmentSiteId || undefined,
        sendModificationEmail,
      });
      if (fulfilmentSiteId) {
        await api.post(`/orders/${order._id}/stock-request`, { sourceSiteId: fulfilmentSiteId });
      }
      toast.success('Order modified.');
      setModifyModal({ open: false, order: null, discountAmount: '0', paymentMethodId: '', items: [], fulfilmentSiteId: '', fulfilmentOptions: [], loadingSites: false, sendModificationEmail: true });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to modify order.');
    }
  };

  const addProductToModifyOrder = () => {
    const product = fulfilmentProducts.find((p) => String(p._id) === String(newItem.productId));
    const qtyToAdd = Number(newItem.quantity || 0);
    if (!modifyModal.fulfilmentSiteId) return toast.warn('Select fulfilment site first.');
    if (!product) return toast.warn('Select a product.');
    if (qtyToAdd < 1) return toast.warn('Quantity must be at least 1.');
    if (qtyToAdd > Number(product.availableQty || 0)) {
      return toast.warn(`Insufficient stock. Available: ${Number(product.availableQty || 0)}`);
    }

    const existing = modifyModal.items.find((it) => String(it.productId) === String(product._id));
    if (existing) {
      const updatedQty = Number(existing.quantity || 0) + qtyToAdd;
      if (updatedQty > Number(product.availableQty || 0)) {
        return toast.warn(`Cannot exceed stock for ${product.name}. Available: ${Number(product.availableQty || 0)}`);
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

  useEffect(() => {
    if (!modifyModal.open) return;
    if (!Array.isArray(modifyModal.items) || modifyModal.items.length === 0) return;
    refreshFulfilmentSites(modifyModal.items);
  }, [modifyModal.open, JSON.stringify(modifyModal.items)]);

  useEffect(() => {
    if (!modifyModal.open) return;
    loadFulfilmentProducts(modifyModal.fulfilmentSiteId);
  }, [modifyModal.open, modifyModal.fulfilmentSiteId]);

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

  const uncancelWhatsAppOrder = async (order) => {
    if (!order?._id) return;
    const ok = window.confirm(`Uncancel order ${order.orderNumber}?\n\nThis will restore it to Pending For Confirmation and mark the customer as confirmed for processing review.`);
    if (!ok) return;
    try {
      await api.put(`/orders/${order._id}/uncancel-whatsapp`, {});
      toast.success('Order restored from WhatsApp cancellation.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to uncancel order.');
    }
  };

  const submitReturn = async () => {
    await api.put(`/orders/${returnModal.orderId}/return`, { reason: returnModal.reason || 'Customer return request' });
    toast.success('Order marked returned.');
    setReturnModal({ open: false, orderId: '', reason: 'Customer return request' });
    await load();
  };

  const sendFeedbackReminder = async (id) => {
    if (!window.confirm('Send feedback reminder to customer?')) return;
    try {
      await api.put(`/orders/${id}/feedback-reminder`, { sendWhatsApp: whatsAppEnabled('feedback', id) });
      toast.success('Feedback reminder sent.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reminder.');
    }
  };

  const markReturnWasted = async (orderId) => {
    const reason = window.prompt('Reason for marking wasted:', 'Damaged return') || 'Damaged return';
    await api.put(`/orders/${orderId}/returned/mark-wasted`, { reason });
    toast.success('Returned order marked wasted.');
    await load();
  };

  const returnToStore = async (orderId) => {
    const siteNames = publicSites.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const pick = window.prompt(`Select site number to return stock:\n${siteNames}`);
    const idx = Number(pick || 0) - 1;
    const site = publicSites[idx];
    if (!site) return toast.warn('Invalid site selection.');
    await api.put(`/orders/${orderId}/returned/return-to-store`, { siteId: site._id });
    toast.success(`Stock returned to ${site.name}.`);
    await load();
  };

  const openRedirectModal = (order) => {
    setRedirectModal({
      open: true,
      order,
      customer: {
        name: '',
        email: '',
        mobile: '',
        address: '',
        city: '',
      },
      courierId: '',
      trackingNumber: '',
      paymentMode: 'prepaid',
      paymentMethodName: order?.paymentDetails?.methodName || '',
      remarks: '',
    });
  };

  const submitRedirectReturnedOrder = async () => {
    const { order, customer, courierId, trackingNumber, paymentMode, paymentMethodName, remarks } = redirectModal;
    if (!order?._id) return;
    if (!customer?.name?.trim()) return toast.warn('Customer name is required.');
    if (!customer?.mobile?.trim()) return toast.warn('Customer mobile is required.');
    if (!customer?.address?.trim()) return toast.warn('Customer address is required.');
    if (!customer?.city?.trim()) return toast.warn('Customer city is required.');
    if (!courierId) return toast.warn('Courier is required.');
    await api.post(`/orders/${order._id}/returned/redirect`, {
      customer,
      courierId,
      trackingNumber,
      paymentMode,
      paymentMethodName,
      remarks,
    });
    toast.success('Returned order redirected and dispatched.');
    setRedirectModal({
      open: false,
      order: null,
      customer: { name: '', email: '', mobile: '', address: '', city: '' },
      courierId: '',
      trackingNumber: '',
      paymentMode: 'prepaid',
      paymentMethodName: '',
      remarks: '',
    });
    await load();
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
        <div className="flex flex-wrap gap-2">
          {tableKey === 'dispatched' ? (
            <>
              <button
                onClick={refreshAllLeopardsStatuses}
                disabled={refreshingLeopardsStatuses}
                className="bg-amber-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
              >
                {refreshingLeopardsStatuses ? 'Refreshing Leopards...' : 'Refresh All Leopards Statuses'}
              </button>
              <button
                onClick={repairOnlineDispatchStock}
                disabled={repairingOnlineDispatchStock}
                className="bg-rose-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
              >
                {repairingOnlineDispatchStock ? 'Repairing Stock...' : 'Repair Online Dispatch Stock'}
              </button>
            </>
          ) : null}
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
            name: 'Gift',
            selector: (o) => o?.giftInfo?.isGift ? (o.giftInfo.giftType === 'owner' ? 'Owner Gift' : 'Customer Gift') : '-',
            sortable: true,
            wrap: true,
            cell: (o) => (
              <div className="flex flex-col gap-1">
                {o?.giftInfo?.isGift ? <GiftBadge order={o} /> : <span>-</span>}
                <NotesBadge order={o} />
              </div>
            ),
          },
          {
            name: 'Items',
            selector: (o) => orderItemsText(o),
            sortable: false,
            wrap: true,
            grow: 1.4,
            cell: (o) => <span>{orderItemsText(o) || '-'}</span>,
          },
          { name: 'City', selector: (o) => o.customer?.city || '-', sortable: true, wrap: true },
          { name: 'Fulfilment Source', selector: (o) => fulfillmentSourceLabel(o), sortable: true, wrap: true, grow: 1.1 },
          ...((tableKey === 'dispatched' || tableKey === 'returned') ? [{
            name: 'Courier / Tracking',
            selector: (o) => `${o?.courier?.courierName || '-'} ${o?.courier?.trackingNumber || '-'}`.trim(),
            sortable: true,
            wrap: true,
            grow: 1.2,
            cell: (o) => (
              <div>
                <div>{o?.courier?.courierName || '-'}</div>
                <div className="text-xs text-gray-600">{o?.courier?.trackingNumber || '-'}</div>
              </div>
            ),
          }] : []),
          ...((tableKey === 'courier' || tableKey === 'dispatched' || tableKey === 'delivered' || tableKey === 'returned') ? [{
            name: 'Courier Status',
            selector: (o) => o?.courier?.latestStatus || '-',
            sortable: true,
            wrap: true,
            grow: 1,
            cell: (o) => <CourierStatusBadge order={o} />,
          }] : []),
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
            name: 'Customer Confirmation',
            selector: (o) => customerConfirmationInfo(o).label,
            sortable: true,
            wrap: true,
            grow: 1.1,
            cell: (o) => <CustomerConfirmationBadge order={o} />,
          },
          {
            name: 'Actions',
            cell: (o) => actions(o),
            ignoreRowClick: true,
            allowOverflow: true,
            button: true,
            grow: 0,
            width: tableKey === 'courier' ? '340px' : '240px',
            minWidth: tableKey === 'courier' ? '340px' : '240px',
            maxWidth: tableKey === 'courier' ? '340px' : '240px',
          },
        ]}
        data={filteredRows}
        conditionalRowStyles={giftRowStyles}
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

      <div className="bg-white rounded shadow mb-5">
        <div className="px-4 py-3 border-b">
          <div className="font-semibold">Search All Orders</div>
          <div className="text-xs text-gray-600 mt-1">Search by order number, customer name, phone number, email, city, or tracking number.</div>
        </div>
        <div className="px-4 py-3 border-b">
          <input
            type="text"
            value={globalOrderSearch}
            onChange={(e) => setGlobalOrderSearch(e.target.value)}
            placeholder="Search all orders..."
            className="border rounded px-3 py-2 text-sm w-full md:max-w-xl"
          />
        </div>
        {String(globalOrderSearch || '').trim() ? (
          <div className="overflow-x-auto">
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
                  selector: (o) => `${o.customer?.name || '-'} ${o.customer?.mobile || ''}`.trim(),
                  sortable: true,
                  wrap: true,
                  grow: 1.2,
                  cell: (o) => (
                    <div>
                      <div>{o.customer?.name || '-'}</div>
                      <div className="text-xs text-gray-600">{o.customer?.mobile || '-'}</div>
                      <div className="text-xs text-gray-600">{o.customer?.email || '-'}</div>
                    </div>
                  ),
                },
                {
                  name: 'Gift',
                  selector: (o) => o?.giftInfo?.isGift ? (o.giftInfo.giftType === 'owner' ? 'Owner Gift' : 'Customer Gift') : '-',
                  sortable: true,
                  wrap: true,
                  cell: (o) => (
                    <div className="flex flex-col gap-1">
                      {o?.giftInfo?.isGift ? <GiftBadge order={o} /> : <span>-</span>}
                      <NotesBadge order={o} />
                    </div>
                  ),
                },
                { name: 'Items', selector: (o) => orderItemsText(o), sortable: false, wrap: true, grow: 1.5 },
                { name: 'City', selector: (o) => o.customer?.city || '-', sortable: true, wrap: true },
                { name: 'Fulfilment Source', selector: (o) => fulfillmentSourceLabel(o), sortable: true, wrap: true },
                {
                  name: 'Current Status',
                  selector: (o) => orderStatusInfo(o).label,
                  sortable: true,
                  wrap: true,
                  cell: (o) => {
                    const info = orderStatusInfo(o);
                    return <span className={`inline-flex items-center rounded border px-2 py-1 text-xs font-semibold ${info.className}`}>{info.label}</span>;
                  },
                },
                {
                  name: 'Courier / Tracking',
                  selector: (o) => `${o?.courier?.courierName || '-'} ${o?.courier?.trackingNumber || '-'}`.trim(),
                  sortable: true,
                  wrap: true,
                  cell: (o) => (
                    <div>
                      <div>{o?.courier?.courierName || '-'}</div>
                      <div className="text-xs text-gray-600">{o?.courier?.trackingNumber || '-'}</div>
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
                {
                  name: 'Actions',
                  cell: (o) => (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
                      <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline">Notes</button>
                    </div>
                  ),
                  ignoreRowClick: true,
                  button: true,
                },
              ]}
              data={globalSearchResults}
              conditionalRowStyles={giftRowStyles}
              pagination
              highlightOnHover
              striped
              dense
              noDataComponent="No matching orders"
            />
          </div>
        ) : null}
      </div>

      {renderTable('pending', 'Pending For Confirmation', grouped.pending, (o) => (
        <div className="flex flex-wrap gap-2 items-start">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline">Notes</button>
          <button onClick={() => openGiftModal(o)} className="text-pink-700 hover:underline">Mark as Gift</button>
          <button onClick={() => openStockOptions(o)} className="text-blue-700 hover:underline">View Stock Options</button>
          {!isCodOrder(o) && !o?.paymentDetails?.isVerified ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Verify Payment</button> : null}
          <CustomerConfirmationBadge order={o} />
          <button onClick={() => toggleCustomerConfirmation(o)} className="text-teal-700 hover:underline">
            {o?.customerConfirmation?.status === 'confirmed' ? 'Unmark Customer Confirmed' : 'Mark Customer Confirmed'}
          </button>
          {o?.stockReservation?.isReserved ? (
            <span className="inline-flex items-center gap-2">
              <button onClick={() => confirmOrder(o._id)} className="text-green-700 hover:underline">Confirm</button>
              <WhatsAppCheckbox action="confirm" orderId={o._id} />
            </span>
          ) : (
            <span className="text-amber-700">Reserve stock first</span>
          )}
          {o?.stockRequest?.status === 'pending' ? (
            <>
              <span className="text-amber-700">
                Stock transfer awaited{ o?.stockRequest?.sourceSiteName ? ` from ${o.stockRequest.sourceSiteName}` : '' }
              </span>
              <button onClick={() => cancelStockRequest(o._id)} className="text-red-700 hover:underline">Cancel Stock Request</button>
            </>
          ) : null}
          {o?.stockRequest?.status === 'rejected' ? (
            <span className="text-red-700">
              Stock request rejected{ o?.stockRequest?.sourceSiteName ? ` by ${o.stockRequest.sourceSiteName}` : '' }
            </span>
          ) : null}
          <button onClick={() => setRejectModal({ open: true, orderId: o._id, reason: 'Order cancelled due to stock unavailability' })} className="text-red-600 hover:underline">Cancel Order</button>
          <button onClick={() => openModify(o)} className="text-blue-600 hover:underline">Modify</button>
        </div>
      ))}

      {renderTable('courier', 'Enter Courier Details', grouped.courier, (o) => (
        <div className="space-y-2 w-full">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
            <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline">Notes</button>
            <button onClick={() => openChangeFulfilment(o)} className="text-orange-700 hover:underline">Change Fulfilment Site</button>
            <span className="inline-flex items-center gap-2">
              <button onClick={() => dispatch(o._id)} className="text-blue-700 hover:underline">Order Dispatched</button>
              <WhatsAppCheckbox action="dispatch" orderId={o._id} />
            </span>
            <button onClick={() => setCancelModal({ open: true, orderId: o._id, reason: '' })} className="text-red-600 hover:underline">Cancel Order</button>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <select
              className="border px-2 py-1.5 rounded text-xs w-full"
              value={dispatchForm[o._id]?.courierId ?? o?.courier?.courierId ?? ''}
              onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), courierId: e.target.value } }))}
            >
              <option value="">Courier</option>
              {couriers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input className="border px-2 py-1.5 rounded text-xs w-full" placeholder="Tracking #" defaultValue={o?.courier?.trackingNumber || ''} onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), trackingNumber: e.target.value } }))} />
            <select
              className="border px-2 py-1.5 rounded text-xs w-full"
              value={o?.giftInfo?.isGift ? 'prepaid' : (dispatchForm[o._id]?.paymentMode ?? o.paymentMode ?? 'cod')}
              disabled={o?.giftInfo?.isGift}
              onChange={(e) => setDispatchForm((p) => ({ ...p, [o._id]: { ...(p[o._id] || {}), paymentMode: e.target.value } }))}
            >
              <option value="cod">Cash On Delivery</option><option value="prepaid">Prepaid</option><option value="free">Free</option>
            </select>
            {o?.giftInfo?.isGift ? <div className="text-[11px] text-orange-700">Gift order: courier/COD amount remains zero.</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => assignCourier(o._id)} className="text-indigo-700 hover:underline">Assign Courier</button>
            <button onClick={() => printCourierLabels(o)} className="text-purple-700 hover:underline">Print Courier Slip</button>
            {!isCodOrder(o) && !o?.paymentDetails?.isVerified && o?.paymentDetails?.receiptUrl ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Mark Payment Verified</button> : null}
          </div>
        </div>
      ))}

      {renderTable('dispatched', 'Dispatched Orders', grouped.dispatched, (o) => (
        <div className="flex gap-2">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline">Notes</button>
          {!isCodOrder(o) && !o?.paymentDetails?.isVerified && o?.paymentDetails?.receiptUrl ? <button onClick={() => verifyPayment(o._id)} className="text-emerald-700 hover:underline">Mark Payment Verified</button> : null}
          <span className="inline-flex items-center gap-2">
            <button onClick={() => markDelivered(o._id)} className="text-green-700 hover:underline">Mark Delivered</button>
            <WhatsAppCheckbox action="deliver" orderId={o._id} />
          </span>
          <button onClick={() => setReturnModal({ open: true, orderId: o._id, reason: 'Customer return request' })} className="text-red-600 hover:underline">Mark Returned</button>
        </div>
      ))}

      {renderTable('delivered', 'Delivered Orders', grouped.delivered, (o) => (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline">View Order</button>
          <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline">Notes</button>
          {o.feedback?.rating ? (
            <button onClick={() => setFeedbackModal({ open: true, order: o })} className="text-green-700 hover:underline">View Feedback</button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <button onClick={() => sendFeedbackReminder(o._id)} className="text-blue-700 hover:underline">Send Feedback Reminder</button>
              <WhatsAppCheckbox action="feedback" orderId={o._id} />
            </span>
          )}
          {isSuperAdmin ? (
            <button onClick={() => deleteTestOrder(o)} className="text-red-700 hover:underline">Delete Test Order</button>
          ) : null}
        </div>
      ))}
      {renderTable('returned', 'Returned Orders', grouped.returned, (o) => (
        (() => {
          const isResolved = String(o?.adminRemarks || '').includes('[Return Resolution:');
          return (
            <div className="flex flex-col gap-1">
              <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline text-left">View Order</button>
              <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline text-left">Notes</button>
              {!isResolved ? (
                <>
                  <button onClick={() => markReturnWasted(o._id)} className="text-red-700 hover:underline text-left">Mark Wasted</button>
                  <button onClick={() => returnToStore(o._id)} className="text-blue-700 hover:underline text-left">Return To Store</button>
                  <button onClick={() => openRedirectModal(o)} className="text-green-700 hover:underline text-left">Redirect Order</button>
                </>
              ) : null}
              <span>{o.adminRemarks || '-'}</span>
            </div>
          );
        })()
      ))}
      {renderTable('cancelled', 'Cancelled Orders', grouped.cancelled, (o) => (
        <div className="flex flex-col gap-1">
          <button onClick={() => setViewOrderModal({ open: true, order: o })} className="text-gray-700 hover:underline text-left">View Order</button>
          <button onClick={() => openNotes(o)} className="text-sky-700 hover:underline text-left">Notes</button>
          {o?.customerConfirmation?.status === 'cancelled' && o?.customerConfirmation?.responseSource === 'whatsapp' ? (
            <button onClick={() => uncancelWhatsAppOrder(o)} className="text-green-700 hover:underline text-left">Uncancel WhatsApp Order</button>
          ) : null}
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

      {notesModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-3">Order Notes: {notesModal.order?.orderNumber || '-'}</h3>
            <div className="space-y-2 mb-4">
              {Array.isArray(notesModal.order?.notes) && notesModal.order.notes.length ? (
                [...notesModal.order.notes]
                  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                  .map((note, idx) => (
                    <div key={note._id || idx} className="border rounded p-3 bg-gray-50">
                      <div className="text-sm whitespace-pre-wrap">{note.text || '-'}</div>
                      <div className="text-xs text-gray-600 mt-2">
                        {note.createdByName || 'User'} | {formatDateTime(note.createdAt)}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-sm text-gray-600 border rounded p-3 bg-gray-50">No notes added yet.</div>
              )}
            </div>
            <textarea
              value={notesModal.text}
              onChange={(e) => setNotesModal((p) => ({ ...p, text: e.target.value }))}
              className="w-full border p-2 rounded"
              rows={4}
              placeholder="Add a note for this order..."
            />
            <div className="flex justify-end gap-2 mt-3">
              <button className="border px-3 py-2 rounded" onClick={() => setNotesModal({ open: false, order: null, text: '', saving: false })}>Close</button>
              <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={notesModal.saving} onClick={saveOrderNote}>
                {notesModal.saving ? 'Saving...' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {giftModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-3">Mark Order as Gift: {giftModal.order?.orderNumber || '-'}</h3>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="border rounded p-3 cursor-pointer">
                  <div className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="giftType"
                      checked={giftModal.giftType === 'owner'}
                      onChange={() => setGiftModal((p) => ({ ...p, giftType: 'owner', giftPaymentType: 'prepaid', giftAmount: String(Number(p.order?.finalAmount || p.order?.totalCost || 0) || 0) }))}
                    />
                    Gift from Owners
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Select owner/family source. Order amount and courier COD will be zero.</div>
                </label>
                <label className="border rounded p-3 cursor-pointer">
                  <div className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="giftType"
                      checked={giftModal.giftType === 'customer'}
                      onChange={() => setGiftModal((p) => ({ ...p, giftType: 'customer', giftAmount: String(Number(p.order?.finalAmount || p.order?.totalCost || 0) || 0) }))}
                    />
                    Sent from Customer
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Enter sender details. Customer-sent gifts are booked as prepaid with zero courier COD.</div>
                </label>
              </div>

              {giftModal.giftType === 'owner' ? (
                <div>
                  <label className="block font-medium mb-1">Owner / Family Member *</label>
                  <select
                    className="border p-2 rounded w-full"
                    value={giftModal.ownerGiftSourceId}
                    onChange={(e) => setGiftModal((p) => ({ ...p, ownerGiftSourceId: e.target.value }))}
                  >
                    <option value="">Select gift source</option>
                    {giftSources.map((source) => (
                      <option key={source._id} value={source._id}>{source.name}</option>
                    ))}
                  </select>
                  {!giftSources.length ? (
                    <div className="text-xs text-amber-700 mt-1">No active owner/family gift sources found. Add them in Gift Source Management first.</div>
                  ) : null}
                  <label className="block mt-3">
                    <span className="block font-medium mb-1">Gift value including delivery</span>
                    <input
                      type="number"
                      min={0}
                      className="border p-2 rounded w-full"
                      value={giftModal.giftAmount}
                      onChange={(e) => setGiftModal((p) => ({ ...p, giftAmount: e.target.value }))}
                    />
                    <span className="text-xs text-gray-600">Recorded for gift value only. Customer/courier COD amount remains zero.</span>
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    className="border p-2 rounded"
                    placeholder="Sender name *"
                    value={giftModal.senderName}
                    onChange={(e) => setGiftModal((p) => ({ ...p, senderName: e.target.value }))}
                  />
                  <input
                    className="border p-2 rounded"
                    placeholder="Sender contact *"
                    value={giftModal.senderContact}
                    onChange={(e) => setGiftModal((p) => ({ ...p, senderContact: e.target.value }))}
                  />
                  <input
                    className="border p-2 rounded md:col-span-2"
                    placeholder="Sender address *"
                    value={giftModal.senderAddress}
                    onChange={(e) => setGiftModal((p) => ({ ...p, senderAddress: e.target.value }))}
                  />
                  <div className="rounded border bg-emerald-50 p-3 text-emerald-900">
                    Gift payment is prepaid. Courier/COD amount remains zero for the receiver.
                  </div>
                  <label className="block">
                    <span className="block font-medium mb-1">Gift amount including delivery *</span>
                    <input
                      type="number"
                      min={0}
                      className="border p-2 rounded w-full"
                      value={giftModal.giftAmount}
                      onChange={(e) => setGiftModal((p) => ({ ...p, giftAmount: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Gift Note</label>
                <textarea
                  className="border p-2 rounded w-full"
                  rows={3}
                  placeholder="Optional message or note from sender..."
                  value={giftModal.giftNote}
                  onChange={(e) => setGiftModal((p) => ({ ...p, giftNote: e.target.value }))}
                />
              </div>

              <div className="rounded border bg-blue-50 p-3 text-blue-900">
                This order will be treated as prepaid for courier processing, so our team books it with zero COD amount.
              </div>
              <label className="flex items-start gap-2 rounded border bg-amber-50 p-3 text-amber-900">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={giftModal.sendGiftWhatsApp}
                  onChange={(e) => setGiftModal((p) => ({ ...p, sendGiftWhatsApp: e.target.checked }))}
                />
                <span>
                  <span className="font-semibold block">Send optional gift WhatsApp message to receiver</span>
                  <span className="text-xs">Disabled by default. Gift orders do not send the normal order confirmation message.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="border px-3 py-2 rounded"
                onClick={() => setGiftModal({ open: false, order: null, giftType: 'owner', ownerGiftSourceId: '', senderName: '', senderContact: '', senderAddress: '', giftPaymentType: 'prepaid', giftAmount: '0', giftNote: '', sendGiftWhatsApp: false, saving: false })}
              >
                Cancel
              </button>
              <button
                className="bg-pink-600 text-white px-3 py-2 rounded disabled:opacity-60"
                disabled={giftModal.saving}
                onClick={submitGiftOrder}
              >
                {giftModal.saving ? 'Saving...' : 'Mark as Gift'}
              </button>
            </div>
          </div>
        </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                <label className="flex items-center gap-2">
                  Fulfilment Site Optional
                  <select
                    className="border p-2 rounded w-full"
                    value={modifyModal.fulfilmentSiteId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModifyModal((p) => ({ ...p, fulfilmentSiteId: val }));
                      setNewItem({ productId: '', quantity: 1 });
                    }}
                  >
                    <option value="">{modifyModal.loadingSites ? 'Checking stock...' : 'No stock request now'}</option>
                    {(modifyModal.fulfilmentOptions || []).map((s) => (
                      <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">Discount Amount<input type="number" min={0} value={modifyModal.discountAmount} onChange={(e) => setModifyModal((p) => ({ ...p, discountAmount: e.target.value }))} className="border p-2 rounded w-full" /></label>
                <label className="flex items-center gap-2 md:col-span-2 text-sm">
                  <input
                    type="checkbox"
                    checked={modifyModal.sendModificationEmail !== false}
                    onChange={(e) => setModifyModal((p) => ({ ...p, sendModificationEmail: e.target.checked }))}
                  />
                  Send modification email to customer
                </label>
                <label className="flex items-center gap-2 md:col-span-2">
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
              <div className="border rounded p-3 mt-2">
                <div className="font-medium mb-2">Add Product</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                  <select
                    className="border p-2 rounded md:col-span-2"
                    value={newItem.productId}
                    onChange={(e) => setNewItem((p) => ({ ...p, productId: e.target.value }))}
                    disabled={!modifyModal.fulfilmentSiteId || loadingFulfilmentProducts}
                  >
                    <option value="">
                      {!modifyModal.fulfilmentSiteId
                        ? 'Select fulfilment site first'
                        : loadingFulfilmentProducts
                          ? 'Loading products...'
                          : 'Select product'}
                    </option>
                    {fulfilmentProducts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} (Available: {Number(p.availableQty || 0)})
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
              <button className="border px-3 py-2 rounded" onClick={() => setModifyModal({ open: false, order: null, discountAmount: '0', paymentMethodId: '', items: [], fulfilmentSiteId: '', fulfilmentOptions: [], loadingSites: false, sendModificationEmail: true })}>Cancel</button>
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
              <div><strong>Address:</strong> {viewOrderModal.order.customer?.address || '-'}</div>
              <div><strong>City:</strong> {viewOrderModal.order.customer?.city || '-'}</div>
              <div><strong>Status:</strong> {viewOrderModal.order.status}</div>
              <div className="mt-2">
                <strong>Customer Confirmation:</strong>{' '}
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${customerConfirmationInfo(viewOrderModal.order).className}`}>
                  {customerConfirmationInfo(viewOrderModal.order).label}
                </span>
              </div>
              <div><strong>Customer Response At:</strong> {formatDateTime(viewOrderModal.order?.customerConfirmation?.respondedAt)}</div>
              <div><strong>Customer Response:</strong> {viewOrderModal.order?.customerConfirmation?.responseText || '-'}</div>
              {viewOrderModal.order?.giftInfo?.isGift ? (
                <div className="mt-2 border rounded p-3 bg-orange-50 text-orange-950">
                  <div className="font-semibold mb-1">Gift Details</div>
                  <div><strong>Gift Type:</strong> {viewOrderModal.order.giftInfo.giftType === 'owner' ? 'Gift from Owners' : 'Gift Sent from Customer'}</div>
                  {viewOrderModal.order.giftInfo.giftType === 'owner' ? (
                    <div><strong>Gift Source:</strong> {viewOrderModal.order.giftInfo.ownerGiftSourceName || '-'}</div>
                  ) : (
                    <>
                      <div><strong>Sender:</strong> {viewOrderModal.order.giftInfo.senderName || '-'}</div>
                      <div><strong>Sender Contact:</strong> {viewOrderModal.order.giftInfo.senderContact || '-'}</div>
                      <div><strong>Sender Address:</strong> {viewOrderModal.order.giftInfo.senderAddress || '-'}</div>
                    </>
                  )}
                  <div><strong>Gift Payment:</strong> {viewOrderModal.order.giftInfo.giftPaymentType === 'pay_later' ? 'Pay Later' : 'Prepaid'}</div>
                  <div><strong>Gift Amount / Value:</strong> PKR {Number(viewOrderModal.order.giftInfo.giftAmount || 0).toFixed(2)}</div>
                  <div><strong>Gift Note:</strong> {viewOrderModal.order.giftInfo.giftNote || '-'}</div>
                  <div><strong>Marked By:</strong> {viewOrderModal.order.giftInfo.markedByName || '-'}</div>
                  <div><strong>Marked At:</strong> {formatDateTime(viewOrderModal.order.giftInfo.markedAt)}</div>
                </div>
              ) : null}
              <div><strong>Payment Mode:</strong> {viewOrderModal.order.paymentMode}</div>
              <div><strong>Payment Method:</strong> {viewOrderModal.order.paymentDetails?.methodName || '-'}</div>
              <div><strong>Courier Company:</strong> {viewOrderModal.order.courier?.courierName || '-'}</div>
              <div><strong>Tracking Number:</strong> {viewOrderModal.order.courier?.trackingNumber || '-'}</div>
              <div><strong>Courier Status:</strong> {viewOrderModal.order.courier?.latestStatus || '-'}</div>
              <div><strong>Courier Status Updated:</strong> {formatDateTime(viewOrderModal.order.courier?.latestStatusAt)}</div>
              <div><strong>Courier Remarks:</strong> {viewOrderModal.order.courier?.latestStatusRemarks || '-'}</div>
              {viewOrderModal.order.paymentDetails?.receiptUrl ? (
                <div>
                  <strong>Receipt:</strong>{' '}
                  <a className="text-blue-700 hover:underline" href={toPublicAssetUrl(viewOrderModal.order.paymentDetails.receiptUrl)} target="_blank" rel="noreferrer">
                    View receipt
                  </a>
                </div>
              ) : null}
              <div><strong>Payment Verified:</strong> {viewOrderModal.order.paymentDetails?.isVerified ? 'Yes' : 'No'}</div>
              <div><strong>Remarks:</strong> {viewOrderModal.order.adminRemarks || '-'}</div>
            </div>

            <div className="mb-3 text-sm border rounded p-3 bg-gray-50">
              <div className="font-semibold mb-2">Order Timeline</div>
              <div><strong>Order Placed:</strong> {formatDateTime(viewOrderModal.order?.statusTimeline?.placedAt || viewOrderModal.order?.createdAt)}</div>
              <div><strong>Order Confirmed:</strong> {formatDateTime(getConfirmedAtForView(viewOrderModal.order))}</div>
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

      {stockOptionsModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow w-full max-w-3xl p-4 max-h-[90vh] overflow-auto">
            <h3 className="text-xl font-semibold mb-3">
              {stockOptionsModal.mode === 'change' ? 'Change Fulfilment Site' : 'Stock Options'}: {stockOptionsModal.order?.orderNumber || '-'}
            </h3>
            {stockOptionsModal.loading ? (
              <div className="text-sm text-gray-600">Loading...</div>
            ) : (
              <div className="space-y-3">
                {stockOptionsModal.order?.stockRequest?.status === 'pending' ? (
                  <div className="border rounded p-3 bg-amber-50 text-amber-800 text-sm">
                    Stock request is already pending
                    {stockOptionsModal.order?.stockRequest?.sourceSiteName ? ` from ${stockOptionsModal.order.stockRequest.sourceSiteName}` : ''}.
                    Cancel the current request first if you want to request another site.
                  </div>
                ) : null}
                {stockOptionsModal.options.map((opt) => (
                  <div key={opt.siteId} className="border rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{opt.siteName}</div>
                      <div className={opt.canFulfill ? 'text-green-700' : 'text-red-700'}>
                        {opt.canFulfill ? 'Can Fulfill' : 'Insufficient'}
                      </div>
                    </div>
                    <div className="mt-2 text-sm">
                      {opt.items.map((it, idx) => (
                        <div key={idx}>
                          {it.productName}: required {it.requiredQty}, available {it.availableQty}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <div className="flex gap-4">
                        {isSuperAdmin ? (
                          <button
                            disabled={!opt.canFulfill || !!stockOptionsModal.reservingSiteId}
                            onClick={() => stockOptionsModal.mode === 'change' ? changeFulfilmentSite(opt.siteId, 'reserve') : reserveStock(opt.siteId)}
                            className="text-blue-700 hover:underline disabled:opacity-50"
                          >
                            {stockOptionsModal.reservingSiteId === String(opt.siteId)
                              ? 'Reserving...'
                              : stockOptionsModal.mode === 'change'
                                ? 'Change & Reserve From This Site'
                                : 'Reserve From This Site'}
                          </button>
                        ) : null}
                        <button
                          disabled={!opt.canFulfill || !!stockOptionsModal.reservingSiteId || (stockOptionsModal.mode !== 'change' && stockOptionsModal.order?.stockRequest?.status === 'pending')}
                          onClick={() => stockOptionsModal.mode === 'change' ? changeFulfilmentSite(opt.siteId, 'request') : createStockRequest(stockOptionsModal.order?._id, opt.siteId)}
                          className="text-purple-700 hover:underline disabled:opacity-50"
                        >
                          {stockOptionsModal.mode === 'change' ? 'Change & Request Stock From Site' : 'Request Stock From Site'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setStockOptionsModal({ open: false, order: null, options: [], loading: false, reservingSiteId: '', mode: 'reserve' })} className="px-4 py-2 rounded border">Close</button>
            </div>
          </div>
        </div>
      )}

      {redirectModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow p-4 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-3">Redirect Returned Order</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="border p-2 rounded" placeholder="Customer Name *" value={redirectModal.customer.name} onChange={(e) => setRedirectModal((p) => ({ ...p, customer: { ...p.customer, name: e.target.value } }))} />
              <input className="border p-2 rounded" placeholder="Customer Email" value={redirectModal.customer.email} onChange={(e) => setRedirectModal((p) => ({ ...p, customer: { ...p.customer, email: e.target.value } }))} />
              <input className="border p-2 rounded" placeholder="Customer Mobile *" value={redirectModal.customer.mobile} onChange={(e) => setRedirectModal((p) => ({ ...p, customer: { ...p.customer, mobile: e.target.value } }))} />
              <input className="border p-2 rounded" placeholder="Customer City *" value={redirectModal.customer.city} onChange={(e) => setRedirectModal((p) => ({ ...p, customer: { ...p.customer, city: e.target.value } }))} />
              <input className="border p-2 rounded md:col-span-2" placeholder="Customer Address *" value={redirectModal.customer.address} onChange={(e) => setRedirectModal((p) => ({ ...p, customer: { ...p.customer, address: e.target.value } }))} />
              <select className="border p-2 rounded" value={redirectModal.paymentMode} onChange={(e) => setRedirectModal((p) => ({ ...p, paymentMode: e.target.value }))}>
                <option value="cod">Cash On Delivery</option>
                <option value="prepaid">Prepaid</option>
                <option value="free">Free</option>
              </select>
              <input className="border p-2 rounded" placeholder="Payment Method Name" value={redirectModal.paymentMethodName} onChange={(e) => setRedirectModal((p) => ({ ...p, paymentMethodName: e.target.value }))} />
              <input className="border p-2 rounded" placeholder="Remarks" value={redirectModal.remarks} onChange={(e) => setRedirectModal((p) => ({ ...p, remarks: e.target.value }))} />
              <select className="border p-2 rounded" value={redirectModal.courierId} onChange={(e) => setRedirectModal((p) => ({ ...p, courierId: e.target.value }))}>
                <option value="">Select Courier *</option>
                {couriers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <input className="border p-2 rounded" placeholder="Tracking Number" value={redirectModal.trackingNumber} onChange={(e) => setRedirectModal((p) => ({ ...p, trackingNumber: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="border px-3 py-2 rounded" onClick={() => setRedirectModal({ open: false, order: null, customer: { name: '', email: '', mobile: '', address: '', city: '' }, courierId: '', trackingNumber: '', paymentMode: 'prepaid', paymentMethodName: '', remarks: '' })}>Cancel</button>
              <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={submitRedirectReturnedOrder}>Redirect & Dispatch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
