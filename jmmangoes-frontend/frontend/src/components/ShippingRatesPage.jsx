import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import DEFAULT_CITIES from '../constants/defaultCities';

const ShippingRatesPage = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.shippingRates?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.shippingRates?.manage;
  const [zoneAUnitCost, setZoneAUnitCost] = useState('');
  const [cityOverrides, setCityOverrides] = useState([]);
  const [newCity, setNewCity] = useState('');
  const [newCityCost, setNewCityCost] = useState('');
  const [allowedCities, setAllowedCities] = useState([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState('');
  const [editingCost, setEditingCost] = useState('');

  const load = async () => {
    const res = await api.get('/shippingCosts');
    setZoneAUnitCost(res.data.zoneAUnitCost || '');
    setCityOverrides(res.data.cityOverrides || []);
    setAllowedCities(res.data.allowedCities?.length ? res.data.allowedCities : DEFAULT_CITIES);
  };

  useEffect(() => {
    if (canView) load().catch(console.error);
  }, [canView]);

  const handleAddCityOverride = () => {
    if (!canManage) return toast.warn('No manage permission.');
    if (!newCity || !newCityCost) {
      toast.warn('Please select city and enter custom rate.');
      return;
    }
    if (cityOverrides.some((el) => el.city.toLowerCase() === newCity.trim().toLowerCase())) {
      toast.warn('City override already exists.');
      return;
    }
    setCityOverrides((prev) => [...prev, { city: newCity.trim(), cost: Number(newCityCost) }]);
    setNewCity('');
    setNewCityCost('');
  };

  const handleSave = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      await api.post('/shippingCosts', {
        zoneAUnitCost: Number(zoneAUnitCost || 0),
        cityOverrides,
      });
      toast.success('Shipping rates saved.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save shipping rates.');
    }
  };

  const openEditModal = (override) => {
    if (!canManage) return toast.warn('No manage permission.');
    setEditingCity(override.city);
    setEditingCost(String(override.cost));
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!canManage) return toast.warn('No manage permission.');
    const parsed = Number(editingCost);
    if (!editingCity || Number.isNaN(parsed) || parsed < 0) {
      toast.warn('Please enter a valid rate.');
      return;
    }
    setCityOverrides((prev) =>
      prev.map((o) => (o.city === editingCity ? { ...o, cost: parsed } : o))
    );
    setEditModalOpen(false);
    setEditingCity('');
    setEditingCost('');
    toast.success('City override updated. Click Save Shipping Rates to persist.');
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Shipping Rates</h2>
      <div className="bg-white p-4 md:p-6 rounded shadow">
        <div className="mb-4">
          <label className="block mb-1">Zone A Unit Shipping Cost</label>
          <input
            type="number"
            value={zoneAUnitCost}
            onChange={(e) => setZoneAUnitCost(e.target.value)}
            className="border p-2 rounded w-full md:w-56"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2">City Overrides</label>
          {cityOverrides.map((o) => (
            <div key={o.city} className="flex items-center justify-between border-b py-2">
              <span>{o.city}: PKR {o.cost}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => openEditModal(o)} className="text-blue-600 hover:underline">
                  Edit
                </button>
                <button
                  onClick={() => setCityOverrides((prev) => prev.filter((el) => el.city !== o.city))}
                  className="text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-col md:flex-row gap-2 mt-3">
            <select
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              className="border p-2 rounded w-full md:w-52 bg-white"
            >
              <option value="">Select city</option>
              {allowedCities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Custom rate"
              value={newCityCost}
              onChange={(e) => setNewCityCost(e.target.value)}
              className="border p-2 rounded w-full md:w-44"
            />
            <button onClick={handleAddCityOverride} className="bg-blue-600 text-white px-3 py-2 rounded">
              Add Override
            </button>
          </div>
        </div>

        <button onClick={handleSave} className="bg-green-600 text-white px-4 py-2 rounded w-full md:w-auto">
          Save Shipping Rates
        </button>
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded shadow-lg w-full max-w-md p-4">
            <h3 className="text-lg font-semibold mb-3">Edit City Override</h3>
            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">City</label>
                <input value={editingCity} disabled className="w-full border p-2 rounded bg-gray-100" />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Custom Rate (PKR)</label>
                <input
                  type="number"
                  value={editingCost}
                  onChange={(e) => setEditingCost(e.target.value)}
                  className="w-full border p-2 rounded"
                  placeholder="Enter custom rate"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded border"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded bg-green-600 text-white"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShippingRatesPage;
