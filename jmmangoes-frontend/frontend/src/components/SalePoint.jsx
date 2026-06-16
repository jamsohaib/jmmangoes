import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from './common/DataTable';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);
const lastWeekStartISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
})();
const CASH_PAYMENT_METHOD_ID = 'cash_payment';
const CASH_PAYMENT_METHOD_NAME = 'Cash Payment';

const saleTypeLabel = (entryType) => (
  entryType === 'return' ? 'Return' :
  entryType === 'gift' ? 'Gift' :
  entryType === 'pay_later' ? 'Pay Later' :
  'Sale'
);

const salePaymentMethodLabel = (entry) => {
  if ((entry?.entryType || 'sale') === 'sale') return entry?.paymentMethodName || CASH_PAYMENT_METHOD_NAME;
  if (entry?.entryType === 'pay_later') return 'Pay Later';
  if (entry?.entryType === 'gift') return 'Gift';
  return '-';
};

const parseHolderSelection = (value) => {
  const [type, ...rest] = String(value || '').split(':');
  const id = rest.join(':');
  if (['site', 'warehouse', 'online', 'wholeseller'].includes(type) && id) return { holderType: type, holderId: id };
  return { holderType: 'site', holderId: value };
};

const SalePoint = () => {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.id === 'super-admin' || String(user?.username || '').toLowerCase() === 'admin';
  const canView = user?.role === 'admin' || user?.permissions?.salePoint?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.salePoint?.manage;

  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [entryDate, setEntryDate] = useState(todayISO);

  const [stock, setStock] = useState([]);
  const [entries, setEntries] = useState([]);
  const [giftSources, setGiftSources] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(CASH_PAYMENT_METHOD_ID);
  const [dateFrom, setDateFrom] = useState(lastWeekStartISO);
  const [dateTo, setDateTo] = useState(todayISO);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [priceIncreaseAmount, setPriceIncreaseAmount] = useState('');
  const [isGiftItem, setIsGiftItem] = useState(false);
  const [isPayLaterItem, setIsPayLaterItem] = useState(false);
  const [giftSourceId, setGiftSourceId] = useState('');
  const [saleItems, setSaleItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [sendWhatsAppOnSale, setSendWhatsAppOnSale] = useState(true);

  const [returnProductId, setReturnProductId] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnItems, setReturnItems] = useState([]);
  const [returnCustomerName, setReturnCustomerName] = useState('');
  const [returnCustomerWhatsapp, setReturnCustomerWhatsapp] = useState('');
  const [returnCustomerEmail, setReturnCustomerEmail] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');

  const loadSites = async () => {
    const res = await api.get('/sales/sites');
    const data = res.data || [];
    setSites(data);
    if (!siteId && data.length) setSiteId(data[0]._id);
  };

  const loadGiftSources = async () => {
    const res = await api.get('/gift-sources', { params: { activeOnly: true } });
    setGiftSources(res.data || []);
  };

  const loadPaymentMethods = async () => {
    const res = await api.get('/sales/payment-methods');
    setPaymentMethods(res.data || []);
  };

  const loadStock = async (id) => {
    if (!id) return setStock([]);
    const holder = sites.find((s) => String(s._id) === String(id));
    const parsed = parseHolderSelection(id);
    const res = await api.get('/sales/site-stock', {
      params: {
        holderType: holder?.holderType || parsed.holderType,
        holderId: holder?.holderId || parsed.holderId,
        siteId: holder?.holderType === 'site' ? holder.holderId : undefined,
      },
    });
    setStock(res.data || []);
  };

  const loadEntries = async (id, from, to) => {
    if (!id) return setEntries([]);
    const holder = sites.find((s) => String(s._id) === String(id));
    const parsed = parseHolderSelection(id);
    const params = {
      holderType: holder?.holderType || parsed.holderType,
      holderId: holder?.holderId || parsed.holderId,
      siteId: holder?.holderType === 'site' ? holder.holderId : undefined,
    };
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    const res = await api.get('/sales/entries', { params });
    setEntries(res.data || []);
  };

  useEffect(() => {
    if (canView) {
      loadSites().catch(console.error);
      loadGiftSources().catch(console.error);
      loadPaymentMethods().catch(console.error);
    }
  }, [canView]);

  useEffect(() => {
    if (canView && siteId) {
      loadStock(siteId).catch(console.error);
      loadEntries(siteId, dateFrom, dateTo).catch(console.error);
    }
  }, [canView, siteId, dateFrom, dateTo]);

  const selectedProduct = useMemo(() => stock.find((p) => p._id === productId) || null, [stock, productId]);
  const selectedSite = useMemo(() => sites.find((s) => String(s._id) === String(siteId)) || null, [sites, siteId]);
  const hasChargeableSaleItems = useMemo(() => saleItems.some((i) => !i.isGift && !i.isPayLater), [saleItems]);
  const selectedPaymentMethodName = useMemo(() => {
    if (selectedPaymentMethodId === CASH_PAYMENT_METHOD_ID) return CASH_PAYMENT_METHOD_NAME;
    return paymentMethods.find((m) => String(m._id) === String(selectedPaymentMethodId))?.name || CASH_PAYMENT_METHOD_NAME;
  }, [paymentMethods, selectedPaymentMethodId]);

  const addSaleItem = () => {
    if (!productId) return toast.warn('Select product first.');
    const qty = Number(quantity);
    const disc = Number(discountAmount || 0);
    const increase = Number(priceIncreaseAmount || 0);
    if (Number.isNaN(qty) || qty <= 0) return toast.warn('Enter valid quantity.');
    if (Number.isNaN(disc) || disc < 0) return toast.warn('Enter valid discount.');
    if (Number.isNaN(increase) || increase < 0) return toast.warn('Enter valid price increase.');
    if (isGiftItem && isPayLaterItem) return toast.warn('Select either Gift or Pay Later, not both.');
    if ((isGiftItem || isPayLaterItem) && (!customerName.trim() || !customerWhatsapp.trim())) {
      return toast.warn('Name and contact number are required for gift or pay later entries.');
    }
    if (isGiftItem && !giftSourceId) return toast.warn('Select the family member / owner source for this gift.');
    const product = stock.find((p) => p._id === productId);
    if (!product) return toast.warn('Selected product not found.');

    const existingQty = saleItems.filter((i) => i.productId === productId).reduce((sum, i) => sum + i.quantity, 0);
    if (existingQty + qty > Number(product.quantity || 0)) {
      return toast.warn('Quantity exceeds available stock.');
    }

    setSaleItems((prev) => [...prev, {
      productId: product._id,
      productName: product.name,
      unitPrice: Number(product.price || 0),
      quantity: qty,
      discountAmount: isGiftItem ? 0 : disc,
      priceIncreaseAmount: isGiftItem ? 0 : increase,
      isGift: isGiftItem,
      isPayLater: isPayLaterItem,
      giftSourceId: isGiftItem ? giftSourceId : '',
      giftSourceName: isGiftItem ? (giftSources.find((g) => String(g._id) === String(giftSourceId))?.name || '') : '',
    }]);
    setProductId('');
    setQuantity('');
    setDiscountAmount('');
    setPriceIncreaseAmount('');
    setIsGiftItem(false);
    setIsPayLaterItem(false);
    setGiftSourceId('');
  };

  const saleTotals = useMemo(() => {
    const gross = saleItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const discount = saleItems.reduce((sum, i) => sum + (!i.isGift && !i.isPayLater ? Number(i.discountAmount || 0) : 0), 0);
    const priceIncrease = saleItems.reduce((sum, i) => sum + (!i.isGift && !i.isPayLater ? Number(i.priceIncreaseAmount || 0) : 0), 0);
    const giftValue = saleItems.reduce((sum, i) => sum + (i.isGift ? i.unitPrice * i.quantity : 0), 0);
    const payLaterValue = saleItems.reduce((sum, i) => sum + (i.isPayLater ? Math.max(0, i.unitPrice * i.quantity + Number(i.priceIncreaseAmount || 0) - Number(i.discountAmount || 0)) : 0), 0);
    const chargeableGross = gross - giftValue - saleItems.reduce((sum, i) => sum + (i.isPayLater ? i.unitPrice * i.quantity : 0), 0);
    return { gross, giftValue, payLaterValue, chargeableGross, priceIncrease, discount, net: Math.max(0, chargeableGross + priceIncrease - discount) };
  }, [saleItems]);

  const proceedPayment = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!siteId || saleItems.length === 0) return toast.warn('Add at least one sale item.');
    const paymentLine = hasChargeableSaleItems ? `\nPayment Mode: ${selectedPaymentMethodName}` : '';
    const ok = window.confirm(`Confirm payment and save sale?\nNet Amount: PKR ${saleTotals.net.toFixed(2)}${paymentLine}`);
    if (!ok) return;
    try {
      await api.post('/sales/checkout', {
        siteId: selectedSite?.holderType === 'site' ? selectedSite.holderId : undefined,
        holderType: selectedSite?.holderType || parseHolderSelection(siteId).holderType,
        holderId: selectedSite?.holderId || parseHolderSelection(siteId).holderId,
        date: entryDate,
        customerName,
        customerWhatsapp,
        customerEmail,
        paymentMethodId: hasChargeableSaleItems ? selectedPaymentMethodId : '',
        sendWhatsApp: sendWhatsAppOnSale,
        items: saleItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          discountAmount: i.discountAmount,
          priceIncreaseAmount: i.priceIncreaseAmount,
          isGift: i.isGift,
          isPayLater: i.isPayLater,
          giftSourceId: i.giftSourceId,
        })),
      });
      toast.success('Payment confirmed and sale saved.');
      setSaleItems([]);
      setCustomerName('');
      setCustomerWhatsapp('');
      setCustomerEmail('');
      setSelectedPaymentMethodId(CASH_PAYMENT_METHOD_ID);
      setSendWhatsAppOnSale(true);
      await loadStock(siteId);
      await loadEntries(siteId, dateFrom, dateTo);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save sale checkout.');
    }
  };

  const printReceipt = () => {
    if (!siteId || saleItems.length === 0) return toast.warn('Add at least one sale item before printing receipt.');

    const printedAt = new Date().toLocaleString();
    const printedBy = user?.name || user?.username || 'N/A';
    const siteName = selectedSite?.name || 'N/A';
    const sitePhone = selectedSite?.contactNumber || 'N/A';

    const linesHtml = saleItems.map((item) => {
      const adjustedUnitPrice = Number(item.unitPrice || 0) + (Number(item.priceIncreaseAmount || 0) / Math.max(1, Number(item.quantity || 0)));
      const lineTotal = item.isGift || item.isPayLater ? 0 : Math.max(
        0,
        Number(item.unitPrice || 0) * Number(item.quantity || 0) +
          Number(item.priceIncreaseAmount || 0) -
          Number(item.discountAmount || 0)
      );
      return `
        <tr>
          <td>${item.productName}</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:right;">${adjustedUnitPrice.toFixed(0)}</td>
          <td style="text-align:right;">${(Number(item.unitPrice || 0) * Number(item.quantity || 0) + Number(item.priceIncreaseAmount || 0)).toFixed(0)}</td>
          <td style="text-align:center;">${item.isGift ? `Gift (${item.giftSourceName || '-'})` : item.isPayLater ? 'Pay Later' : 'Sale'}</td>
          <td style="text-align:right;">${lineTotal.toFixed(0)}</td>
        </tr>
      `;
    }).join('');

    const buildCopy = (title) => `
      <div class="receipt-copy">
        <div class="center">
          <img src="/images/JM_Mangoes_Logo.png?v=20260523" alt="JM Mangoes Logo" class="logo" />
          <h2>JM Mangoes</h2>
          <div>Phone: 03218869344</div>
          <div>Website: jmmangoes.pk</div>
          <div class="spacer"></div>
          <div><strong>${title}</strong></div>
        </div>
        <hr />
        <div>Site: ${siteName}</div>
        <div>Site Contact: ${sitePhone}</div>
        <div>Entry Date: ${entryDate}</div>
        <div>Printed At: ${printedAt}</div>
        <div>Printed By: ${printedBy}</div>
        <div>Customer: ${customerName || '-'}</div>
        <div>WhatsApp: ${customerWhatsapp || '-'}</div>
        <hr />
        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Item</th>
              <th>Qty</th>
              <th style="text-align:right;">Rate</th>
              <th style="text-align:right;">Gross</th>
              <th>Status</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${linesHtml}</tbody>
        </table>
        <hr />
        <div class="row"><span>Gross</span><strong>PKR ${(saleTotals.gross + saleTotals.priceIncrease).toFixed(0)}</strong></div>
        ${saleTotals.giftValue > 0 ? `<div class="row"><span>Gift Value</span><strong>PKR ${saleTotals.giftValue.toFixed(0)}</strong></div>` : ''}
        ${saleTotals.payLaterValue > 0 ? `<div class="row"><span>Pay Later Receivable</span><strong>PKR ${saleTotals.payLaterValue.toFixed(0)}</strong></div>` : ''}
        ${saleTotals.chargeableGross + saleTotals.priceIncrease !== saleTotals.gross + saleTotals.priceIncrease ? `<div class="row"><span>Chargeable Gross</span><strong>PKR ${(saleTotals.chargeableGross + saleTotals.priceIncrease).toFixed(0)}</strong></div>` : ''}
        ${saleTotals.discount > 0 ? `<div class="row"><span>Discount</span><strong>PKR ${saleTotals.discount.toFixed(0)}</strong></div>` : ''}
        <div class="row"><span>Net</span><strong>PKR ${saleTotals.net.toFixed(0)}</strong></div>
        <hr />
        <div class="center">Thank you for your purchase from our store.</div>
      </div>
    `;

    const receiptHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>JM Mangoes Receipt</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
            .receipt-copy { width: 72mm; margin: 0 auto 6mm auto; }
            .center { text-align: center; }
            .logo { width: 52px; height: 52px; object-fit: contain; display: block; margin: 0 auto 4px auto; }
            h2 { margin: 0; font-size: 15px; }
            .spacer { height: 4px; }
            hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 2px 0; vertical-align: top; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .cut { border-top: 1px dashed #555; margin: 8px 0; padding-top: 4px; text-align: center; font-size: 10px; }
          </style>
        </head>
        <body>
          ${buildCopy('Customer Copy')}
          <div class="cut">------------ Cut Here ------------</div>
          ${buildCopy('Sale Point Record Copy')}
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `;

    const w = window.open('', '_blank', 'width=420,height=760');
    if (!w) return toast.error('Popup blocked. Please allow popups to print receipt.');
    w.document.open();
    w.document.write(receiptHtml);
    w.document.close();
  };

  const addReturnItem = () => {
    if (!returnProductId) return toast.warn('Select return product first.');
    const qty = Number(returnQuantity);
    const amt = Number(returnAmount);
    if (Number.isNaN(qty) || qty <= 0) return toast.warn('Enter valid return quantity.');
    if (Number.isNaN(amt) || amt < 0) return toast.warn('Enter valid return amount.');
    const product = stock.find((p) => p._id === returnProductId);
    if (!product) return toast.warn('Selected return product not found.');
    setReturnItems((prev) => [...prev, {
      productId: product._id,
      productName: product.name,
      quantity: qty,
      returnAmount: amt,
    }]);
    setReturnProductId('');
    setReturnQuantity('');
    setReturnAmount('');
  };

  const submitReturn = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!siteId || returnItems.length === 0) return toast.warn('Add at least one return item.');
    const ok = window.confirm('Confirm return entry?');
    if (!ok) return;
    try {
      await api.post('/sales/return', {
        siteId: selectedSite?.holderType === 'site' ? selectedSite.holderId : undefined,
        holderType: selectedSite?.holderType || parseHolderSelection(siteId).holderType,
        holderId: selectedSite?.holderId || parseHolderSelection(siteId).holderId,
        date: entryDate,
        customerName: returnCustomerName,
        customerWhatsapp: returnCustomerWhatsapp,
        customerEmail: returnCustomerEmail,
        items: returnItems,
      });
      toast.success('Return saved and stock updated.');
      setReturnItems([]);
      setReturnCustomerName('');
      setReturnCustomerWhatsapp('');
      setReturnCustomerEmail('');
      await loadStock(siteId);
      await loadEntries(siteId, dateFrom, dateTo);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save return entry.');
    }
  };

  const deleteTransaction = async (row) => {
    if (!isSuperAdmin) return toast.warn('Only super admin can delete sale transactions.');
    const type = saleTypeLabel(row.entryType);
    const ok = window.confirm(
      `Delete this ${type} transaction?\n\nProduct: ${row.productName || '-'}\nQuantity: ${row.quantity || 0}\nNet Amount: PKR ${Number(row.netAmount || 0).toFixed(2)}\n\nStock will be reversed and reports will update after deletion.`
    );
    if (!ok) return;
    try {
      await api.delete(`/sales/entries/${row._id}`);
      toast.success('Transaction deleted and stock reversed.');
      await loadStock(siteId);
      await loadEntries(siteId, dateFrom, dateTo);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete transaction.');
    }
  };

  const transactionNet = useMemo(() => entries.reduce((sum, e) => sum + Number(e.netAmount || 0), 0), [entries]);

  const transactionColumns = useMemo(() => ([
    {
      name: 'Date',
      selector: (row) => new Date(row.createdAt || row.date).toLocaleString(),
      sortable: true,
      wrap: true,
    },
    { name: 'Type', selector: (row) => saleTypeLabel(row.entryType), sortable: true },
    { name: 'Customer Name', selector: (row) => row.customerName || '-', sortable: true, wrap: true },
    { name: 'WhatsApp', selector: (row) => row.customerWhatsapp || '-', wrap: true },
    { name: 'Email', selector: (row) => row.customerEmail || '-', wrap: true },
    { name: 'Product', selector: (row) => row.productName || '-', sortable: true, wrap: true },
    { name: 'Qty', selector: (row) => Number(row.quantity || 0), sortable: true, right: true },
    { name: 'Gross', selector: (row) => Number(row.grossAmount || 0), sortable: true, right: true, cell: (row) => `PKR ${Number(row.grossAmount || 0).toFixed(2)}` },
    { name: 'Price Increase', selector: (row) => Number(row.priceIncreaseAmount || 0), sortable: true, right: true, cell: (row) => `PKR ${Number(row.priceIncreaseAmount || 0).toFixed(2)}` },
    { name: 'Discount', selector: (row) => Number(row.discountAmount || 0), sortable: true, right: true, cell: (row) => `PKR ${Number(row.discountAmount || 0).toFixed(2)}` },
    { name: 'Receivable', selector: (row) => Number(row.receivableAmount || 0), sortable: true, right: true, cell: (row) => `PKR ${Number(row.receivableAmount || 0).toFixed(2)}` },
    { name: 'Payment Method', selector: (row) => salePaymentMethodLabel(row), sortable: true, wrap: true },
    { name: 'Payment Status', selector: (row) => row.paymentStatus || '-', sortable: true, wrap: true },
    { name: 'Net', selector: (row) => Number(row.netAmount || 0), sortable: true, right: true, cell: (row) => `PKR ${Number(row.netAmount || 0).toFixed(2)}` },
    ...(isSuperAdmin ? [{
      name: 'Action',
      minWidth: '120px',
      cell: (row) => (
        <button
          onClick={() => deleteTransaction(row)}
          className="bg-red-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs"
        >
          Delete
        </button>
      ),
    }] : []),
  ]), [isSuperAdmin, siteId, dateFrom, dateTo]);

  const downloadCsv = (sourceRows = entries, suffix = 'all') => {
    const headers = ['Date & Time', 'Type', 'Customer Name', 'WhatsApp', 'Email', 'Product', 'Qty', 'Gross', 'Price Increase', 'Discount', 'Receivable', 'Payment Method', 'Payment Status', 'Net'];
    const rows = sourceRows.map((e) => [
      `"${new Date(e.createdAt || e.date).toLocaleString().replace(/"/g, '""')}"`,
      `"${String(saleTypeLabel(e.entryType)).replace(/"/g, '""')}"`,
      `"${String(e.customerName || '-').replace(/"/g, '""')}"`,
      `"${String(e.customerWhatsapp || '-').replace(/"/g, '""')}"`,
      `"${String(e.customerEmail || '-').replace(/"/g, '""')}"`,
      `"${String(e.productName || '').replace(/"/g, '""')}"`,
      `"${String(e.quantity || 0)}"`,
      `"${Number(e.grossAmount || 0).toFixed(2)}"`,
      `"${Number(e.priceIncreaseAmount || 0).toFixed(2)}"`,
      `"${Number(e.discountAmount || 0).toFixed(2)}"`,
      `"${Number(e.receivableAmount || 0).toFixed(2)}"`,
      `"${String(salePaymentMethodLabel(e)).replace(/"/g, '""')}"`,
      `"${String(e.paymentStatus || '-').replace(/"/g, '""')}"`,
      `"${Number(e.netAmount || 0).toFixed(2)}"`,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sale_transactions_${dateFrom || 'from'}_${dateTo || 'to'}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const filteredTransactions = useMemo(() => {
    const q = transactionSearch.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      String(saleTypeLabel(e.entryType)).toLowerCase().includes(q) ||
      String(e.customerName || '').toLowerCase().includes(q) ||
      String(e.customerWhatsapp || '').toLowerCase().includes(q) ||
      String(e.customerEmail || '').toLowerCase().includes(q) ||
      String(e.productName || '').toLowerCase().includes(q) ||
      String(salePaymentMethodLabel(e)).toLowerCase().includes(q)
    );
  }, [entries, transactionSearch]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Sale Point</h2>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Sales Site</label>
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); }} className="w-full border p-2 rounded">
            <option value="">Select Sale Point / Warehouse</option>
            {sites.map((s) => <option key={s._id} value={s._id}>{s.label || s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Entry Date</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full border p-2 rounded" />
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border p-2 rounded">
            <option value="">Select Product</option>
            {stock.map((p) => <option key={p._id} value={p._id}>{p.name} (Stock: {p.quantity || 0})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Quantity</label>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border p-2 rounded" placeholder="Enter quantity" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Discount</label>
          <input type="number" min={0} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={isGiftItem} className="w-full border p-2 rounded disabled:bg-gray-100" placeholder="Discount amount" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Price Increase</label>
          <input type="number" min={0} value={priceIncreaseAmount} onChange={(e) => setPriceIncreaseAmount(e.target.value)} disabled={isGiftItem} className="w-full border p-2 rounded disabled:bg-gray-100" placeholder="Extra amount" />
        </div>
        <div className="flex items-center">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-green-800">
            <input
              type="checkbox"
              checked={isGiftItem}
              onChange={(e) => {
                setIsGiftItem(e.target.checked);
                if (e.target.checked) {
                  setIsPayLaterItem(false);
                  setDiscountAmount('');
                  setPriceIncreaseAmount('');
                }
              }}
            />
            Gift from Owners
          </label>
        </div>
        <div className="flex items-center">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
            <input
              type="checkbox"
              checked={isPayLaterItem}
              onChange={(e) => {
                setIsPayLaterItem(e.target.checked);
                if (e.target.checked) {
                  setIsGiftItem(false);
                  setGiftSourceId('');
                }
              }}
            />
            Pay Later
          </label>
        </div>
        <div className="flex items-end">
          <button onClick={addSaleItem} className="bg-blue-600 text-white px-4 py-2 rounded w-full">Add Item</button>
        </div>
        {isGiftItem && (
          <div className="md:col-span-6 bg-green-50 border border-green-200 rounded p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Gift Source / Family Member *</label>
              <select value={giftSourceId} onChange={(e) => setGiftSourceId(e.target.value)} className="w-full border p-2 rounded">
                <option value="">Select source</option>
                {giftSources.map((source) => <option key={source._id} value={source._id}>{source.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gift Recipient Name *</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border p-2 rounded" placeholder="Recipient name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gift Recipient Contact *</label>
              <input type="text" value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} className="w-full border p-2 rounded" placeholder="Contact / WhatsApp number" />
            </div>
          </div>
        )}
        {isPayLaterItem && (
          <div className="md:col-span-6 bg-amber-50 border border-amber-200 rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Friends/Family Customer Name *</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border p-2 rounded" placeholder="Customer name" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Customer Contact *</label>
              <input type="text" value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} className="w-full border p-2 rounded" placeholder="Contact / WhatsApp number" />
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-5">
        <div className="px-4 py-3 border-b font-semibold">Purchase Items</div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Product</th>
              <th className="border px-3 py-2">Qty</th>
              <th className="border px-3 py-2">Unit Price</th>
              <th className="border px-3 py-2">Price Increase</th>
              <th className="border px-3 py-2">Discount</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Line Total</th>
              <th className="border px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {saleItems.map((i, idx) => (
              <tr key={`${i.productId}-${idx}`}>
                <td className="border px-3 py-2">{i.productName}</td>
                <td className="border px-3 py-2">{i.quantity}</td>
                <td className="border px-3 py-2">PKR {i.unitPrice.toFixed(2)}</td>
                <td className="border px-3 py-2">PKR {Number(i.priceIncreaseAmount || 0).toFixed(2)}</td>
                <td className="border px-3 py-2">PKR {Number(i.discountAmount || 0).toFixed(2)}</td>
                <td className="border px-3 py-2">{i.isGift ? `Gift (${i.giftSourceName || '-'})` : i.isPayLater ? 'Pay Later' : 'Sale'}</td>
                <td className="border px-3 py-2">
                  PKR {(i.isGift || i.isPayLater ? 0 : Math.max(0, i.unitPrice * i.quantity + Number(i.priceIncreaseAmount || 0) - Number(i.discountAmount || 0))).toFixed(2)}
                </td>
                <td className="border px-3 py-2"><button onClick={() => setSaleItems((prev) => prev.filter((_, x) => x !== idx))} className="text-red-600 hover:underline">Remove</button></td>
              </tr>
            ))}
            {saleItems.length === 0 && <tr><td colSpan={8} className="border px-3 py-3 text-center text-gray-500">No items added.</td></tr>}
          </tbody>
        </table>
        <div className="p-4 text-sm">
          <div>Gross: <strong>PKR {saleTotals.gross.toFixed(2)}</strong></div>
          <div>Gift Value: <strong>PKR {saleTotals.giftValue.toFixed(2)}</strong></div>
          <div>Pay Later Receivable: <strong>PKR {saleTotals.payLaterValue.toFixed(2)}</strong></div>
          <div>Chargeable Gross: <strong>PKR {saleTotals.chargeableGross.toFixed(2)}</strong></div>
          <div>Price Increase: <strong>PKR {saleTotals.priceIncrease.toFixed(2)}</strong></div>
          <div>Discount: <strong>PKR {saleTotals.discount.toFixed(2)}</strong></div>
          <div>Net: <strong>PKR {saleTotals.net.toFixed(2)}</strong></div>
          {hasChargeableSaleItems && (
            <div className="mt-3 max-w-md">
              <label className="block text-sm font-medium mb-1">Payment Mode</label>
              <select
                value={selectedPaymentMethodId}
                onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                className="w-full border p-2 rounded"
              >
                <option value={CASH_PAYMENT_METHOD_ID}>{CASH_PAYMENT_METHOD_NAME}</option>
                {paymentMethods.map((method) => (
                  <option key={method._id} value={method._id}>{method.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer Name (optional)"
              className="border p-2 rounded"
            />
            <input
              type="text"
              value={customerWhatsapp}
              onChange={(e) => setCustomerWhatsapp(e.target.value)}
              placeholder="Customer WhatsApp (optional)"
              className="border p-2 rounded"
            />
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="Customer Email (optional)"
              className="border p-2 rounded"
            />
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button onClick={printReceipt} disabled={saleItems.length === 0} className="bg-slate-700 text-white px-4 py-2 rounded disabled:opacity-60">
              Print Receipt
            </button>
            <div className="flex flex-col gap-1">
              <button onClick={proceedPayment} disabled={!canManage || saleItems.length === 0} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">
                Proceed Payment
              </button>
              <label className="inline-flex items-center gap-2 text-xs text-green-700">
                <input
                  type="checkbox"
                  checked={sendWhatsAppOnSale}
                  onChange={(e) => setSendWhatsAppOnSale(e.target.checked)}
                />
                Send WhatsApp thank-you
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-5">
        <div className="px-4 py-3 border-b font-semibold">Available Stock</div>
        <table className="min-w-full text-sm">
          <thead><tr><th className="border px-3 py-2">Product</th><th className="border px-3 py-2">Price</th><th className="border px-3 py-2">Quantity</th></tr></thead>
          <tbody>
            {stock.map((p) => <tr key={p._id}><td className="border px-3 py-2">{p.name}</td><td className="border px-3 py-2">PKR {p.price}</td><td className="border px-3 py-2">{p.quantity || 0}</td></tr>)}
            {stock.length === 0 && <tr><td colSpan={3} className="border px-3 py-3 text-center text-gray-500">No stock found for selected site.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Return Product</label>
          <select value={returnProductId} onChange={(e) => setReturnProductId(e.target.value)} className="w-full border p-2 rounded">
            <option value="">Select Product</option>
            {stock.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Return Qty</label>
          <input type="number" min={1} value={returnQuantity} onChange={(e) => setReturnQuantity(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Return Amount</label>
          <input type="number" min={0} value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="flex items-end">
          <button onClick={addReturnItem} className="bg-yellow-600 text-white px-4 py-2 rounded w-full">Add Return</button>
        </div>
        <div className="md:col-span-4 overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            <input
              type="text"
              value={returnCustomerName}
              onChange={(e) => setReturnCustomerName(e.target.value)}
              placeholder="Customer Name (optional)"
              className="border p-2 rounded"
            />
            <input
              type="text"
              value={returnCustomerWhatsapp}
              onChange={(e) => setReturnCustomerWhatsapp(e.target.value)}
              placeholder="Customer WhatsApp (optional)"
              className="border p-2 rounded"
            />
            <input
              type="email"
              value={returnCustomerEmail}
              onChange={(e) => setReturnCustomerEmail(e.target.value)}
              placeholder="Customer Email (optional)"
              className="border p-2 rounded"
            />
          </div>
          <table className="min-w-full text-sm">
            <thead><tr><th className="border px-3 py-2">Product</th><th className="border px-3 py-2">Qty</th><th className="border px-3 py-2">Amount</th><th className="border px-3 py-2">Action</th></tr></thead>
            <tbody>
              {returnItems.map((i, idx) => <tr key={`${i.productId}-${idx}`}><td className="border px-3 py-2">{i.productName}</td><td className="border px-3 py-2">{i.quantity}</td><td className="border px-3 py-2">PKR {Number(i.returnAmount || 0).toFixed(2)}</td><td className="border px-3 py-2"><button onClick={() => setReturnItems((prev) => prev.filter((_, x) => x !== idx))} className="text-red-600 hover:underline">Remove</button></td></tr>)}
              {returnItems.length === 0 && <tr><td colSpan={4} className="border px-3 py-3 text-center text-gray-500">No return items added.</td></tr>}
            </tbody>
          </table>
          <button onClick={submitReturn} disabled={!canManage || returnItems.length === 0} className="mt-3 bg-red-600 text-white px-4 py-2 rounded disabled:opacity-60">Submit Return</button>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mt-5 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">From Date</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To Date</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div className="flex items-end">
          <button onClick={() => loadEntries(siteId, dateFrom, dateTo)} className="bg-blue-600 text-white px-4 py-2 rounded w-full">
            Apply Range
          </button>
        </div>
        <div className="flex items-end">
          <button onClick={() => downloadCsv(entries, 'all')} className="bg-green-600 text-white px-4 py-2 rounded w-full">
            Download CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mt-2">
        <div className="px-4 py-3 border-b font-semibold">Sale Transactions ({dateFrom} to {dateTo})</div>
        <DataTable
          columns={transactionColumns}
          data={filteredTransactions}
          pagination
          highlightOnHover
          striped
          dense
          subHeader
          subHeaderComponent={(
            <div className="w-full flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <input
                type="text"
                value={transactionSearch}
                onChange={(e) => setTransactionSearch(e.target.value)}
                placeholder="Search transactions..."
                className="border rounded px-3 py-2 text-sm w-full md:max-w-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(filteredTransactions, 'visible')} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Download Visible</button>
                <button onClick={() => downloadCsv(entries, 'all')} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Download All</button>
              </div>
            </div>
          )}
          noDataComponent="No sale/return entries found for selected date/site."
        />
        <div className="border-t px-4 py-3 text-right font-semibold">
          Net Amount: <span className="font-bold">PKR {transactionNet.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default SalePoint;
