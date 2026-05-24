// components/Login.js
import React, { useState } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';



const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [message, setMessage] = useState('');
  const [showForgotForm, setShowForgotForm] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [challenge, setChallenge] = useState({ question: '', challengeToken: '' });
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const navigate = useNavigate();

  const setUser = useAuthStore((state) => state.setUser);

  const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
//      const res = await axios.post('http://localhost:5000/api/login',formData);
      const res = await api.post('/login', formData);
      

    //  // Usage:
    //   const token = getCookie('token');
    //   console.log('Token from cookie:', token);

       setUser(res.data.user); // Update the auth store

      setMessage(res.data.message||'Login successful!');

      navigate('/');
      // Store token or redirect as needed
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Login failed');
    }
  };

  const handleForgotPassword = async () => {
    setForgotMessage('');
    if (!String(forgotUsername || '').trim()) {
      setForgotMessage('Please enter username first.');
      return;
    }
    try {
      setIsSendingReset(true);
      const res = await api.post('/auth/forgot-password', {
        username: forgotUsername.trim(),
        challengeToken: challenge.challengeToken,
        challengeAnswer,
        hpField: '',
      });
      setForgotMessage(res?.data?.message || 'If username exists, reset instructions have been sent.');
      setChallengeAnswer('');
      const cRes = await api.get('/auth/human-challenge');
      setChallenge({
        question: cRes?.data?.question || '',
        challengeToken: cRes?.data?.challengeToken || '',
      });
    } catch (err) {
      setForgotMessage(err?.response?.data?.message || 'Unable to send reset instructions.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const loadChallenge = async () => {
    try {
      const cRes = await api.get('/auth/human-challenge');
      setChallenge({
        question: cRes?.data?.question || '',
        challengeToken: cRes?.data?.challengeToken || '',
      });
      setChallengeAnswer('');
    } catch (_) {
      setChallenge({ question: '', challengeToken: '' });
    }
  };

  // return (
  //   <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
  //     <h2 className="text-black text-2xl font-bold mb-4">Login</h2>
  //     {message && <p className="mb-4 text-red-500">{message}</p>}
  //     <form onSubmit={handleSubmit} className="space-y-4 text-black">
  //       <input
  //         type="email"
  //         name="email"
  //         placeholder="Email"
  //         className="w-full p-2 border border-gray-300 rounded"
  //         value={formData.email}
  //         onChange={handleChange}
  //         required
  //       />
  //       <input
  //         type="password"
  //         name="password"
  //         placeholder="Password"
  //         className="w-full p-2 border border-gray-300 rounded"
  //         value={formData.password}
  //         onChange={handleChange}
  //         required
  //       />
  //       <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">
  //         Login
  //       </button>
  //     </form>
  //   </div>
  // );

  return (
  <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
    <h2 className="text-black text-2xl font-bold mb-4">Login</h2>
    {message && <p className="mb-4 text-red-500">{message}</p>}
    <form onSubmit={handleSubmit} className="space-y-4 text-black">
      <input
        type="text"
        name="username"
        placeholder="Username"
        className="w-full p-2 border border-gray-300 rounded"
        value={formData.username}
        onChange={handleChange}
        required
      />
      <input
        type="password"
        name="password"
        placeholder="Password"
        className="w-full p-2 border border-gray-300 rounded"
        value={formData.password}
        onChange={handleChange}
        required
      />
      <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">
        Login
      </button>
      <button
        type="button"
        className="text-sm text-blue-600 hover:underline"
        onClick={() => {
          const next = !showForgotForm;
          setShowForgotForm(next);
          setForgotMessage('');
          if (next) loadChallenge();
        }}
      >
        Forgot password?
      </button>
      {showForgotForm ? (
        <div className="pt-2 border-t">
          <label className="block text-sm text-gray-700 mb-1">Enter your username to reset password</label>
          <input
            type="text"
            placeholder="Username"
            className="w-full p-2 border border-gray-300 rounded"
            value={forgotUsername}
            onChange={(e) => setForgotUsername(e.target.value)}
          />
          <label className="block text-sm text-gray-700 mt-2 mb-1">Human verification</label>
          <div className="text-sm text-gray-800 mb-1">{challenge.question || 'Loading challenge...'}</div>
          <input
            type="number"
            placeholder="Enter answer"
            className="w-full p-2 border border-gray-300 rounded"
            value={challengeAnswer}
            onChange={(e) => setChallengeAnswer(e.target.value)}
          />
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={isSendingReset || !challenge.challengeToken}
            className="mt-2 w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {isSendingReset ? 'Sending...' : 'Send Reset Password Link'}
          </button>
          {forgotMessage ? <p className="mt-2 text-sm text-gray-700">{forgotMessage}</p> : null}
        </div>
      ) : null}
    </form>
  </div>
);

};

export default Login;
