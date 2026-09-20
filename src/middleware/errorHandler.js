'use strict';

const path = require('path');
const env = require('../config/env');

const wantsJson = (req) =>
  req.path.startsWith('/api/') ||
  (req.get('accept') || '').includes('application/json');

function notFound(req, res) {
  if (wantsJson(req)) {
    return res.status(404).json({
      ok: false,
      errors: [{ field: '_', message: 'Alamat yang kamu tuju tidak ada.' }],
    });
  }
  return res.status(404).sendFile(path.join(env.paths.public, '404.html'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, _next) {
  const status = error.status || error.statusCode || 500;

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error(error);
  }

  const message =
    status >= 500
      ? 'Terjadi gangguan di server. Coba lagi sebentar lagi, atau hubungi panitia.'
      : error.message;

  if (wantsJson(req)) {
    return res.status(status).json({
      ok: false,
      errors: [{ field: error.field || '_', message }],
      ...(env.isProd ? {} : { stack: error.stack }),
    });
  }

  return res.status(status).sendFile(path.join(env.paths.public, '500.html'));
}

module.exports = { notFound, errorHandler };
