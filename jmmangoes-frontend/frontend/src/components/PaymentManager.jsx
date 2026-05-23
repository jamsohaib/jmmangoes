import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { toPublicAssetUrl } from '../lib/api';
import useAuthStore from '../store/authStore';

const emptyForm = {
  name: '',
  code: '',
  requiresReceipt: false,
  allowReceiptUpload: false,
  discountType: 'none',
  discountValue: '',
  chargeType: 'none',
  chargeValue: '',
  qrImageUrl: '',
  methodImageUrl: '',
  details: '',
  isCashOnDelivery: false,
  isActive: true,
};

const PaymentManager = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.paymentManager?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.paymentManager?.manage;
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const res = await api.get('/payment-methods');
    setRows(res.data || []);
  };

  useEffect(() => {
    if (canView) load().catch(console.error);
  }, [canView]);

  const uploadImage = async (file, key) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post('/upload-payment-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((p) => ({ ...p, [key]: res.data?.imageUrl || '' }));
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    const payload = {
      ...form,
      discountValue: Number(form.discountValue || 0),
      chargeValue: Number(form.chargeValue || 0),
    };
    try {
      if (editingId) {
        await api.put(`/payment-methods/${editingId}`, payload);
        toast.success('Payment method updated.');
      } else {
        await api.post('/payment-methods', payload);
        toast.success('Payment method created.');
      }
      setForm(emptyForm);
      setEditingId('');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save payment method.');
    }
  };

  const onEdit = (row) => {
    setEditingId(row._id);
    setForm({
      name: row.name || '',
      code: row.code || '',
      requiresReceipt: !!row.requiresReceipt,
      allowReceiptUpload: !!row.allowReceiptUpload,
      discountType: row.discountType || 'none',
      discountValue: String(row.discountValue || 0),
      chargeType: row.chargeType || 'none',
      chargeValue: String(row.chargeValue || 0),
      qrImageUrl: row.qrImageUrl || '',
      methodImageUrl: row.methodImageUrl || '',
      details: row.details || '',
      isCashOnDelivery: !!row.isCashOnDelivery,
      isActive: row.isActive !== false,
    });
  };

  const onDelete = async (id) => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!window.confirm('Delete this payment method?')) return;
    try {
      await api.delete(`/payment-methods/${id}`);
      toast.success('Payment method deleted.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete payment method.');
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Payment Manager</h2>

      <form onSubmit={submit} className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="border p-2 rounded" placeholder="Payment method name" required />
        <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} className="border p-2 rounded" placeholder="Code (optional, auto from name)" />
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCashOnDelivery} onChange={(e) => setForm((p) => ({ ...p, isCashOnDelivery: e.target.checked }))} /> Is Cash On Delivery</label>

        <label className="flex items-center gap-2"><input type="checkbox" checked={form.requiresReceipt} onChange={(e) => setForm((p) => ({ ...p, requiresReceipt: e.target.checked }))} /> Requires receipt upload</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowReceiptUpload} onChange={(e) => setForm((p) => ({ ...p, allowReceiptUpload: e.target.checked }))} /> Allow receipt upload</label>
        <div />

        <select value={form.discountType} onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))} className="border p-2 rounded">
          <option value="none">No Discount</option>
          <option value="fixed">Fixed Discount</option>
          <option value="percentage">Percentage Discount</option>
        </select>
        <input type="number" min={0} value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))} className="border p-2 rounded" placeholder="Discount value" />
        <div />

        <select value={form.chargeType} onChange={(e) => setForm((p) => ({ ...p, chargeType: e.target.value }))} className="border p-2 rounded">
          <option value="none">No Additional Charge</option>
          <option value="fixed">Fixed Charge</option>
          <option value="percentage">Percentage Charge</option>
        </select>
        <input type="number" min={0} value={form.chargeValue} onChange={(e) => setForm((p) => ({ ...p, chargeValue: e.target.value }))} className="border p-2 rounded" placeholder="Charge value" />
        <div />

        <div>
          <label className="block text-sm font-medium mb-1">QR Image</label>
          <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'qrImageUrl')} className="border p-2 rounded w-full" />
          {form.qrImageUrl && <a className="text-blue-700 text-sm" href={toPublicAssetUrl(form.qrImageUrl)} target="_blank" rel="noreferrer">View uploaded QR</a>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Payment Method Image</label>
          <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0], 'methodImageUrl')} className="border p-2 rounded w-full" />
          {form.methodImageUrl && <a className="text-blue-700 text-sm" href={toPublicAssetUrl(form.methodImageUrl)} target="_blank" rel="noreferrer">View uploaded image</a>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Details (optional)</label>
          <textarea
            value={form.details}
            onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))}
            className="border p-2 rounded w-full"
            rows={3}
            placeholder="Optional payment instructions/details shown on payment page"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={uploading} className="bg-green-600 text-white px-4 py-2 rounded w-full">{editingId ? 'Update Method' : 'Add Method'}</button>
        </div>
      </form>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Code</th>
              <th className="border px-3 py-2">Receipt</th>
              <th className="border px-3 py-2">COD</th>
              <th className="border px-3 py-2">Discount</th>
              <th className="border px-3 py-2">Charges</th>
              <th className="border px-3 py-2">Status</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="border px-3 py-2">{r.name}</td>
                <td className="border px-3 py-2">{r.code}</td>
                <td className="border px-3 py-2">{r.requiresReceipt ? 'Required' : (r.allowReceiptUpload ? 'Optional' : 'No')}</td>
                <td className="border px-3 py-2">{r.isCashOnDelivery ? 'Yes' : 'No'}</td>
                <td className="border px-3 py-2">{r.discountType} {Number(r.discountValue || 0)}</td>
                <td className="border px-3 py-2">{r.chargeType} {Number(r.chargeValue || 0)}</td>
                <td className="border px-3 py-2">{r.isActive ? 'Active' : 'Inactive'}</td>
                <td className="border px-3 py-2">
                  <div className="flex gap-3">
                    <button onClick={() => onEdit(r)} className="text-blue-700 hover:underline">Edit</button>
                    <button onClick={() => onDelete(r._id)} className="text-red-700 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="border px-3 py-3 text-center text-gray-500">No payment methods configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PaymentManager;
