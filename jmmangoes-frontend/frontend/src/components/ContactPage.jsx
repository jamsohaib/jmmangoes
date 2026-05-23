import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';

const FARM = {
  name: 'JM Mangoes Farm',
  latitude: 28.632041,
  longitude: 70.16084,
};

const Icon = {
  Facebook: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.78-3.88 1.1 0 2.25.2 2.25.2v2.47H15.2c-1.25 0-1.64.77-1.64 1.57V12h2.79l-.45 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" /></svg>
  ),
  Instagram: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25h-8.5Zm9.75 2.25a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /></svg>
  ),
  WhatsApp: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.78 11.78 0 0 0 12.02 0C5.39 0 0 5.39 0 12c0 2.12.56 4.2 1.63 6.03L0 24l6.16-1.6A11.93 11.93 0 0 0 12.02 24C18.64 24 24 18.61 24 12c0-3.2-1.25-6.2-3.48-8.52ZM12.02 21.86c-1.8 0-3.57-.48-5.13-1.4l-.37-.22-3.65.95.97-3.56-.24-.37a9.82 9.82 0 0 1-1.52-5.25c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.02 6.95 2.88a9.76 9.76 0 0 1 2.9 6.96c0 5.43-4.42 9.85-9.77 9.85Zm5.4-7.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.8-1.67-2.1-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.08 4.49.71.31 1.27.5 1.7.64.71.22 1.35.19 1.86.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" /></svg>
  ),
  Email: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h15A2.5 2.5 0 0 1 22 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5v-13Zm2.18-.5L12 10.27 19.82 5H4.18ZM20 6.34l-7.44 5.02a1 1 0 0 1-1.12 0L4 6.34V18.5a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5V6.34Z" /></svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7.93 9h-3.14a15.9 15.9 0 0 0-1.2-5.02A8.02 8.02 0 0 1 19.93 11ZM12 4.07c.93 1.03 2.2 3.16 2.75 6.93H9.25C9.8 7.23 11.07 5.1 12 4.07ZM8.41 5.98A15.9 15.9 0 0 0 7.2 11H4.07a8.02 8.02 0 0 1 4.34-5.02ZM4.07 13H7.2c.16 1.8.58 3.5 1.2 5.02A8.02 8.02 0 0 1 4.07 13ZM12 19.93c-.93-1.03-2.2-3.16-2.75-6.93h5.5c-.55 3.77-1.82 5.9-2.75 6.93Zm3.59-1.91A15.9 15.9 0 0 0 16.8 13h3.14a8.02 8.02 0 0 1-4.34 5.02Z" /></svg>
  ),
};

const ContactPage = () => {
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    siteName: '',
    message: '',
    hpField: '',
  });
  const [sending, setSending] = useState(false);
  const [captcha, setCaptcha] = useState({ a: 0, b: 0, answer: '' });
  const [formStartedAt, setFormStartedAt] = useState(Date.now());

  useEffect(() => {
    api.get('/sites/public')
      .then((res) => {
        const rows = (res.data || []).filter((s) => String(s.name || '').toLowerCase() !== 'online');
        setSites(rows);
      })
      .catch(() => {
        setSites([]);
      });
  }, []);

  useEffect(() => {
    setCaptcha({
      a: Math.floor(Math.random() * 9) + 1,
      b: Math.floor(Math.random() * 9) + 1,
      answer: '',
    });
    setFormStartedAt(Date.now());
  }, []);

  const farmMapLink = useMemo(
    () => `https://www.google.com/maps?q=${FARM.latitude},${FARM.longitude}`,
    []
  );

  const submitQuery = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.message.trim()) {
      toast.warn('Please enter your name and message.');
      return;
    }
    if (Number(captcha.answer) !== Number(captcha.a + captcha.b)) {
      toast.warn('Please solve the human verification correctly.');
      return;
    }
    setSending(true);
    try {
      await api.post('/contact-query', {
        ...form,
        captchaA: captcha.a,
        captchaB: captcha.b,
        captchaAnswer: captcha.answer,
        formStartedAt,
      });
      toast.success('Your query has been sent.');
      setForm({ name: '', email: '', phone: '', siteName: '', message: '', hpField: '' });
      setCaptcha({
        a: Math.floor(Math.random() * 9) + 1,
        b: Math.floor(Math.random() * 9) + 1,
        answer: '',
      });
      setFormStartedAt(Date.now());
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not send your query right now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 md:p-6 text-black">
      <h2 className="text-3xl font-bold mb-4">Contact Us</h2>

      <div className="bg-white rounded shadow p-4 mb-5">
        <h3 className="text-xl font-semibold text-green-700 mb-2">Our Farm</h3>
        <p><strong>Name:</strong> {FARM.name}</p>
        <p><strong>Coordinates:</strong> {FARM.latitude}, {FARM.longitude}</p>
        <a className="text-blue-700 underline" href={farmMapLink} target="_blank" rel="noreferrer">View Farm on Google Maps</a>
        <div className="mt-3 rounded overflow-hidden border">
          <iframe
            title="JM Farms Map"
            src={`https://maps.google.com/maps?q=${FARM.latitude},${FARM.longitude}&z=15&output=embed`}
            className="w-full h-56"
            loading="lazy"
          />
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5">
        <h3 className="text-xl font-semibold text-green-700 mb-3">Our Sites</h3>
        <div className="space-y-3">
          {sites.map((site) => {
            const hasCoords = site.latitude !== null && site.longitude !== null && site.latitude !== undefined && site.longitude !== undefined;
            const mapLink = hasCoords ? `https://www.google.com/maps?q=${site.latitude},${site.longitude}` : '';
            return (
              <div key={site._id} className="border rounded p-3">
                <p><strong>{site.name}</strong></p>
                <p>{site.address}, {site.city}</p>
                <p><strong>Contact:</strong> {site.contactNumber}</p>
                <p><strong>Contact Person:</strong> {site.contactPersonName || '-'}</p>
                <p><strong>Coordinates:</strong> {hasCoords ? `${site.latitude}, ${site.longitude}` : 'Not set'}</p>
                {hasCoords ? <a className="text-blue-700 underline" href={mapLink} target="_blank" rel="noreferrer">View on Google Maps</a> : null}
                {hasCoords ? (
                  <div className="mt-3 rounded overflow-hidden border">
                    <iframe
                      title={`${site.name} Map`}
                      src={`https://maps.google.com/maps?q=${site.latitude},${site.longitude}&z=15&output=embed`}
                      className="w-full h-44"
                      loading="lazy"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {sites.length === 0 ? <p className="text-gray-600">No site details available yet.</p> : null}
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 mb-5">
        <h3 className="text-xl font-semibold text-green-700 mb-3">Connect With Us</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <a href="https://www.facebook.com/jmmangoes1993" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border rounded px-3 py-2 hover:bg-gray-50">
            <Icon.Facebook /><span>Facebook</span>
          </a>
          <a href="https://www.instagram.com/jmmangoes1993" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border rounded px-3 py-2 hover:bg-gray-50">
            <Icon.Instagram /><span>Instagram</span>
          </a>
          <a href="https://wa.me/923218869344" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border rounded px-3 py-2 hover:bg-gray-50">
            <Icon.WhatsApp /><span>WhatsApp</span>
          </a>
          <a href="mailto:info@csittec.com" className="inline-flex items-center gap-2 border rounded px-3 py-2 hover:bg-gray-50">
            <Icon.Email /><span>info@csittec.com</span>
          </a>
          <a href="https://jmmangoes.pk" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border rounded px-3 py-2 hover:bg-gray-50">
            <Icon.Globe /><span>jmmangoes.pk</span>
          </a>
        </div>
      </div>

      <form onSubmit={submitQuery} className="bg-white rounded shadow p-4 space-y-3">
        <h3 className="text-xl font-semibold text-green-700">Send Us a Query</h3>
        <input className="w-full border p-2 rounded" placeholder="Your Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <input className="w-full border p-2 rounded" placeholder="Your Email (optional)" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <input className="w-full border p-2 rounded" placeholder="Phone / WhatsApp (optional)" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <input className="w-full border p-2 rounded" placeholder="Related Site Name (optional)" value={form.siteName} onChange={(e) => setForm((p) => ({ ...p, siteName: e.target.value }))} />
        <textarea className="w-full border p-2 rounded" rows={5} placeholder="Write your query" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} required />
        <input
          type="text"
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          value={form.hpField}
          onChange={(e) => setForm((p) => ({ ...p, hpField: e.target.value }))}
          aria-hidden="true"
        />
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-sm font-medium mb-2">Human Verification</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">What is {captcha.a} + {captcha.b} ?</span>
            <input
              type="number"
              className="border p-2 rounded w-24"
              value={captcha.answer}
              onChange={(e) => setCaptcha((p) => ({ ...p, answer: e.target.value }))}
              required
            />
            <button
              type="button"
              className="border px-3 py-2 rounded text-sm"
              onClick={() => setCaptcha({ a: Math.floor(Math.random() * 9) + 1, b: Math.floor(Math.random() * 9) + 1, answer: '' })}
            >
              Refresh
            </button>
          </div>
        </div>
        <button type="submit" disabled={sending} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">
          {sending ? 'Sending...' : 'Send Query'}
        </button>
      </form>
    </div>
  );
};

export default ContactPage;
