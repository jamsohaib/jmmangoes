import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import api, { toPublicAssetUrl } from '../lib/api';
import DEFAULT_CITIES from '../constants/defaultCities';

const emptyCustomer = {
  name: '',
  email: '',
  mobile: '',
  address: '',
  city: '',
  otherCity: '',
  postalCode: '',
};

const PlaceCustomerOrder = () => {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(emptyCustomer);
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [giftSources, setGiftSources] = useState([]);
  const [shippingSettings, setShippingSettings] = useState({ zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ productId: '', quantity: 1 });
  const [paymentMode, setPaymentMode] = useState('cod');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [customerAlreadyConfirmed, setCustomerAlreadyConfirmed] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [giftMode, setGiftMode] = useState('none');
  const [giftForm, setGiftForm] = useState({
    ownerGiftSourceId: '',
    senderName: '',
    senderContact: '',
    senderAddress: '',
    giftAmount: '',
    giftNote: '',
  });
  const [stockAction, setStockAction] = useState({ mode: 'later', siteId: '' });
  const [fulfilmentOptions, setFulfilmentOptions] = useState([]);
  const [loadingFulfilment, setLoadingFulfilment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/getProductsForPublic')
      .then((res) => setProducts(res.data || []))
      .catch(() => toast.error('Failed to load online products.'));
    api.get('/shippingCosts/public')
      .then((res) => setShippingSettings(res.data || { zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] }))
      .catch(() => {});
    api.get('/payment-methods/public')
      .then((res) => setPaymentMethods((res.data || []).filter((m) => !m.isCashOnDelivery)))
      .catch(() => setPaymentMethods([]));
    api.get('/gift-sources')
      .then((res) => setGiftSources((res.data || []).filter((row) => row.isActive !== false)))
      .catch(() => setGiftSources([]));
  }, []);

  useEffect(() => {
    if (!items.length) {
      setFulfilmentOptions([]);
      setStockAction({ mode: 'later', siteId: '' });
      return;
    }
    let active = true;
    setLoadingFulfilment(true);
    api.post('/orders/preview-fulfilment-sites', {
      items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    })
      .then((res) => {
        if (!active) return;
        const options = res.data?.options || [];
        setFulfilmentOptions(options);
        setStockAction((prev) => ({
          ...prev,
          siteId: options.some((row) => String(row.siteId) === String(prev.siteId)) ? prev.siteId : '',
        }));
      })
      .catch(() => {
        if (!active) return;
        setFulfilmentOptions([]);
      })
      .finally(() => {
        if (active) setLoadingFulfilment(false);
      });
    return () => {
      active = false;
    };
  }, [items]);

  const availableCities = shippingSettings.allowedCities?.length ? shippingSettings.allowedCities : DEFAULT_CITIES;
  const selectedPaymentMethod = paymentMethods.find((m) => String(m._id) === String(paymentMethodId)) || null;
  const isGift = giftMode !== 'none';

  const shippingRate = useMemo(() => {
    const city = String(customer.city || '').trim().toLowerCase();
    const override = shippingSettings.cityOverrides?.find((o) => String(o.city || '').toLowerCase() === city);
    return Number(override ? override.cost : shippingSettings.zoneAUnitCost || 0) || 0;
  }, [customer.city, shippingSettings]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const qty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const shipping = shippingRate * qty;
    const base = subtotal + shipping;
    let discount = 0;
    if (!isGift && paymentMode === 'prepaid' && selectedPaymentMethod?.discountType === 'fixed') discount = Number(selectedPaymentMethod.discountValue || 0);
    if (!isGift && paymentMode === 'prepaid' && selectedPaymentMethod?.discountType === 'percentage') discount = (base * Number(selectedPaymentMethod.discountValue || 0)) / 100;
    let charge = 0;
    if (!isGift && paymentMode === 'prepaid' && selectedPaymentMethod?.chargeType === 'fixed') charge = Number(selectedPaymentMethod.chargeValue || 0);
    if (!isGift && paymentMode === 'prepaid' && selectedPaymentMethod?.chargeType === 'percentage') charge = (base * Number(selectedPaymentMethod.chargeValue || 0)) / 100;
    const payable = isGift
      ? (giftMode === 'owner' ? 0 : Math.max(0, Number(giftForm.giftAmount || base)))
      : Math.max(0, base - Math.max(0, discount) + Math.max(0, charge));
    return {
      subtotal,
      qty,
      shipping,
      discount: Math.max(0, discount),
      charge: Math.max(0, charge),
      payable,
      base,
    };
  }, [items, paymentMode, selectedPaymentMethod, shippingRate, isGift, giftMode, giftForm.giftAmount]);

  const setCustomerField = (field, value) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    const product = products.find((p) => String(p._id) === String(newItem.productId));
    const quantity = Math.trunc(Number(newItem.quantity || 0));
    if (!product || quantity < 1) return toast.warn('Select product and valid quantity.');
    setItems((prev) => {
      const existing = prev.find((item) => String(item.productId) === String(product._id));
      if (existing) {
        return prev.map((item) => String(item.productId) === String(product._id)
          ? { ...item, quantity: Number(item.quantity || 0) + quantity }
          : item);
      }
      return [...prev, { productId: product._id, name: product.name, price: Number(product.price || 0), quantity }];
    });
    setNewItem({ productId: '', quantity: 1 });
  };

  const updateItemQty = (productId, quantity) => {
    const nextQty = Math.trunc(Number(quantity || 0));
    if (nextQty < 1) return;
    setItems((prev) => prev.map((item) => String(item.productId) === String(productId) ? { ...item, quantity: nextQty } : item));
  };

  const uploadReceipt = async (file) => {
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      const res = await api.post('/upload-payment-receipt', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReceiptUrl(res.data?.receiptUrl || '');
      toast.success('Receipt uploaded.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to upload receipt.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const submit = async () => {
    if (submitting) return;
    if (!customer.name.trim()) return toast.warn('Customer name is required.');
    if (!customer.mobile.trim()) return toast.warn('Customer mobile/WhatsApp is required.');
    if (!customer.address.trim()) return toast.warn('Customer address is required.');
    if (!customer.city.trim()) return toast.warn('Customer city is required.');
    if (!items.length) return toast.warn('Add at least one product.');
    if (!isGift && paymentMode === 'prepaid' && !receiptUrl) return toast.warn('Upload payment receipt for prepaid order.');
    if (giftMode === 'owner' && !giftForm.ownerGiftSourceId) return toast.warn('Select owner/family gift source.');
    if (giftMode === 'customer') {
      if (!giftForm.senderName.trim()) return toast.warn('Sender name is required for customer gift.');
      if (!giftForm.senderContact.trim()) return toast.warn('Sender contact is required for customer gift.');
      if (!giftForm.senderAddress.trim()) return toast.warn('Sender address is required for customer gift.');
    }
    if (stockAction.mode !== 'later' && !stockAction.siteId) return toast.warn('Select fulfilment site for stock action.');
    if (stockAction.mode === 'reserve') {
      const selected = fulfilmentOptions.find((row) => String(row.siteId) === String(stockAction.siteId));
      if (!selected?.canFulfill) return toast.warn('Selected site cannot directly reserve complete stock.');
    }
    if (sendWhatsApp && !String(customer.mobile || '').replace(/\D/g, '')) return toast.warn('Enter customer WhatsApp number or uncheck WhatsApp.');

    const stockLine = stockAction.mode === 'later'
      ? 'Stock Action: Later in Order Management'
      : `Stock Action: ${stockAction.mode === 'reserve' ? 'Reserve now' : 'Request stock'} from ${fulfilmentOptions.find((row) => String(row.siteId) === String(stockAction.siteId))?.siteName || '-'}`;
    const ok = window.confirm(`Create customer order?\n\nCustomer: ${customer.name}\nAmount: PKR ${totals.payable.toFixed(2)}\nPayment: ${isGift ? 'Gift / recipient COD zero' : paymentMode === 'cod' ? 'Cash on Delivery' : 'Prepaid verified'}\n${stockLine}`);
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await api.post('/orders/customer-order', {
        customer,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        paymentMode: isGift ? 'cod' : paymentMode,
        paymentMethodId: !isGift && paymentMode === 'prepaid' ? paymentMethodId : '',
        receiptUrl: !isGift && paymentMode === 'prepaid' ? receiptUrl : '',
        customerAlreadyConfirmed,
        sendWhatsApp,
        noteText,
        gift: isGift ? {
          isGift: true,
          giftType: giftMode,
          ownerGiftSourceId: giftForm.ownerGiftSourceId,
          senderName: giftForm.senderName,
          senderContact: giftForm.senderContact,
          senderAddress: giftForm.senderAddress,
          giftPaymentType: 'prepaid',
          giftAmount: giftMode === 'owner' ? 0 : Number(giftForm.giftAmount || totals.base || totals.payable || 0),
          giftNote: giftForm.giftNote,
        } : null,
        stockAction,
      });
      toast.success(`Order ${res.data?.orderNumber || ''} created.`);
      navigate('/order-management');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create customer order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 text-black">
      <div className="max-w-5xl mx-auto bg-white rounded shadow p-4 md:p-6">
        <h2 className="text-2xl font-bold text-green-800 mb-1">Place Customer Order</h2>
        <p className="text-sm text-gray-600 mb-5">
          Use this for orders received by phone, WhatsApp, or direct customer request. Prices are taken from the online store.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className="border rounded p-2" placeholder="Customer name" value={customer.name} onChange={(e) => setCustomerField('name', e.target.value)} />
          <input className="border rounded p-2" placeholder="Email (optional)" value={customer.email} onChange={(e) => setCustomerField('email', e.target.value)} />
          <input className="border rounded p-2" placeholder="Mobile / WhatsApp" value={customer.mobile} onChange={(e) => setCustomerField('mobile', e.target.value)} />
          <input className="border rounded p-2" placeholder="Postal code (optional)" value={customer.postalCode} onChange={(e) => setCustomerField('postalCode', e.target.value)} />
          <textarea className="border rounded p-2 md:col-span-2" placeholder="Delivery address" value={customer.address} onChange={(e) => setCustomerField('address', e.target.value)} rows={2} />
          <select className="border rounded p-2" value={customer.city} onChange={(e) => setCustomerField('city', e.target.value)}>
            <option value="">Select City</option>
            {availableCities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          {customer.city === 'Other' ? (
            <input className="border rounded p-2" placeholder="Other city" value={customer.otherCity} onChange={(e) => setCustomerField('otherCity', e.target.value)} />
          ) : null}
        </div>

        <div className="mt-6 border rounded p-4">
          <h3 className="font-semibold mb-3">Add Products</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2">
            <select className="border rounded p-2" value={newItem.productId} onChange={(e) => setNewItem((prev) => ({ ...prev, productId: e.target.value }))}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name} - PKR {Number(p.price || 0).toFixed(2)}</option>)}
            </select>
            <input
              className="border rounded p-2"
              type="number"
              min="1"
              step="1"
              value={newItem.quantity}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => setNewItem((prev) => ({ ...prev, quantity: e.target.value }))}
            />
            <button type="button" onClick={addItem} className="bg-green-700 text-white rounded px-4 py-2">Add Product</button>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 border">Product</th>
                  <th className="text-right p-2 border">Rate</th>
                  <th className="text-right p-2 border">Qty</th>
                  <th className="text-right p-2 border">Total</th>
                  <th className="text-left p-2 border">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.productId}>
                    <td className="p-2 border">{item.name}</td>
                    <td className="p-2 border text-right">PKR {Number(item.price || 0).toFixed(2)}</td>
                    <td className="p-2 border text-right">
                      <input className="border rounded p-1 w-20 text-right" type="number" min="1" step="1" value={item.quantity} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => updateItemQty(item.productId, e.target.value)} />
                    </td>
                    <td className="p-2 border text-right">PKR {(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</td>
                    <td className="p-2 border"><button type="button" className="text-red-700 hover:underline" onClick={() => setItems((prev) => prev.filter((row) => row.productId !== item.productId))}>Remove</button></td>
                  </tr>
                ))}
                {!items.length ? <tr><td className="p-3 text-center text-gray-500" colSpan={5}>No products added.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold mb-3">Payment</h3>
            {isGift ? (
              <div className="mb-3 rounded border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                Gift order selected. Recipient courier/COD amount will remain zero.
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="paymentMode" value="cod" checked={paymentMode === 'cod'} disabled={isGift} onChange={() => setPaymentMode('cod')} />
                Cash on Delivery
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="paymentMode" value="prepaid" checked={paymentMode === 'prepaid'} disabled={isGift} onChange={() => setPaymentMode('prepaid')} />
                Prepaid (receipt required and marked verified)
              </label>
            </div>
            {!isGift && paymentMode === 'prepaid' ? (
              <div className="mt-3 space-y-3">
                <select className="border rounded p-2 w-full" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                  <option value="">Prepaid method (optional)</option>
                  {paymentMethods.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
                <input type="file" accept="image/*" onChange={(e) => uploadReceipt(e.target.files?.[0])} className="border rounded p-2 w-full" />
                {uploadingReceipt ? <div className="text-xs text-gray-500">Uploading receipt...</div> : null}
                {receiptUrl ? <a href={toPublicAssetUrl(receiptUrl)} target="_blank" rel="noreferrer" className="text-blue-700 text-sm underline">View uploaded receipt</a> : null}
              </div>
            ) : null}
          </div>

          <div className="border rounded p-4 bg-green-50">
            <h3 className="font-semibold mb-3">Order Summary</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>PKR {totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Shipping ({totals.qty} qty x PKR {shippingRate.toFixed(2)})</span><span>PKR {totals.shipping.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Payment Discount</span><span>- PKR {totals.discount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Payment Charge</span><span>PKR {totals.charge.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2"><span>Total Payable</span><span>PKR {totals.payable.toFixed(2)}</span></div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={customerAlreadyConfirmed} onChange={(e) => setCustomerAlreadyConfirmed(e.target.checked)} />
                Customer already confirmed this order
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} />
                Send WhatsApp message to customer
              </label>
              <div className="text-xs text-gray-600">
                If already confirmed, a thank-you/order details template is sent when configured. Otherwise the confirmation request template is sent.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold mb-3">Gift Options</h3>
            <select
              className="border rounded p-2 w-full"
              value={giftMode}
              onChange={(e) => {
                const next = e.target.value;
                setGiftMode(next);
                if (next !== 'none') setPaymentMode('cod');
                if (next === 'customer' && !giftForm.giftAmount) {
                  setGiftForm((prev) => ({ ...prev, giftAmount: String(totals.base || totals.payable || 0) }));
                }
              }}
            >
              <option value="none">Not a gift</option>
              <option value="owner">Gift from owners</option>
              <option value="customer">Gift from customer</option>
            </select>

            {giftMode === 'owner' ? (
              <div className="mt-3 space-y-3">
                <select
                  className="border rounded p-2 w-full"
                  value={giftForm.ownerGiftSourceId}
                  onChange={(e) => setGiftForm((prev) => ({ ...prev, ownerGiftSourceId: e.target.value }))}
                >
                  <option value="">Select owner/family member</option>
                  {giftSources.map((source) => <option key={source._id} value={source._id}>{source.name}</option>)}
                </select>
                <textarea
                  className="border rounded p-2 w-full"
                  rows={2}
                  placeholder="Gift note (optional)"
                  value={giftForm.giftNote}
                  onChange={(e) => setGiftForm((prev) => ({ ...prev, giftNote: e.target.value }))}
                />
                <div className="text-xs text-purple-800">Owner gifts are marked prepaid with zero amount for the receiver.</div>
              </div>
            ) : null}

            {giftMode === 'customer' ? (
              <div className="mt-3 grid grid-cols-1 gap-3">
                <input className="border rounded p-2" placeholder="Sender name" value={giftForm.senderName} onChange={(e) => setGiftForm((prev) => ({ ...prev, senderName: e.target.value }))} />
                <input className="border rounded p-2" placeholder="Sender contact" value={giftForm.senderContact} onChange={(e) => setGiftForm((prev) => ({ ...prev, senderContact: e.target.value }))} />
                <textarea className="border rounded p-2" rows={2} placeholder="Sender address" value={giftForm.senderAddress} onChange={(e) => setGiftForm((prev) => ({ ...prev, senderAddress: e.target.value }))} />
                <input className="border rounded p-2" type="number" min="0" step="1" placeholder="Amount paid by sender" value={giftForm.giftAmount} onChange={(e) => setGiftForm((prev) => ({ ...prev, giftAmount: e.target.value }))} />
                <textarea className="border rounded p-2" rows={2} placeholder="Gift note from sender (optional)" value={giftForm.giftNote} onChange={(e) => setGiftForm((prev) => ({ ...prev, giftNote: e.target.value }))} />
                <div className="text-xs text-purple-800">Customer gifts are treated as prepaid for the receiver, so courier/COD amount remains zero.</div>
              </div>
            ) : null}
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold mb-3">Notes For Processing Staff</h3>
            <textarea
              className="border rounded p-2 w-full"
              rows={6}
              placeholder="Add packing, calling, gift-card, address, or processing notes..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="text-xs text-gray-600 mt-2">Orders with notes will be highlighted in Order Management.</div>
          </div>
        </div>

        <div className="mt-6 border rounded p-4">
          <h3 className="font-semibold mb-3">Optional Stock Reservation / Request</h3>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
            <select
              className="border rounded p-2"
              value={stockAction.mode}
              onChange={(e) => setStockAction((prev) => ({ ...prev, mode: e.target.value, siteId: e.target.value === 'later' ? '' : prev.siteId }))}
            >
              <option value="later">Handle later in Order Management</option>
              <option value="reserve">Reserve directly now</option>
              <option value="request">Request stock from site</option>
            </select>
            <select
              className="border rounded p-2"
              value={stockAction.siteId}
              disabled={stockAction.mode === 'later' || loadingFulfilment || !fulfilmentOptions.length}
              onChange={(e) => setStockAction((prev) => ({ ...prev, siteId: e.target.value }))}
            >
              <option value="">{loadingFulfilment ? 'Checking stock...' : 'Select fulfilment site'}</option>
              {fulfilmentOptions.map((row) => (
                <option key={row.siteId} value={row.siteId} disabled={stockAction.mode === 'reserve' && !row.canFulfill}>
                  {row.siteName} - {row.canFulfill ? 'Can fulfill' : 'Insufficient'}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {fulfilmentOptions.map((row) => (
              <div key={row.siteId} className={`rounded border p-3 text-xs ${row.canFulfill ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="font-semibold text-sm">{row.siteName}</div>
                <div className={row.canFulfill ? 'text-green-800' : 'text-amber-800'}>{row.canFulfill ? 'Can fulfill complete order' : 'Insufficient for direct reserve'}</div>
                <div className="mt-2 space-y-1">
                  {(row.items || []).map((item) => (
                    <div key={`${row.siteId}-${item.productName}`}>{item.productName}: required {item.requiredQty}, available {item.availableQty}</div>
                  ))}
                </div>
              </div>
            ))}
            {!items.length ? <div className="text-sm text-gray-500">Add products to preview stock options.</div> : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/order-management')} className="border rounded px-4 py-2">Cancel</button>
          <button type="button" disabled={submitting} onClick={submit} className="bg-green-700 text-white rounded px-4 py-2 disabled:opacity-60">
            {submitting ? 'Creating...' : 'Create Customer Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlaceCustomerOrder;
