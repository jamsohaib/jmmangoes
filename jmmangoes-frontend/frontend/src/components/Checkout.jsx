import { useState, useEffect, useMemo } from 'react';
import useCartStore from '../store/cartStore';
import api, { toPublicAssetUrl } from '../lib/api';
import DEFAULT_CITIES from '../constants/defaultCities';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

function Checkout() {
  const navigate = useNavigate();
  const { cart, totalItems, incrementQuantity, decrementQuantity, clearCart } = useCartStore();
  const [step, setStep] = useState('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    otherCity: '',
    mobile: '',
  });
  const [settings, setSettings] = useState({ zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [otherFiled, setOtherFiled] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const itemsCount = totalItems();

  useEffect(() => {
    api.get('/shippingCosts/public')
      .then((res) => setSettings(res.data || { zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] }))
      .catch(() => {});

    api.get('/payment-methods/public')
      .then((res) => {
        const rows = res.data || [];
        setPaymentMethods(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const found = paymentMethods.find((m) => String(m._id) === String(selectedPaymentMethodId));
    setSelectedPaymentMethod(found || null);
    if (!found) setReceiptUrl('');
  }, [paymentMethods, selectedPaymentMethodId]);

  const availableCities = settings.allowedCities?.length ? settings.allowedCities : DEFAULT_CITIES;

  const safeUnitShipping = useMemo(() => {
    const city = formData.city.trim().toLowerCase();
    const override = settings.cityOverrides?.find((o) => o.city.toLowerCase() === city);
    const nextUnit = override ? Number(override.cost || 0) : Number(settings.zoneAUnitCost || 0);
    return Number.isFinite(nextUnit) ? nextUnit : 0;
  }, [formData.city, settings]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [cart]
  );
  const shippingCost = safeUnitShipping * Number(itemsCount || 0);
  const baseTotal = subtotal + shippingCost;

  const paymentDiscount = useMemo(() => {
    if (!selectedPaymentMethod) return 0;
    if (selectedPaymentMethod.discountType === 'fixed') return Number(selectedPaymentMethod.discountValue || 0);
    if (selectedPaymentMethod.discountType === 'percentage') {
      return (Number(baseTotal || 0) * Number(selectedPaymentMethod.discountValue || 0)) / 100;
    }
    return 0;
  }, [selectedPaymentMethod, baseTotal]);

  const paymentCharge = useMemo(() => {
    if (!selectedPaymentMethod) return 0;
    if (selectedPaymentMethod.chargeType === 'fixed') return Number(selectedPaymentMethod.chargeValue || 0);
    if (selectedPaymentMethod.chargeType === 'percentage') {
      return (Number(baseTotal || 0) * Number(selectedPaymentMethod.chargeValue || 0)) / 100;
    }
    return 0;
  }, [selectedPaymentMethod, baseTotal]);

  const payableAmount = Math.max(0, Number(baseTotal || 0) - Number(paymentDiscount || 0) + Number(paymentCharge || 0));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'city') setOtherFiled(value === 'Other');
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

  const proceedToPayment = (e) => {
    e.preventDefault();
    if (!cart.length) return toast.warn('Your cart is empty.');
    if (!selectedPaymentMethodId) return toast.warn('Please select a payment method before proceeding.');
    if (!formData.name || !formData.address || !formData.city || !formData.mobile) {
      return toast.warn('Please complete required delivery fields.');
    }
    setStep('payment');
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting) return;
    if (!selectedPaymentMethodId) return toast.warn('Please select a payment option.');
    if (selectedPaymentMethod?.requiresReceipt && !receiptUrl) return toast.warn('Receipt upload is required for selected payment option.');
    if (!window.confirm('Please confirm. Do you want to place this order?')) return;

    setIsSubmitting(true);
    try {
      const res = await api.post('/checkout', {
        customer: formData,
        paymentMethodId: selectedPaymentMethodId,
        receiptUrl,
        items: cart.map((i) => ({
          productId: i._id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
      });
      clearCart();
      navigate('/order-success', { state: { orderNumber: res?.data?.orderNumber || '' } });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="max-w-4xl mx-auto p-4 md:p-6 bg-white shadow-md mt-6 md:mt-10">
      <h2 className="text-2xl font-bold mb-6 text-green-700">{step === 'details' ? 'Checkout' : 'Payment'}</h2>

      <div className="mb-6 text-green-700">
        <h3 className="text-xl font-semibold mb-4">Order Summary</h3>
        <ul>
          {cart.map((item) => (
            <li key={item._id} className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-3">
              <div>
                <span>{item.name}</span>
                <div className="flex items-center mt-2">
                  <button type="button" onClick={() => decrementQuantity(item._id)} className="bg-gray-200 px-2 py-1 rounded-l">-</button>
                  <span className="px-4">{item.quantity}</span>
                  <button type="button" onClick={() => incrementQuantity(item._id)} className="bg-gray-200 px-2 py-1 rounded-r">+</button>
                </div>
              </div>
              <span>PKR {Number(item.price || 0) * Number(item.quantity || 0)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-3 mt-4 text-sm md:text-base"><span>Shipping:</span><span>PKR {shippingCost.toFixed(2)}</span></div>
        <div className="flex justify-between gap-3 text-sm md:text-base"><span>Payment Discount:</span><span>- PKR {selectedPaymentMethodId ? Number(paymentDiscount || 0).toFixed(2) : '0.00'}</span></div>
        <div className="flex justify-between gap-3 text-sm md:text-base"><span>Additional Charges:</span><span>PKR {selectedPaymentMethodId ? Number(paymentCharge || 0).toFixed(2) : '0.00'}</span></div>
        <div className="flex justify-between gap-3 font-bold mt-2 text-sm md:text-base"><span>Total Payable:</span><span>PKR {payableAmount.toFixed(2)}</span></div>
      </div>

      {step === 'details' ? (
        <form onSubmit={proceedToPayment} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-black">
          <div><label className="block mb-2 text-sm font-medium text-gray-700">Full Name</label><input type="text" name="name" className="w-full border border-gray-300 p-2 rounded" value={formData.name} onChange={handleChange} required /></div>
          <div><label className="block mb-2 text-sm font-medium text-gray-700">Email (To get updates of order placement)</label><input type="email" name="email" className="w-full border border-gray-300 p-2 rounded" value={formData.email} onChange={handleChange} /></div>
          <div className="md:col-span-2"><label className="block mb-2 text-sm font-medium text-gray-700">Address</label><input type="text" name="address" className="w-full border border-gray-300 p-2 rounded" value={formData.address} onChange={handleChange} required /></div>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">City</label>
            <div className="relative">
              <select name="city" id="city" value={formData.city} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-3 text-base bg-white appearance-none pr-10" required>
                <option value="">Select City</option>
                {availableCities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500" aria-hidden="true">▾</span>
            </div>
          </div>
          {otherFiled ? <div><label className="block mb-2 text-sm font-medium text-gray-700">Other City</label><input type="text" id="otherCity" name="otherCity" className="w-full border border-gray-300 p-2 rounded" value={formData.otherCity} onChange={handleChange} placeholder="Enter city name" /></div> : null}
          <div><label className="block mb-2 text-sm font-medium text-gray-700">Mobile Number (Preferable WhatsApp)</label><input type="text" name="mobile" className="w-full border border-gray-300 p-2 rounded" value={formData.mobile} onChange={handleChange} placeholder="Enter mobile number preferably WhatsApp" required /></div>
          <div className="md:col-span-2 border rounded p-4">
            <label className="block mb-3 text-sm font-medium text-gray-700">Select Payment Method</label>
            <div className="space-y-2">
              {paymentMethods.map((m) => (
                <label key={m._id} className="flex items-center gap-2 border rounded px-3 py-2">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={m._id}
                    checked={String(selectedPaymentMethodId) === String(m._id)}
                    onChange={(e) => {
                      setSelectedPaymentMethodId(e.target.value);
                      setReceiptUrl('');
                    }}
                  />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-gray-600">
                    {m.discountType !== 'none' ? `Discount: ${m.discountType === 'percentage' ? `${m.discountValue}%` : `PKR ${m.discountValue}`}` : 'No discount'}
                    {m.chargeType !== 'none' ? ` | Charge: ${m.chargeType === 'percentage' ? `${m.chargeValue}%` : `PKR ${m.chargeValue}`}` : ''}
                  </span>
                </label>
              ))}
              {paymentMethods.length === 0 ? <div className="text-sm text-gray-500">No payment method available.</div> : null}
            </div>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full bg-green-600 text-white p-3 rounded hover:bg-green-700 transition">Proceed To Payment</button>
          </div>
        </form>
      ) : (
        <div className="text-black">
          <div className="grid grid-cols-1 gap-4">
            {paymentMethods.map((m) => {
              const selected = String(m._id) === String(selectedPaymentMethodId);
              const optionDiscount = m.discountType === 'fixed'
                ? Number(m.discountValue || 0)
                : m.discountType === 'percentage'
                  ? (Number(baseTotal || 0) * Number(m.discountValue || 0)) / 100
                  : 0;
              const optionCharge = m.chargeType === 'fixed'
                ? Number(m.chargeValue || 0)
                : m.chargeType === 'percentage'
                  ? (Number(baseTotal || 0) * Number(m.chargeValue || 0)) / 100
                  : 0;
              const optionPayable = Math.max(0, Number(baseTotal || 0) - Number(optionDiscount || 0) + Number(optionCharge || 0));
              return (
                <div
                  key={m._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedPaymentMethodId(String(m._id));
                    setReceiptUrl('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPaymentMethodId(String(m._id));
                      setReceiptUrl('');
                    }
                  }}
                  className={`text-left border rounded p-3 cursor-pointer transition ${
                    selected
                      ? 'border-green-700 ring-4 ring-green-300 bg-green-50 shadow-md'
                      : 'border-gray-300 bg-white hover:border-green-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{m.name}</div>
                    {selected ? <span className="text-xs font-bold text-green-700">Selected</span> : null}
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    {m.requiresReceipt ? 'Receipt required' : m.allowReceiptUpload ? 'Receipt optional' : 'No receipt needed'}
                  </div>
                  <div className="text-xs text-gray-700 mt-1">
                    {m.discountType !== 'none'
                      ? `Discount: ${m.discountType === 'percentage' ? `${m.discountValue}%` : `PKR ${m.discountValue}`}`
                      : 'No discount'}
                    {m.chargeType !== 'none'
                      ? ` | Charge: ${m.chargeType === 'percentage' ? `${m.chargeValue}%` : `PKR ${m.chargeValue}`}`
                      : ''}
                  </div>
                  {selected ? (
                    <div className="text-sm font-semibold text-green-800 mt-2">
                      Total discount offered: PKR {Number(optionDiscount || 0).toFixed(2)}
                    </div>
                  ) : null}
                  {selected ? (
                    <div className="mt-2 text-base font-bold text-green-900 border border-green-300 bg-white rounded px-3 py-2">
                      Total payable amount: PKR {Number(optionPayable || 0).toFixed(2)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {selectedPaymentMethod ? (
            <div className="mt-4 border rounded p-3 bg-gray-50">
              <div className="text-sm font-semibold text-gray-800 mb-2">Payment Details</div>
              {selectedPaymentMethod.details ? (
                <div className="text-sm text-gray-700 whitespace-pre-line">{selectedPaymentMethod.details}</div>
              ) : (
                <div className="text-sm text-gray-500">No additional payment details.</div>
              )}
              {selectedPaymentMethod.methodImageUrl ? (
                <img
                  src={toPublicAssetUrl(selectedPaymentMethod.methodImageUrl)}
                  alt={selectedPaymentMethod.name}
                  className="mt-3 h-16 object-contain"
                />
              ) : null}
              {selectedPaymentMethod.qrImageUrl ? (
                <button
                  type="button"
                  className="mt-3 block"
                  onClick={() => setQrPreviewUrl(toPublicAssetUrl(selectedPaymentMethod.qrImageUrl))}
                >
                  <img
                    src={toPublicAssetUrl(selectedPaymentMethod.qrImageUrl)}
                    alt={`${selectedPaymentMethod.name} QR`}
                    className="w-56 h-56 md:w-64 md:h-64 object-contain border rounded bg-white p-1"
                  />
                  <span className="mt-1 inline-block text-xs text-blue-700 underline">Tap to zoom QR</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {(selectedPaymentMethod?.requiresReceipt || selectedPaymentMethod?.allowReceiptUpload) ? (
            <div className="mt-4 border-2 border-amber-500 rounded-lg p-4 bg-amber-50 shadow-sm">
              <label className="block mb-2 text-base font-semibold text-amber-800">
                Upload Receipt {selectedPaymentMethod?.requiresReceipt ? '(Required)' : '(Optional)'}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => uploadReceipt(e.target.files?.[0])}
                className="w-full border-2 border-amber-500 bg-white p-3 rounded-md file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-amber-600 file:text-white hover:file:bg-amber-700"
              />
              {uploadingReceipt ? <div className="text-xs text-gray-500 mt-1">Uploading...</div> : null}
              {receiptUrl ? <a href={toPublicAssetUrl(receiptUrl)} target="_blank" rel="noreferrer" className="text-blue-700 font-medium text-sm mt-2 inline-block underline">View uploaded receipt</a> : null}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button type="button" onClick={() => setStep('details')} className="w-full border border-gray-400 text-gray-700 p-3 rounded">Back To Checkout</button>
            <button type="button" disabled={isSubmitting} onClick={handlePlaceOrder} className="w-full bg-green-600 text-white p-3 rounded hover:bg-green-700 transition disabled:opacity-60">
              {isSubmitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      )}
    </div>
    {qrPreviewUrl ? (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-white rounded shadow-lg p-3 max-w-[95vw] max-h-[95vh]">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium text-gray-800">Scan QR</div>
            <button type="button" onClick={() => setQrPreviewUrl('')} className="text-gray-700 border px-2 py-1 rounded">Close</button>
          </div>
          <img src={qrPreviewUrl} alt="QR preview" className="w-[88vw] h-[88vw] max-w-[700px] max-h-[700px] object-contain" />
        </div>
      </div>
    ) : null}
    </>
  );
}

export default Checkout;
