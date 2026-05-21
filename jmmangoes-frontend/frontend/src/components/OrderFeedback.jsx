import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { toast } from 'react-toastify';

const OrderFeedback = () => {
  const { orderNumber } = useParams();
  const [meta, setMeta] = useState(null);
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const ratingLabels = {
    5: 'Highly Satisfied',
    4: 'Satisfied',
    3: 'Neutral',
    2: 'Dissatisfied',
    1: 'Extremely Dissatisfied',
  };

  useEffect(() => {
    api.get(`/orders/feedback/${orderNumber}`)
      .then((res) => {
        setMeta(res.data);
        if (res.data?.feedback?.rating) {
          setSubmitted(true);
          setRating(res.data.feedback.rating);
          setComments(res.data.feedback.comments || '');
        }
      })
      .catch(() => setMeta(null));
  }, [orderNumber]);

  const submit = async () => {
    try {
      await api.post(`/orders/feedback/${orderNumber}`, { rating, comments });
      setSubmitted(true);
      toast.success('Feedback submitted. Thank you!');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit feedback.');
    }
  };

  if (!meta) return <div className="p-6 text-black">Order not found.</div>;

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6 text-black">
      <h2 className="text-2xl font-bold mb-2">Order Feedback</h2>
      <p className="mb-4">Order: <strong>{meta.orderNumber}</strong></p>
      {submitted ? (
        <div>
          <p className="mb-2">Thank you for your feedback.</p>
          <p>Rating: {rating} / 5 ({ratingLabels[rating]})</p>
          <p>Comments: {comments || '-'}</p>
          <Link to="/" className="inline-block mt-4 bg-green-600 text-white px-4 py-2 rounded">Go Home</Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block mb-1">Rating (1 to 5)</label>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="border p-2 rounded w-full">
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} - {ratingLabels[n]}</option>)}
            </select>
            <p className="text-sm text-gray-600 mt-1">Selected: {rating} - {ratingLabels[rating]}</p>
          </div>
          <div>
            <label className="block mb-1">Comments</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} className="border p-2 rounded w-full" rows={4} />
          </div>
          <button onClick={submit} className="bg-green-600 text-white px-4 py-2 rounded">Submit Feedback</button>
        </div>
      )}
    </div>
  );
};

export default OrderFeedback;
