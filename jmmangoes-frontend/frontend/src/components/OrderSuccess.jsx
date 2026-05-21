import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const OrderSuccess = () => {
  const location = useLocation();
  const orderNumber = location.state?.orderNumber || '';

  return (
    <div className="max-w-2xl mx-auto mt-10 bg-white rounded shadow p-6 text-center text-black">
      <h2 className="text-3xl font-bold text-green-700 mb-3">Thank You</h2>
      <p className="mb-2">Thank you for placing your order. A confirmation email will be sent to you.</p>
      {orderNumber ? <p className="mb-6 font-semibold">Order Number: {orderNumber}</p> : null}
      <Link to="/" className="inline-block bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700">Go To Home</Link>
    </div>
  );
};

export default OrderSuccess;

