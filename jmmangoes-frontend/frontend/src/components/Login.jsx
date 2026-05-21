// components/Login.js
import React, { useState } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';



const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const setUser = useAuthStore((state) => state.setUser);

  const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
//      const res = await axios.post('http://localhost:5000/api/login',formData);
      const res = await api.post('/login', formData);
      console.log(res.data.message);

    //  // Usage:
    //   const token = getCookie('token');
    //   console.log('Token from cookie:', token);
      console.log('user info:', res.data.user.role);
       setUser(res.data.user); // Update the auth store
      console.log("url : ",res.data.url);
      setMessage(res.data.message||'Login successful!');

      navigate('/');
      // Store token or redirect as needed
    } catch (err) {
      setMessage(err.response.data.message || 'Login failed');
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
    </form>
  </div>
);

};

export default Login;
