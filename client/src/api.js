//src/api.js

import axios from 'axios';

const api = axios.create({
  //baseURL: 'https://api-stock.ravonbakers.lk/api',
  //baseURL: 'https://api.cjtradingcompany.lk/api',
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
});

// Add token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 from POST /login means wrong credentials, not an expired session: it
// must reach Login.jsx so the error can be shown instead of reloading the page.
const isLoginRequest = config => {
  const path = String(config?.url || '').split('?')[0].replace(/\/+$/, '');
  return path === '/login' || path === 'login' || path.endsWith('/api/login');
};

// Period close: the server refuses (409, code PERIOD_CLOSED) a change dated in a closed month.
// Many pages answer any failure with a fixed text ("Failed to update..."), so the reason is
// announced here too; PopupProvider shows it. Sent a tick later so it replaces, not precedes,
// the page's own message.
export const PERIOD_CLOSED_EVENT = 'bsms:period-closed';
const announcePeriodClosed = (error) => {
  const data = error.response?.data;
  if (error.response?.status !== 409 || data?.code !== 'PERIOD_CLOSED') return;
  setTimeout(() => window.dispatchEvent(new CustomEvent(PERIOD_CLOSED_EVENT, { detail: { message: data.error } })), 0);
};

// Handle 401 errors globally — token expired or invalid
api.interceptors.response.use(
  response => response,
  error => {
    announcePeriodClosed(error);
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === 'You have view-only access. You do not have permission to edit or delete this information.'
    ) {
      window.alert(error.response.data.error);
    }
    if (error.response?.status === 401 && !isLoginRequest(error.config)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Encode the current page so Login can redirect back after re-authentication.
      const currentPath = window.location.pathname + window.location.search;
      const redirectTo =
        currentPath && currentPath !== '/login'
          ? `/login?redirect=${encodeURIComponent(currentPath)}`
          : '/login';
      window.location.href = redirectTo;
    }
    return Promise.reject(error);
  }
);

export default api;
