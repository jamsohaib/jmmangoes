import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyForm = {
  name: '',
  description: '',
  price: '',
  weight: '',
  imageUrl: '',
  category: '',
  productChannel: 'website',
  availableSiteId: '',
};

const ProductsPage = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.productsPage?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.productsPage?.manage;
  const [products, setProducts] = useState([]);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(emptyForm);
  const [editImageFile, setEditImageFile] = useState(null);
  const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

  const activeSites = useMemo(() => sites.filter((s) => s.isActive), [sites]);
  const websiteSites = useMemo(() => activeSites.filter((s) => s.name.toLowerCase() === 'online'), [activeSites]);
  const physicalSites = useMemo(() => activeSites.filter((s) => s.name.toLowerCase() !== 'online'), [activeSites]);

  const siteDisplayOrder = useMemo(() => {
    const online = activeSites.find((s) => s.name.toLowerCase() === 'online');
    const others = activeSites
      .filter((s) => s.name.toLowerCase() !== 'online')
      .sort((a, b) => a.name.localeCompare(b.name));
    return online ? [online, ...others] : others;
  }, [activeSites]);

  const productsBySite = useMemo(() => {
    const grouped = {};
    siteDisplayOrder.forEach((site) => {
      grouped[site._id] = products.filter((p) => {
        if (p.availableSiteId && String(p.availableSiteId) === String(site._id)) return true;
        return (p.availableSiteName || '').toLowerCase() === site.name.toLowerCase();
      });
    });
    return grouped;
  }, [products, siteDisplayOrder]);

  const loadData = async () => {
    const [productsRes, sitesRes] = await Promise.all([api.get('/getProducts'), api.get('/products/sites')]);
    setProducts(productsRes.data || []);
    const loadedSites = sitesRes.data || [];
    setSites(loadedSites);
    setForm((prev) => {
      if (prev.availableSiteId) return prev;
      const online = loadedSites.find((s) => s.name.toLowerCase() === 'online');
      return { ...prev, availableSiteId: online?._id || '' };
    });
  };

  useEffect(() => {
    if (canView) loadData().catch(console.error);
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

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    try {
      const onlineSite = sites.find((s) => s.name.toLowerCase() === 'online');
      const imageUrl = await uploadImageIfNeeded(selectedImageFile, form.imageUrl);
      const payload = {
        ...form,
        price: Number(form.price),
        weight: Number(form.weight || 0),
        imageUrl,
        productChannel: form.productChannel,
        availableSiteId: form.availableSiteId || null,
        availableSiteName: sites.find((s) => s._id === form.availableSiteId)?.name || '',
        locationPrices:
          form.productChannel === 'website' && onlineSite
            ? [{ siteId: onlineSite._id, siteName: onlineSite.name, price: Number(form.price) }]
            : [],
      };
      await api.post('/addproducts', payload);
      toast.success('Product added successfully.');
      setForm(emptyForm);
      setSelectedImageFile(null);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add product.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted.');
      await loadData();
    } catch {
      toast.error('Failed to delete product.');
    }
  };

  const handleToggle = async (id, isActive) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/products/${id}/toggle-active`, { isActive: !isActive });
      toast.success(isActive ? 'Product disabled.' : 'Product enabled.');
      await loadData();
    } catch {
      toast.error('Failed to update product status.');
    }
  };

  const handleToggleAvailability = async (id, isAvailableForCart) => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.put(`/products/${id}/toggle-availability`, { isAvailableForCart: !isAvailableForCart });
      toast.success(isAvailableForCart ? 'Product marked unavailable.' : 'Product marked available.');
      await loadData();
    } catch {
      toast.error('Failed to update product availability.');
    }
  };

  const openEditModal = (product) => {
    if (!canManage) return toast.warn('No manage permission.');
    setEditId(product._id);
    setEditForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price || '',
      weight: product.weight || '',
      imageUrl: product.imageUrl || '',
      category: product.category || '',
      productChannel: product.productChannel || 'website',
      availableSiteId: product.availableSiteId || '',
    });
    setEditImageFile(null);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      const imageUrl = await uploadImageIfNeeded(editImageFile, editForm.imageUrl);
      const payload = {
        ...editForm,
        price: Number(editForm.price),
        weight: Number(editForm.weight || 0),
        imageUrl,
        availableSiteName: sites.find((s) => s._id === editForm.availableSiteId)?.name || '',
      };
      await api.put(`/products/${editId}`, payload);
      toast.success('Product updated.');
      setEditModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update product.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Products</h2>

      {siteDisplayOrder.map((site) => (
        <div key={site._id} className="mb-6">
          <h3 className="text-xl font-semibold mb-2">{site.name.toLowerCase() === 'online' ? 'Online' : site.name}</h3>
          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="min-w-full text-sm md:text-base">
              <thead>
                <tr>
                  <th className="border px-3 py-2">Name</th>
                  <th className="border px-3 py-2">Price</th>
                  <th className="border px-3 py-2">Status</th>
                  <th className="border px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(productsBySite[site._id] || []).map((product) => (
                  <tr key={product._id}>
                    <td className="border px-3 py-2">{product.name}</td>
                    <td className="border px-3 py-2">PKR {product.price}</td>
                    <td className="border px-3 py-2">{product.isActive ? 'Active' : 'Disabled'}</td>
                    <td className="border px-3 py-2">
                      <div className="flex flex-wrap gap-3">
                        <button onClick={() => openEditModal(product)} className="text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete(product._id)} className="text-red-600 hover:underline">Delete</button>
                        <button onClick={() => handleToggle(product._id, product.isActive)} className="text-yellow-700 hover:underline">
                          {product.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => handleToggleAvailability(product._id, product.isAvailableForCart !== false)} className="text-orange-700 hover:underline">
                          {product.isAvailableForCart === false ? 'Mark Available' : 'Mark Unavailable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(productsBySite[site._id] || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="border px-3 py-3 text-center text-gray-500">No products for this site.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h2 className="text-2xl font-bold my-4">Add Product</h2>
      <form onSubmit={handleAddProduct} className="space-y-3 bg-white rounded shadow p-4">
        <div>
          <label className="font-semibold block mb-1">Product Availability</label>
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="productChannel"
                value="website"
                checked={form.productChannel === 'website'}
                onChange={(e) => {
                  const online = sites.find((s) => s.name.toLowerCase() === 'online');
                  setForm((prev) => ({ ...prev, productChannel: e.target.value, availableSiteId: online?._id || '' }));
                }}
              />
              Website
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="productChannel"
                value="store"
                checked={form.productChannel === 'store'}
                onChange={(e) => {
                  const firstPhysical = physicalSites[0];
                  setForm((prev) => ({ ...prev, productChannel: e.target.value, availableSiteId: firstPhysical?._id || '' }));
                }}
              />
              Store
            </label>
          </div>
        </div>
        <select
          value={form.availableSiteId}
          onChange={(e) => setForm({ ...form, availableSiteId: e.target.value })}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select Site</option>
          {(form.productChannel === 'website' ? websiteSites : physicalSites).map((site) => (
            <option key={site._id} value={site._id}>{site.name}</option>
          ))}
        </select>
        <input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full p-2 border rounded" />
        <input type="text" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full p-2 border rounded" />
        <input type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required className="w-full p-2 border rounded" />
        <input type="number" placeholder="Weight (kg)" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="w-full p-2 border rounded" />
        <div>
          <label className="block mb-1 font-medium">Product Image</label>
          <input type="file" accept="image/*" onChange={(e) => setSelectedImageFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded bg-white" />
        </div>
        <input type="text" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full p-2 border rounded" />
        <button type="submit" disabled={!canManage} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">Add Product</button>
      </form>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow-lg w-full max-w-2xl p-4 max-h-[90vh] overflow-auto">
            <h3 className="text-xl font-semibold mb-3">Edit Product</h3>
            <div className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Product Availability</label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="editProductChannel"
                      value="website"
                      checked={editForm.productChannel === 'website'}
                      onChange={(e) => {
                        const online = sites.find((s) => s.name.toLowerCase() === 'online');
                        setEditForm((prev) => ({ ...prev, productChannel: e.target.value, availableSiteId: online?._id || '' }));
                      }}
                    />
                    Website
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="editProductChannel"
                      value="store"
                      checked={editForm.productChannel === 'store'}
                      onChange={(e) => {
                        const firstPhysical = physicalSites[0];
                        setEditForm((prev) => ({ ...prev, productChannel: e.target.value, availableSiteId: firstPhysical?._id || '' }));
                      }}
                    />
                    Store
                  </label>
                </div>
              </div>
              <select
                value={editForm.availableSiteId}
                onChange={(e) => setEditForm({ ...editForm, availableSiteId: e.target.value })}
                className="w-full p-2 border rounded"
                required
              >
                <option value="">Select Site</option>
                {(editForm.productChannel === 'website' ? websiteSites : physicalSites).map((site) => (
                  <option key={site._id} value={site._id}>{site.name}</option>
                ))}
              </select>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className="w-full p-2 border rounded" />
              <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" className="w-full p-2 border rounded" />
              <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} placeholder="Price" className="w-full p-2 border rounded" />
              <input type="number" value={editForm.weight} onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })} placeholder="Weight (kg)" className="w-full p-2 border rounded" />
              <input type="text" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} placeholder="Category" className="w-full p-2 border rounded" />
              <div>
                <label className="block mb-1 font-medium">Change Product Image</label>
                <input type="file" accept="image/*" onChange={(e) => setEditImageFile(e.target.files?.[0] || null)} className="w-full p-2 border rounded bg-white" />
              </div>
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
