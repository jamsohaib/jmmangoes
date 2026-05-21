import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

let isRedirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || '');
    const isAuthRequest = requestUrl.includes('/login') || requestUrl.includes('/register');

    if ((status === 401 || status === 403) && !isAuthRequest) {
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
