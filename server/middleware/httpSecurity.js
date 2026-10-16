// server/middleware/httpSecurity.js
//
// HTTP-level hardening applied once in server.js, before any route:
//   * CORS: only the browser origins in CORS_ORIGINS (.env, comma separated,
//     e.g. https://stock.ravonbakers.lk) may call the API. Set it per
//     deployment instead of editing code. Default = the local React dev server.
//     Requests without an Origin header (server-to-server, curl) are unaffected.
//   * Security headers on every response; API responses also get a deny-all
//     CSP and no-store (they hold financial data). The React app is served
//     elsewhere, so none of this restricts the UI. HSTS belongs on the HTTPS proxy.
//   * JSON bodies limited to 100kb (also Express's default - stated so a raise
//     is a deliberate choice).
const cors = require('cors');
const express = require('express');

const DEFAULT_ORIGINS = 'http://localhost:3000';

const allowedOrigins = (value = process.env.CORS_ORIGINS) => String(value || DEFAULT_ORIGINS)
  .split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);

const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  if (req.path.startsWith('/api')) {
    res.set({ 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' });
  }
  next();
};

// TRUST_PROXY (.env): which reverse proxies (nginx, a load balancer) may tell us
// the real client address in X-Forwarded-For. Without it every request behind a
// proxy looks like it comes from the proxy: the Audit Trail shows the proxy's IP
// and the per-IP sign-in limit is shared by all users. Never trust the header
// when there is no proxy - anyone could then claim any address.
//   unset / 'false'          no proxy (default)
//   'loopback'               nginx on the same server (127.0.0.1 / ::1)
//   '1', '2' ...             number of proxies in front of the app
//   '10.0.0.5, 10.0.0.0/24'  these proxy addresses / ranges
const trustProxySetting = (value = process.env.TRUST_PROXY) => {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(text)) return Number(text);
  if (text.toLowerCase() === 'true') return true;
  return text.split(',').map((part) => part.trim()).filter(Boolean);
};

const applyHttpSecurity = (app, { origins = allowedOrigins(), trustProxy = trustProxySetting() } = {}) => {
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-RM-Adjustment'],
    credentials: true
  }));
  app.use(securityHeaders);
  app.use(express.json({ limit: '100kb' }));
};

module.exports = { applyHttpSecurity, allowedOrigins, securityHeaders, trustProxySetting };
