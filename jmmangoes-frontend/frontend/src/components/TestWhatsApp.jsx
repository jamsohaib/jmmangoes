import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const TestWhatsApp = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.communications?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.communications?.manage;
  const [to, setTo] = useState('923006721290');
  const [messageType, setMessageType] = useState('text');
  const [message, setMessage] = useState('Hello this is the test message');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const sendTest = async (e) => {
    e.preventDefault();
    if (!canManage) return toast.warn('No manage permission.');
    const cleaned = String(to || '').replace(/\D/g, '');
    if (!cleaned) return toast.warn('Enter recipient WhatsApp number with country code.');
    if (messageType === 'text' && !String(message || '').trim()) return toast.warn('Enter message text.');

    setSending(true);
    setResult(null);
    try {
      const res = await api.post('/communications/whatsapp/test', {
        to: cleaned,
        messageType,
        message: messageType === 'text' ? message : undefined,
      });
      setResult(res.data);
      toast.success(res.data?.message || 'WhatsApp test sent.');
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to send WhatsApp test message.';
      setResult(err?.response?.data || { message });
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black max-w-3xl mx-auto">
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-2xl font-bold mb-2">Test WhatsApp</h2>
        <p className="text-sm text-gray-600 mb-4">
          Send Meta WhatsApp test messages through the backend configuration.
        </p>

        <form onSubmit={sendTest} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">Recipient WhatsApp Number</span>
            <input
              className="border rounded p-2 w-full mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="923006721290"
            />
            <span className="text-xs text-gray-500">Use country code without plus sign, for example 923006721290.</span>
          </label>

          <div className="border rounded p-3 bg-gray-50 text-sm">
            <div><strong>Template:</strong> configured on server via <code>WHATSAPP_TEST_TEMPLATE_NAME</code></div>
            <div><strong>Language:</strong> configured on server via <code>WHATSAPP_TEST_TEMPLATE_LANGUAGE</code></div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold">Message Type</span>
            <select
              className="border rounded p-2 w-full mt-1"
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
            >
              <option value="text">Text Message</option>
              <option value="template">Template Message</option>
            </select>
          </label>

          {messageType === 'text' && (
            <label className="block">
              <span className="text-sm font-semibold">Message</span>
              <textarea
                className="border rounded p-2 w-full mt-1 min-h-28"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
          )}

          <button
            type="submit"
            disabled={sending || !canManage}
            className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {sending ? 'Sending...' : 'Send Test WhatsApp'}
          </button>
        </form>

        {result && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Response</h3>
            <pre className="bg-gray-900 text-green-100 rounded p-3 text-xs overflow-auto max-h-80">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestWhatsApp;
