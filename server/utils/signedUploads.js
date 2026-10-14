// server/utils/signedUploads.js
//
// Uploaded files (/uploads/...) are served only through SHORT-LIVED SIGNED
// links: the API puts `?exp=<unix seconds>&sig=<HMAC>` on every image_url it
// returns to a signed-in user, and serveSignedUploads() refuses any request
// without a valid, unexpired signature. <img src> tags cannot send the login
// token, so this keeps images working while someone who is not signed in (and
// so never received a link) gets 403.
//
// Links are valid for LINK_TTL_SECONDS, rounded to an hour boundary so the same
// image keeps the same URL for a while (browser cache still works).
// The key is derived from JWT_SECRET: rotating it invalidates every link.
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { getJwtSecret } = require('../config/secrets');

const LINK_TTL_SECONDS = 2 * 60 * 60;
const ROUND_SECONDS = 60 * 60;
const ALLOWED_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const key = () => crypto.createHmac('sha256', getJwtSecret()).update('bsms-signed-uploads-v1').digest();
const sign = (urlPath, exp) => crypto.createHmac('sha256', key()).update(`${urlPath}\n${exp}`).digest('base64url');

/** '/uploads/cutlery-assets/x.jpg' -> '/uploads/cutlery-assets/x.jpg?exp=...&sig=...' */
const signUploadPath = (urlPath, now = Date.now()) => {
  const nowSec = Math.floor(now / 1000);
  const exp = Math.ceil((nowSec + LINK_TTL_SECONDS) / ROUND_SECONDS) * ROUND_SECONDS;
  return `${urlPath}?exp=${exp}&sig=${sign(urlPath, exp)}`;
};

/** Absolute signed URL of a stored file name in an /uploads sub folder, or null. */
const signedUploadUrl = (req, folder, fileName) => {
  if (!fileName) return null;
  const urlPath = `/uploads/${folder}/${encodeURIComponent(path.basename(String(fileName)))}`;
  return `${req.protocol}://${req.get('host')}${signUploadPath(urlPath)}`;
};

const verify = (urlPath, exp, sig, now = Date.now()) => {
  const expiry = Number(exp);
  if (!Number.isInteger(expiry) || expiry * 1000 < now || typeof sig !== 'string') return false;
  const expected = Buffer.from(sign(urlPath, expiry));
  const given = Buffer.from(sig);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

/**
 * Express handler for app.use('/uploads', ...): signature check, then the
 * static files with safe headers (no directory listing, no dotfiles, no
 * content sniffing, only image types).
 */
const serveSignedUploads = (root) => {
  const files = express.static(root, {
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.set('Cache-Control', 'private, max-age=3600');
    }
  });
  return (req, res, next) => {
    const urlPath = `/uploads${req.path}`;
    if (!ALLOWED_EXTENSIONS.includes(path.extname(req.path).toLowerCase())) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!verify(urlPath, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: 'This file link is invalid or has expired. Reload the page.' });
    }
    // A missing file is a plain 404 here (not passed on to the global error
    // handler, which would answer 500 and log a server path).
    return files(req, res, (error) => {
      if (error && (error.status === 404 || error.statusCode === 404)) return res.status(404).json({ error: 'Not found' });
      return next(error);
    });
  };
};

module.exports = { signUploadPath, signedUploadUrl, serveSignedUploads, verify, ALLOWED_EXTENSIONS, LINK_TTL_SECONDS };
