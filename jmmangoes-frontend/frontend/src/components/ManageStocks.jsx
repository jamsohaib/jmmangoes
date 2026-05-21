import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const ManageStocks = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.manageStocks?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.manageStocks?.manage;
  const [summary, setSummary] = useState([]);
  const [products, setProducts] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantityChange, setQuantityChange] = useState('');
  const [operation, setOperation] = useState('add');
  const [adjustments, setAdjustments] = useState([]);

  const loadData = async () => {
    const [summaryRes, productsRes, adjustmentsRes] = await Promise.all([
      api.get('/stocks/summary'),
      api.get('/stocks/products'),
      api.get('/stocks/adjustments'),
    ]);
    const summaryData = summaryRes.data || [];
    setSummary(summaryData);
    setProducts(productsRes.data || []);
    setSites(summaryData.map((s) => ({ _id: s.siteId, name: s.siteName, isActive: true })));
    setAdjustments(adjustmentsRes.data || []);
  };

  useEffect(() => {
    if (canView) loadData().catch(console.error);
  }, [canView]);

  const productOptions = useMemo(
    () => {
      if (!selectedSiteId) return [];
      return products
        .filter(
          (p) =>
            String(p.availableSiteId || '') === String(selectedSiteId) ||
            (p.availableSiteName || '').toLowerCase() ===
              (sites.find((s) => s._id === selectedSiteId)?.name || '').toLowerCase()
        )
        .map((p) => {
        const siteName = p.availableSiteName || sites.find((s) => s._id === p.availableSiteId)?.name || 'Unknown';
        return { id: p._id, label: `${p.name} (${siteName})`, qty: p.quantity || 0 };
      });
    },
    [products, sites, selectedSiteId]
  );

  const productsBySite = useMemo(() => {
    const grouped = {};
    sites.forEach((site) => {
      grouped[site._id] = products.filter(
        (p) =>
          String(p.availableSiteId || '') === String(site._id) ||
          (p.availableSiteName || '').toLowerCase() === site.name.toLowerCase()
      );
    });
    return grouped;
  }, [products, sites]);

  const handleAdjustStock = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    const qty = Number(quantityChange);
    if (!selectedProductId || Number.isNaN(qty) || qty <= 0) {
      toast.warn('Select product and enter valid quantity.');
      return;
    }
    const signedQty = operation === 'remove' ? -qty : qty;
    const selectedProductLabel = productOptions.find((p) => p.id === selectedProductId)?.label || 'selected product';
    const confirmed = window.confirm(
      `Confirm stock ${operation}?\nProduct: ${selectedProductLabel}\nQuantity: ${qty}`
    );
    if (!confirmed) return;
    try {
      await api.post('/stocks/adjust', { productId: selectedProductId, quantityChange: signedQty });
      toast.success('Stock updated.');
      setSelectedSiteId('');
      setSelectedProductId('');
      setQuantityChange('');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update stock.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Stocks</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {summary.map((s) => (
          <div key={s.siteId} className="bg-white rounded shadow p-4">
            <div className="font-semibold">{s.siteName}</div>
            <div className="text-sm text-gray-600">Products: {s.productsCount}</div>
            <div className="text-lg font-bold text-green-700">Total Stock: {s.totalStock}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-lg font-semibold mb-3">Add / Remove Stock</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setSelectedProductId(''); }} className="border p-2 rounded">
            <option value="">Select Site</option>
            {sites.filter((s) => s.isActive).map((site) => (
              <option key={site._id} value={site._id}>{site.name}</option>
            ))}
          </select>
          <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="border p-2 rounded">
            <option value="">Select Product</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label} - Current: {p.qty}</option>
            ))}
          </select>
          <select value={operation} onChange={(e) => setOperation(e.target.value)} className="border p-2 rounded">
            <option value="add">Add</option>
            <option value="remove">Remove</option>
          </select>
          <input type="number" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} placeholder="Quantity" className="border p-2 rounded" />
          <button onClick={handleAdjustStock} className="bg-green-600 text-white rounded px-3 py-2">Update Stock</button>
        </div>
      </div>

      {sites
        .filter((s) => s.isActive)
        .map((site) => {
          const siteProducts = productsBySite[site._id] || [];
          const siteSummary = summary.find((s) => String(s.siteId) === String(site._id));
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
                    <tr key={p._id}>
                      <td className="border px-3 py-2">{p.name}</td>
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

      <div className="overflow-x-auto bg-white rounded shadow mt-6">
        <div className="px-4 py-3 border-b bg-gray-50 font-semibold">Stock Update Transaction History</div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Date</th>
              <th className="border px-3 py-2">Site</th>
              <th className="border px-3 py-2">Product</th>
              <th className="border px-3 py-2">Action</th>
              <th className="border px-3 py-2">Qty</th>
              <th className="border px-3 py-2">Before</th>
              <th className="border px-3 py-2">After</th>
              <th className="border px-3 py-2">Updated By</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a) => (
              <tr key={a._id}>
                <td className="border px-3 py-2">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="border px-3 py-2">{a.siteName}</td>
                <td className="border px-3 py-2">{a.productName}</td>
                <td className="border px-3 py-2 capitalize">{a.adjustmentType}</td>
                <td className="border px-3 py-2">{a.quantityChange}</td>
                <td className="border px-3 py-2">{a.quantityBefore}</td>
                <td className="border px-3 py-2">{a.quantityAfter}</td>
                <td className="border px-3 py-2">{a.updatedByName || '-'}</td>
              </tr>
            ))}
            {adjustments.length === 0 && (
              <tr>
                <td colSpan={8} className="border px-3 py-3 text-center text-gray-500">
                  No stock update transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManageStocks;
