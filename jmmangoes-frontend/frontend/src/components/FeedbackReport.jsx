import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const todayISO = new Date().toISOString().slice(0, 10);

const FeedbackReport = () => {
  const user = useAuthStore((s) => s.user);
  const canView = user?.role === 'admin' || user?.permissions?.feedbackReport?.view;
  const [rows, setRows] = useState([]);
  const [rating, setRating] = useState('');
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);

  const load = async () => {
    const params = { dateFrom, dateTo };
    if (rating) params.rating = rating;
    const res = await api.get('/orders/feedback-report', { params });
    setRows(res.data || []);
  };

  useEffect(() => { if (canView) load().catch(console.error); }, [canView]);

  const downloadCsv = () => {
    const headers = ['Order #', 'Customer', 'Email', 'Mobile', 'Rating', 'Comments', 'Submitted At', 'Amount', 'Status'];
    const lines = rows.map((r) => [
      `"${r.orderNumber || ''}"`,
      `"${String(r.customerName || '').replace(/"/g, '""')}"`,
      `"${String(r.customerEmail || '').replace(/"/g, '""')}"`,
      `"${String(r.customerMobile || '').replace(/"/g, '""')}"`,
      `"${String(r.rating || '')}"`,
      `"${String(r.comments || '').replace(/"/g, '""')}"`,
      `"${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}"`,
      `"${Number(r.finalAmount || 0).toFixed(2)}"`,
      `"${r.status || ''}"`,
    ].join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `feedback_report_${dateFrom}_${dateTo}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalCount = rows.length;
  const averageRating = totalCount
    ? (rows.reduce((sum, r) => sum + Number(r.rating || 0), 0) / totalCount).toFixed(2)
    : '0.00';
  const starCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rows.filter((r) => Number(r.rating) === star).length,
  }));

  if (!canView) return <div className="p-4 text-black">Access denied.</div>;

  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-bold mb-4">Feedback Report</h2>
      <div className="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-2">
        <select value={rating} onChange={(e) => setRating(e.target.value)} className="border p-2 rounded">
          <option value="">All Ratings</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} Star</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border p-2 rounded" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border p-2 rounded" />
        <button onClick={load} className="bg-blue-600 text-white px-4 py-2 rounded">Apply</button>
        <button onClick={downloadCsv} className="bg-green-600 text-white px-4 py-2 rounded">Download CSV</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-600">Total Feedback</div>
          <div className="text-2xl font-bold">{totalCount}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-600">Average Rating</div>
          <div className="text-2xl font-bold">{averageRating} / 5</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Star Breakdown</div>
          <div className="space-y-1 text-sm">
            {starCounts.map((s) => (
              <div key={s.star} className="flex justify-between">
                <span>{s.star} Star</span>
                <span className="font-semibold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border px-3 py-2">Order #</th>
              <th className="border px-3 py-2">Customer</th>
              <th className="border px-3 py-2">Rating</th>
              <th className="border px-3 py-2">Comments</th>
              <th className="border px-3 py-2">Submitted At</th>
              <th className="border px-3 py-2">Amount</th>
              <th className="border px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.orderNumber}-${r.submittedAt}`}>
                <td className="border px-3 py-2">{r.orderNumber}</td>
                <td className="border px-3 py-2">{r.customerName}<br />{r.customerMobile}</td>
                <td className="border px-3 py-2">{r.rating}</td>
                <td className="border px-3 py-2">{r.comments || '-'}</td>
                <td className="border px-3 py-2">{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '-'}</td>
                <td className="border px-3 py-2">PKR {Number(r.finalAmount || 0).toFixed(2)}</td>
                <td className="border px-3 py-2">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="border px-3 py-3 text-center text-gray-500">No feedback records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FeedbackReport;
