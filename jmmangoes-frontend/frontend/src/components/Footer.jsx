import React from 'react';
import { Link } from 'react-router-dom';

const Icon = {
  Facebook: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.78-3.88 1.1 0 2.25.2 2.25.2v2.47H15.2c-1.25 0-1.64.77-1.64 1.57V12h2.79l-.45 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" /></svg>
  ),
  Instagram: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25h-8.5Zm9.75 2.25a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /></svg>
  ),
  WhatsApp: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.78 11.78 0 0 0 12.02 0C5.39 0 0 5.39 0 12c0 2.12.56 4.2 1.63 6.03L0 24l6.16-1.6A11.93 11.93 0 0 0 12.02 24C18.64 24 24 18.61 24 12c0-3.2-1.25-6.2-3.48-8.52ZM12.02 21.86c-1.8 0-3.57-.48-5.13-1.4l-.37-.22-3.65.95.97-3.56-.24-.37a9.82 9.82 0 0 1-1.52-5.25c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.02 6.95 2.88a9.76 9.76 0 0 1 2.9 6.96c0 5.43-4.42 9.85-9.77 9.85Z" /></svg>
  ),
  Email: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h15A2.5 2.5 0 0 1 22 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5v-13Zm2.18-.5L12 10.27 19.82 5H4.18ZM20 6.34l-7.44 5.02a1 1 0 0 1-1.12 0L4 6.34V18.5a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5V6.34Z" /></svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7.93 9h-3.14a15.9 15.9 0 0 0-1.2-5.02A8.02 8.02 0 0 1 19.93 11ZM12 4.07c.93 1.03 2.2 3.16 2.75 6.93H9.25C9.8 7.23 11.07 5.1 12 4.07Z" /></svg>
  ),
};

const Footer = () => {
  return (
    <footer className="bg-gradient-to-l from-green-600 to-green-700 py-6">
      <div className="container mx-auto px-4 text-center text-white">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
          <a href="https://www.facebook.com/jmmangoes1993" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/40 rounded px-3 py-2 hover:bg-white/10">
            <Icon.Facebook /><span>Facebook</span>
          </a>
          <a href="https://www.instagram.com/jmmangoes1993" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/40 rounded px-3 py-2 hover:bg-white/10">
            <Icon.Instagram /><span>Instagram</span>
          </a>
          <a href="https://wa.me/923218869344" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/40 rounded px-3 py-2 hover:bg-white/10">
            <Icon.WhatsApp /><span>WhatsApp</span>
          </a>
          <a href="mailto:info@csittec.com" className="inline-flex items-center gap-2 border border-white/40 rounded px-3 py-2 hover:bg-white/10">
            <Icon.Email /><span>info@csittec.com</span>
          </a>
          <a href="https://jmmangoes.pk" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/40 rounded px-3 py-2 hover:bg-white/10">
            <Icon.Globe /><span>jmmangoes.pk</span>
          </a>
        </div>
        <div className="mb-2">
          <Link to="/privacy-policy" className="underline underline-offset-4 hover:text-yellow-200">
            Privacy Policy
          </Link>
        </div>
        <div>&copy; {new Date().getFullYear()} JM Mangoes. All rights reserved.</div>
      </div>
    </footer>
  );
};

export default Footer;
