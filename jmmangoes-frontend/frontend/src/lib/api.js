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
let pendingMutations = 0;
const mutationMethods = new Set(['post', 'put', 'patch', 'delete']);

const emitMutationBusy = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('jmm:mutation-busy', { detail: { busy: pendingMutations > 0 } }));
};

const startMutation = (config) => {
  const method = String(config?.method || 'get').toLowerCase();
  if (!mutationMethods.has(method)) return config;
  config.__jmmMutationRequest = true;
  pendingMutations += 1;
  emitMutationBusy();
  return config;
};

const finishMutation = (config) => {
  if (!config?.__jmmMutationRequest) return;
  // Keep action buttons locked briefly so duplicate clicks do not race the toast feedback.
  setTimeout(() => {
    pendingMutations = Math.max(0, pendingMutations - 1);
    emitMutationBusy();
  }, 3000);
};

api.interceptors.request.use(startMutation, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => {
    finishMutation(response.config);
    return response;
  },
  (error) => {
    finishMutation(error?.config);
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
