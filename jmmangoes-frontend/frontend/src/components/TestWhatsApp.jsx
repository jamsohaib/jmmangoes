import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const approvedTwilioTemplates = [
  {
    label: 'Order confirmation request',
    sid: 'HX84346a3cc400b9f8fd9fa2acc9540e2f',
    variables: '{"1":"Ahmed Sohaib","2":"JMM-A001","3":"Dosehri (10 Kg) x 1","4":"2850"}',
  },
  {
    label: 'Order dispatched',
    sid: 'HX34586ad287a5ceaf0fc4607bd72a4af9',
    variables: '{"1":"Ahmed Sohaib","2":"JMM-A001","3":"Dosehri (10 Kg) x 1","4":"FCS","5":"112233"}',
  },
  {
    label: 'Order delivered feedback',
    sid: 'HX7321054c56a0c2ff68b4a8144cd92664',
    variables: '{"1":"Ahmed Sohaib","2":"JMM-A001","3":"Dosehri (10 Kg) x 1","4":"https://jmmangoes.pk/feedback/JMM-A001"}',
  },
  {
    label: 'Stall purchase thank-you',
    sid: 'HX9eb83e8619d409aad1ce416c5a56cb34',
    variables: '{"1":"Ahmed Sohaib","2":"Dosehri (10 Kg) x 1"}',
  },
  {
    label: 'Thank you for purchase',
    sid: 'HXd1021db83578b20d3e7bc3684f1f10d2',
    variables: '{"1":"Ahmed Sohaib","2":"Dosehri (10 Kg) x 1"}',
  },
  {
    label: 'New stock arrival',
    sid: 'HX6425d5869c2a01913a0b43be57b4d9ff',
    variables: '{"1":"Ahmed Sohaib","2":"Dosehri 10 kg and Sindhri 10 kg","3":"Rahim Yar Khan, Gulzaar e Quaid, and online ordering"}',
  },
  {
    label: 'Online ordering open',
    sid: 'HX6ae43f79f84866969fe76c7726927d7a',
    variables: '{"1":"Dosehri","2":"https://jmmangoes.pk"}',
  },
];

const TestWhatsApp = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.communications?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.communications?.manage;
  const [to, setTo] = useState('923006721290');
  const [messageType, setMessageType] = useState('text');
  const [message, setMessage] = useState('Hello this is the test message');
  const [contentSid, setContentSid] = useState('');
  const [contentVariables, setContentVariables] = useState('{"1":"12/1","2":"3pm"}');
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
        contentSid: messageType === 'template' ? contentSid : undefined,
        contentVariables: messageType === 'template' ? contentVariables : undefined,
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
          Send WhatsApp test messages through the backend provider configured on the server.
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
            <div><strong>Provider:</strong> configured on server via <code>WHATSAPP_PROVIDER</code> (defaults to Meta)</div>
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

          {messageType === 'template' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold">Approved Template</span>
                <select
                  className="border rounded p-2 w-full mt-1"
                  value={contentSid}
                  onChange={(e) => {
                    const selected = approvedTwilioTemplates.find((template) => template.sid === e.target.value);
                    setContentSid(e.target.value);
                    if (selected) setContentVariables(selected.variables);
                  }}
                >
                  <option value="">Manual / server default</option>
                  {approvedTwilioTemplates.map((template) => (
                    <option key={template.sid} value={template.sid}>{template.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold">Twilio Content SID</span>
                <input
                  className="border rounded p-2 w-full mt-1"
                  value={contentSid}
                  onChange={(e) => setContentSid(e.target.value)}
                  placeholder="HXb5b62575e6e4ff6129ad7c8efe1f983e"
                />
                <span className="text-xs text-gray-500">Optional if <code>TWILIO_CONTENT_SID</code> is already set in server .env.</span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold">Twilio Content Variables JSON</span>
                <textarea
                  className="border rounded p-2 w-full mt-1 min-h-24 font-mono text-sm"
                  value={contentVariables}
                  onChange={(e) => setContentVariables(e.target.value)}
                  placeholder='{"1":"12/1","2":"3pm"}'
                />
              </label>
            </div>
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
