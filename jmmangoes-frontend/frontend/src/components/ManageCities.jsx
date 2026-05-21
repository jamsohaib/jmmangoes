import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import DEFAULT_CITIES from '../constants/defaultCities';
import { toast } from 'react-toastify';

const normalizeCities = (cities) =>
  [...new Set((cities || []).map((c) => c?.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

const ManageCities = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.manageCities?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.manageCities?.manage;
  const [cities, setCities] = useState([]);
  const [newCity, setNewCity] = useState('');
  const [zoneAUnitCost, setZoneAUnitCost] = useState(0);
  const [cityOverrides, setCityOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/shippingCosts');
        const settings = res.data || {};
        setZoneAUnitCost(Number(settings.zoneAUnitCost || 0));
        setCityOverrides(Array.isArray(settings.cityOverrides) ? settings.cityOverrides : []);
        const initialCities = settings.allowedCities?.length ? settings.allowedCities : DEFAULT_CITIES;
        setCities(normalizeCities(initialCities));
      } catch (err) {
        console.error('Error loading cities:', err);
        setCities(normalizeCities(DEFAULT_CITIES));
      } finally {
        setLoading(false);
      }
    };

    if (canView) {
      load();
    } else {
      setLoading(false);
    }
  }, [canView]);

  const handleAddCity = () => {
    if (!canManage) return toast.warn('No manage permission.');
    const candidate = newCity.trim();
    if (!candidate) {
      toast.warn('Please enter a city name.');
      return;
    }
    if (cities.some((c) => c.toLowerCase() === candidate.toLowerCase())) {
      toast.warn('This city already exists.');
      return;
    }
    setCities(normalizeCities([...cities, candidate]));
    setNewCity('');
    toast.success(`${candidate} added successfully.`);
  };

  const handleRemoveCity = (cityToRemove) => {
    if (!canManage) return toast.warn('No manage permission.');
    setCities(cities.filter((c) => c !== cityToRemove));
    toast.success(`${cityToRemove} removed successfully.`);
  };

  const handleSave = async () => {
    if (!canManage) return toast.warn('No manage permission.');
    try {
      setSaving(true);
      await api.post('/shippingCosts', {
        zoneAUnitCost,
        cityOverrides,
        allowedCities: normalizeCities(cities),
      });
      toast.success('Cities saved successfully.');
    } catch (err) {
      console.error('Error saving cities:', err);
      toast.error('Failed to save cities.');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return <div className="p-4 text-black">Access denied.</div>;
  }

  if (loading) {
    return <div className="p-4 text-black">Loading cities...</div>;
  }

  return (
    <div className="p-3 md:p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Manage Cities</h2>
      <p className="mb-4 text-gray-700">
        Add or remove cities shown in customer checkout.
      </p>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          type="text"
          value={newCity}
          onChange={(e) => setNewCity(e.target.value)}
          placeholder="Type city name"
          className="border p-2 rounded w-full md:w-80"
        />
        <button
          onClick={handleAddCity}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full md:w-auto"
        >
          Add City
        </button>
      </div>

      <div className="bg-white border rounded p-4 max-h-[420px] overflow-auto">
        <div className="font-semibold mb-3">Current Cities ({cities.length})</div>
        {cities.map((city) => (
          <div key={city} className="flex items-center justify-between border-b py-2">
            <span>{city}</span>
            <button
              onClick={() => handleRemoveCity(city)}
              className="text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60 w-full md:w-auto"
      >
        {saving ? 'Saving...' : 'Save Cities'}
      </button>
    </div>
  );
};

export default ManageCities;
