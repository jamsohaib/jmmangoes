import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');
const messageText = (row) => row?.text || row?.buttonText || row?.buttonPayload || row?.status || '-';

const WhatsAppChat = () => {
  const user = useAuthStore((state) => state.user);
  const canView = user?.role === 'admin' || user?.permissions?.communications?.view;
  const canManage = user?.role === 'admin' || user?.permissions?.communications?.manage;
  const [conversations, setConversations] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadConversations = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await api.get('/communications/whatsapp/conversations');
      const rows = res.data || [];
      setConversations(rows);
      if (!selectedPhone && rows[0]?.phone) setSelectedPhone(rows[0].phone);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load WhatsApp chat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations().catch(console.error);
  }, [canView]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((row) => [
      row.phone,
      row.contactName,
      row.lastText,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [conversations, search]);

  const selected = conversations.find((row) => row.phone === selectedPhone) || filteredConversations[0] || null;
  const canReply = Boolean(selected?.canReply && canManage);
  const replyWindowText = selected?.replyWindowExpiresAt
    ? `Reply window expires: ${formatDateTime(selected.replyWindowExpiresAt)}`
    : 'No inbound message window available.';

  const sendReply = async () => {
    if (!selected?.phone) return;
    if (!canReply) return toast.warn('Free-form reply is available only within 24 hours after customer message.');
    if (!reply.trim()) return toast.warn('Enter reply text.');
    setSending(true);
    try {
      await api.post('/communications/whatsapp/conversations/reply', {
        to: selected.phone,
        message: reply.trim(),
      });
      toast.success('WhatsApp reply sent.');
      setReply('');
      await loadConversations();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send WhatsApp reply.');
    } finally {
      setSending(false);
    }
  };

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <div>
          <h2 className="text-2xl font-bold">WhatsApp Chat</h2>
          <div className="text-sm text-gray-600">Free-form replies are allowed only within 24 hours after the customer messages first.</div>
        </div>
        <button onClick={loadConversations} className="border px-3 py-2 rounded bg-white" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-4">
        <div className="bg-white rounded shadow overflow-hidden">
          <div className="p-3 border-b">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search number or message..."
              className="border rounded p-2 w-full"
            />
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.phone}
                type="button"
                onClick={() => setSelectedPhone(conversation.phone)}
                className={`block w-full text-left p-3 border-b hover:bg-green-50 ${selected?.phone === conversation.phone ? 'bg-green-100' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{conversation.contactName || conversation.phone}</div>
                  <span className={`text-[11px] rounded px-2 py-0.5 ${conversation.canReply ? 'bg-green-700 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {conversation.canReply ? '24h open' : 'closed'}
                  </span>
                </div>
                <div className="text-xs text-gray-600">{conversation.phone}</div>
                <div className="text-sm text-gray-700 truncate mt-1">{conversation.lastDirection === 'outgoing' ? 'You: ' : ''}{conversation.lastText || '-'}</div>
                <div className="text-[11px] text-gray-500 mt-1">{formatDateTime(conversation.lastMessageAt)}</div>
              </button>
            ))}
            {!filteredConversations.length ? <div className="p-4 text-sm text-gray-600">No WhatsApp conversations found.</div> : null}
          </div>
        </div>

        <div className="bg-white rounded shadow min-h-[70vh] flex flex-col">
          {selected ? (
            <>
              <div className="p-4 border-b">
                <div className="font-semibold text-lg">{selected.contactName || selected.phone}</div>
                <div className="text-sm text-gray-600">{selected.phone}</div>
                <div className={`text-xs mt-1 ${selected.canReply ? 'text-green-700' : 'text-red-700'}`}>{replyWindowText}</div>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
                {(selected.messages || []).map((msg) => {
                  const outgoing = msg.direction === 'outgoing';
                  return (
                    <div key={msg._id || msg.messageId || msg.createdAt} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${outgoing ? 'bg-green-700 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm border'}`}>
                        <div className="whitespace-pre-wrap text-sm">{messageText(msg)}</div>
                        <div className={`text-[11px] mt-1 ${outgoing ? 'text-green-100' : 'text-gray-500'}`}>
                          {outgoing ? 'Sent' : 'Received'} | {formatDateTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t">
                {!selected.canReply ? (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                    Free-form reply is closed. Ask the customer to message again, or use an approved template from the test/broadcast tools.
                  </div>
                ) : null}
                <div className="flex flex-col md:flex-row gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={!canReply || sending}
                    placeholder={canReply ? 'Type free-form reply...' : 'Reply disabled outside 24-hour window'}
                    rows={2}
                    className="border rounded p-2 flex-1 disabled:bg-gray-100"
                  />
                  <button
                    onClick={sendReply}
                    disabled={!canReply || sending}
                    className="bg-green-700 text-white px-5 py-2 rounded disabled:opacity-60"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-gray-600">Select a conversation to view messages.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppChat;
