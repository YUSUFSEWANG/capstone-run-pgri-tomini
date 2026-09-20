'use strict';

const rateLimit = require('express-rate-limit');

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  // Rangkaian uji menembak banyak permintaan dari satu alamat; pembatas
  // dimatikan di sana supaya yang diuji tetap perilaku aplikasinya.
  skip: () => process.env.NODE_ENV === 'test',
};

const jsonMessage = (message) => (req, res) =>
  res.status(429).json({ ok: false, errors: [{ field: '_', message }] });

/** Cegah satu orang membanjiri pendaftaran dengan data palsu. */
const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 8,
  handler: jsonMessage('Terlalu banyak pendaftaran dari perangkat ini. Coba lagi satu jam lagi, atau hubungi panitia.'),
});

/** Lindungi akun panitia dari tebak password. */
const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: jsonMessage('Terlalu banyak percobaan masuk. Tunggu 15 menit lalu coba lagi.'),
});

const uploadLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: jsonMessage('Terlalu banyak unggahan. Tunggu sebentar lalu coba lagi.'),
});

const readLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 120,
  handler: jsonMessage('Terlalu banyak permintaan. Tunggu sebentar lalu muat ulang halaman.'),
});

module.exports = { registerLimiter, loginLimiter, uploadLimiter, readLimiter };
