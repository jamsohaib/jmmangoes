import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

export const toPublicAssetUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  const path = String(url).startsWith('/') ? url : `/${url}`;
  return `${origin}${path}`;
};

let isRedirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const isAuthRequest = requestUrl.includes('/login') || requestUrl.includes('/register');

    if (status === 401 && !isAuthRequest) {
      useAuthStore.getState().clearUser();
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true;
        window.location.href = '/login';
        setTimeout(() => {
          isRedirectingToLogin = false;
        }, 500);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
