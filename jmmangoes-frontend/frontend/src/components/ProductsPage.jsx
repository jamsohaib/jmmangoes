import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyMasterForm = {
  name: '',
  description: '',
  weight: '',
  imageUrl: '',
  category: '',
};

const ProductsPage = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.productsPage?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.productsPage?.manage;

  const [products, setProducts] = useState([]);
  const [sites, setSites] = useState([]);
  const [masterForm, setMasterForm] = useState(emptyMasterForm);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [assignForm, setAssignForm] = useState({
    productId: '',
    siteId: '',
    price: '',
    isAvailableForCart: true,
  });
  const [bulkAssignForm, setBulkAssignForm] = useState({
    productId: '',
    siteIds: [],
    price: '',
    isAvailableForCart: true,
  });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(emptyMasterForm);
  const [editImageFile, setEditImageFile] = useState(null);

  const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  const activeSites = useMemo(() => (sites || []).filter((s) => s.isActive), [sites]);

  const loadData = async () => {
    const [productsRes, sitesRes] = await Promise.all([api.get('/getProducts'), api.get('/products/sites')]);
    setProducts(productsRes.data || []);
    setSites(sitesRes.data || []);
  };

  useEffect(() => {
    if (canView) loadData().catch(() => toast.error('Failed to load products'));
  }, [canView]);

  const uploadImageIfNeeded = async (file, fallbackUrl) => {
    if (!file) return fallbackUrl;
    const fd = new FormData();
    fd.append('image', file);
    const uploadRes = await api.post('/upload-product-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return `${BACKEND_ORIGIN}${uploadRes.data.imageUrl}`;
  };

  const handleCreateMasterProduct = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      const imageUrl = await uploadImageIfNeeded(selectedImageFile, masterForm.imageUrl);
      const payload = {
        name: masterForm.name,
        description: masterForm.description,
        weight: Number(masterForm.weight || 0),
        imageUrl,
        category: masterForm.category,
        price: 0,
        productChannel: 'store',
        locationPrices: [],
      };
      await api.post('/addproducts', payload);
      toast.success('Product item created.');
      setMasterForm(emptyMasterForm);
      setSelectedImageFile(null);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create product item.');
    }
  };

  const handleAssignToStore = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!assignForm.productId || !assignForm.siteId) return toast.warn('Select product and store.');
    const site = sites.find((s) => String(s._id) === String(assignForm.siteId));
    const priceNum = Number(assignForm.price);
    if (!site || Number.isNaN(priceNum) || priceNum < 0) return toast.warn('Enter valid price.');
    try {
      await api.post(`/products/${assignForm.productId}/location-price`, {
        siteId: site._id,
        siteName: site.name,
        price: priceNum,
      });
      await api.put(`/products/${assignForm.productId}/toggle-availability`, {
        isAvailableForCart: !!assignForm.isAvailableForCart,
      });
      toast.success('Product assigned to store with price.');
      setAssignForm((prev) => ({ ...prev, price: '' }));
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to assign product.');
    }
  };

  const toggleBulkSite = (siteId) => {
    setBulkAssignForm((prev) => ({
      ...prev,
      siteIds: prev.siteIds.includes(siteId)
        ? prev.siteIds.filter((id) => id !== siteId)
        : [...prev.siteIds, siteId],
    }));
  };

  const handleBulkAssignToStores = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    if (!bulkAssignForm.productId || !bulkAssignForm.siteIds.length) return toast.warn('Select product and at least one store.');
    const priceNum = Number(bulkAssignForm.price);
    if (Number.isNaN(priceNum) || priceNum < 0) return toast.warn('Enter valid price.');
    try {
      for (const siteId of bulkAssignForm.siteIds) {
        const site = sites.find((s) => String(s._id) === String(siteId));
        if (!site) continue;
        await api.post(`/products/${bulkAssignForm.productId}/location-price`, {
          siteId: site._id,
          siteName: site.name,
          price: priceNum,
        });
      }
      await api.put(`/products/${bulkAssignForm.productId}/toggle-availability`, {
        isAvailableForCart: !!bulkAssignForm.isAvailableForCart,
      });
      toast.success(`Assigned product to ${bulkAssignForm.siteIds.length} stores.`);
      setBulkAssignForm((prev) => ({ ...prev, siteIds: [], price: '' }));
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed bulk assignment.');
    }
  };

  const handleRemoveStoreAssignment = async (productId, siteId) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Remove this store assignment?')) return;
    try {
      await api.post(`/products/${productId}/remove-location-price`, { siteId });
      toast.success('Store assignment removed.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove assignment.');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this product item completely?')) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted.');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete product.');
    }
  };

  const handleToggleProductActive = async (id, isActive) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/products/${id}/toggle-active`, { isActive: !isActive });
      await loadData();
      toast.success(isActive ? 'Product disabled.' : 'Product enabled.');
    } catch {
      toast.error('Failed to update product status.');
    }
  };

  const handleToggleAvailability = async (id, isAvailable) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/products/${id}/toggle-availability`, { isAvailableForCart: !isAvailable });
      await loadData();
      toast.success(isAvailable ? 'Marked unavailable.' : 'Marked available.');
    } catch {
      toast.error('Failed to update availability.');
    }
  };

  const openEditModal = (product) => {
    if (!canManage) return;
    setEditId(product._id);
    setEditForm({
      name: product.name || '',
      description: product.description || '',
      weight: product.weight || '',
      imageUrl: product.imageUrl || '',
      category: product.category || '',
    });
    setEditImageFile(null);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!canManage) return;
    try {
      const imageUrl = await uploadImageIfNeeded(editImageFile, editForm.imageUrl);
      await api.put(`/products/${editId}`, {
        name: editForm.name,
        description: editForm.description,
        weight: Number(editForm.weight || 0),
        imageUrl,
        category: editForm.category,
      });
      setEditModalOpen(false);
      await loadData();
      toast.success('Product updated.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update product.');
    }
  };

  const assignedRows = useMemo(() => {
    const rows = [];
    products.forEach((p) => {
      const fromLocationPrices = Array.isArray(p.locationPrices) ? p.locationPrices : [];
      if (fromLocationPrices.length) {
        fromLocationPrices.forEach((lp) => {
          rows.push({
            productId: p._id,
            productName: p.name,
            siteId: lp.siteId,
            siteName: lp.siteName,
            price: lp.price,
            isActive: p.isActive !== false,
            isAvailableForCart: p.isAvailableForCart !== false,
          });
        });
        return;
      }
    });
    return rows.sort((a, b) => String(a.siteName).localeCompare(String(b.siteName)) || String(a.productName).localeCompare(String(b.productName)));
  }, [products]);

  const assignedRowsByStore = useMemo(() => {
    const grouped = {};
    assignedRows.forEach((row) => {
      const key = row.siteName || 'Unassigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    return grouped;
  }, [assignedRows]);

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Products</h2>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-xl font-semibold mb-3">Step 1: Create Farm Product Item</h3>
        <form onSubmit={handleCreateMasterProduct} className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input type="text" placeholder="Product Name" value={masterForm.name} onChange={(e) => setMasterForm((p) => ({ ...p, name: e.target.value }))} required className="border p-2 rounded" />
          <input type="number" placeholder="Weight (kg)" value={masterForm.weight} onChange={(e) => setMasterForm((p) => ({ ...p, weight: e.target.value }))} className="border p-2 rounded" />
          <input type="text" placeholder="Description" value={masterForm.description} onChange={(e) => setMasterForm((p) => ({ ...p, description: e.target.value }))} className="border p-2 rounded md:col-span-2" />
          <input type="text" placeholder="Category" value={masterForm.category} onChange={(e) => setMasterForm((p) => ({ ...p, category: e.target.value }))} className="border p-2 rounded" />
          <input type="file" accept="image/*" onChange={(e) => setSelectedImageFile(e.target.files?.[0] || null)} className="border p-2 rounded bg-white" />
          <button type="submit" disabled={!canManage} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">Create Product Item</button>
        </form>
      </div>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-xl font-semibold mb-3">Step 2: Add Product to Store / Site</h3>
        <form onSubmit={handleAssignToStore} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select value={assignForm.productId} onChange={(e) => setAssignForm((p) => ({ ...p, productId: e.target.value }))} className="border p-2 rounded" required>
            <option value="">Select Product Item</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select value={assignForm.siteId} onChange={(e) => setAssignForm((p) => ({ ...p, siteId: e.target.value }))} className="border p-2 rounded" required>
            <option value="">Select Store / Site</option>
            {activeSites.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <input type="number" placeholder="Store Price" value={assignForm.price} onChange={(e) => setAssignForm((p) => ({ ...p, price: e.target.value }))} className="border p-2 rounded" required />
          <label className="inline-flex items-center gap-2 border p-2 rounded">
            <input type="checkbox" checked={!!assignForm.isAvailableForCart} onChange={(e) => setAssignForm((p) => ({ ...p, isAvailableForCart: e.target.checked }))} />
            Available
          </label>
          <button type="submit" disabled={!canManage} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60">Add To Store</button>
        </form>
      </div>

      <div className="bg-white rounded shadow p-4 mb-6">
        <h3 className="text-xl font-semibold mb-3">Step 2B: Bulk Assign Same Price to Multiple Stores</h3>
        <form onSubmit={handleBulkAssignToStores} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={bulkAssignForm.productId} onChange={(e) => setBulkAssignForm((p) => ({ ...p, productId: e.target.value }))} className="border p-2 rounded" required>
            <option value="">Select Product Item</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="Common Price" value={bulkAssignForm.price} onChange={(e) => setBulkAssignForm((p) => ({ ...p, price: e.target.value }))} className="border p-2 rounded" required />
          <label className="inline-flex items-center gap-2 border p-2 rounded md:col-span-2">
            <input type="checkbox" checked={!!bulkAssignForm.isAvailableForCart} onChange={(e) => setBulkAssignForm((p) => ({ ...p, isAvailableForCart: e.target.checked }))} />
            Mark product available after bulk assignment
          </label>
          <div className="md:col-span-2 border rounded p-3">
            <p className="font-medium mb-2">Select Stores/Sites</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {activeSites.map((s) => (
                <label key={s._id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={bulkAssignForm.siteIds.includes(s._id)} onChange={() => toggleBulkSite(s._id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={!canManage} className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-60">Bulk Assign</button>
        </form>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-3">Store Assignments (Store Wise)</h3>
        {Object.keys(assignedRowsByStore).length === 0 ? (
          <div className="bg-white rounded shadow p-4 text-gray-500">No store assignments yet.</div>
        ) : (
          Object.entries(assignedRowsByStore).map(([storeName, rows]) => (
            <div key={storeName} className="overflow-x-auto bg-white rounded shadow mb-4">
              <div className="px-4 py-3 border-b font-semibold">{storeName}</div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-3 py-2">Product</th>
                    <th className="border px-3 py-2">Price</th>
                    <th className="border px-3 py-2">Status</th>
                    <th className="border px-3 py-2">Availability</th>
                    <th className="border px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={`${r.productId}-${r.siteId || storeName}-${idx}`}>
                      <td className="border px-3 py-2">{r.productName}</td>
                      <td className="border px-3 py-2">PKR {Number(r.price || 0)}</td>
                      <td className="border px-3 py-2">{r.isActive ? 'Active' : 'Disabled'}</td>
                      <td className="border px-3 py-2">{r.isAvailableForCart ? 'Available' : 'Unavailable'}</td>
                      <td className="border px-3 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <button className="text-blue-600 hover:underline" onClick={() => openEditModal(products.find((p) => p._id === r.productId))}>Edit Item</button>
                          <button className="text-yellow-700 hover:underline" onClick={() => handleToggleProductActive(r.productId, r.isActive)}>{r.isActive ? 'Disable' : 'Enable'}</button>
                          <button className="text-orange-700 hover:underline" onClick={() => handleToggleAvailability(r.productId, r.isAvailableForCart)}>{r.isAvailableForCart ? 'Mark Unavailable' : 'Mark Available'}</button>
                          {r.siteId ? <button className="text-red-600 hover:underline" onClick={() => handleRemoveStoreAssignment(r.productId, r.siteId)}>Remove From Store</button> : null}
                          <button className="text-red-700 hover:underline" onClick={() => handleDeleteProduct(r.productId)}>Delete Item</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <div className="px-4 py-3 border-b font-semibold">Farm Product Item List (Master)</div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Description</th>
              <th className="border px-3 py-2">Weight</th>
              <th className="border px-3 py-2">Category</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td className="border px-3 py-2">{p.name}</td>
                <td className="border px-3 py-2">{p.description || '-'}</td>
                <td className="border px-3 py-2">{p.weight || 0} kg</td>
                <td className="border px-3 py-2">{p.category || '-'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:underline" onClick={() => openEditModal(p)}>Edit</button>
                    <button className="text-red-600 hover:underline" onClick={() => handleDeleteProduct(p._id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow-lg w-full max-w-xl p-4">
            <h3 className="text-xl font-semibold mb-3">Edit Farm Product Item</h3>
            <div className="space-y-2">
              <input type="text" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} placeholder="Name" className="w-full p-2 border rounded" />
              <input type="text" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full p-2 border rounded" />
              <input type="number" value={editForm.weight} onChange={(e) => setEditForm((p) => ({ ...p, weight: e.target.value }))} placeholder="Weight (kg)" className="w-full p-2 border rounded" />
              <input type="text" value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" className="w-full p-2 border rounded" />
              <input type="file" accept="image/*" onChange={(e) => setEditImageFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded bg-white" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 rounded bg-green-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
