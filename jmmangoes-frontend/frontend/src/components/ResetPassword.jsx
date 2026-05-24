import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!token) {
      setError('Reset token is missing or invalid.');
      return;
    }
    if (!form.password || !form.confirmPassword) {
      setError('Please enter password and confirm password.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await api.post('/auth/reset-password', {
        token,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      setMessage(res?.data?.message || 'Password reset successful.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow text-black">
      <h2 className="text-2xl font-bold mb-4">Reset Password</h2>
      {error ? <p className="mb-3 text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-green-700">{message}</p> : null}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          className="w-full p-2 border border-gray-300 rounded"
          placeholder="New password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          required
        />
        <input
          type="password"
          className="w-full p-2 border border-gray-300 rounded"
          placeholder="Confirm new password"
          value={form.confirmPassword}
          onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
          required
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Back to <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
      </p>
    </div>
  );
};

export default ResetPassword;
