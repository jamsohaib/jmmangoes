// src/components/Footer.jsx
import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gradient-to-l from-green-600 to-green-700 py-6">
      <div className="container mx-auto px-4 text-center text-white">
        &copy; {new Date().getFullYear()} JM Mangoes. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
