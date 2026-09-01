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

// Handle 401 errors globally — token expired or invalid
api.interceptors.response.use(
  response => response,
  error => {
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === 'You have view-only access. You do not have permission to edit or delete this information.'
    ) {
      window.alert(error.response.data.error);
    }
    if (error.response?.status === 401) {
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
