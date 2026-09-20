'use strict';

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);

const env = require('./config/env');
const db = require('./database/db');
const publicRoutes = require('./routes/public.routes');
const registrationRoutes = require('./routes/registration.routes');
const adminRoutes = require('./routes/admin.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', 1);

// ------------------------------------------------------------------ keamanan
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Google Fonts mengirim CSS dari domainnya sendiri; style inline dipakai
        // untuk nilai dinamis seperti lebar bar grafik.
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'self'", 'blob:'], // pratinjau bukti bayar berformat PDF
        frameSrc: ["'self'", 'blob:'],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: env.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ------------------------------------------------------------------- sesi
/**
 * Penyimpan sesi bawaan memasang setInterval tanpa menyimpan acuannya,
 * sehingga proses tidak pernah berhenti sendiri. Di sini pewaktunya
 * di-unref supaya Node boleh keluar, dan disimpan agar bisa dihentikan.
 */
class PenyimpanSesi extends SqliteStore {
  startInterval() {
    this.pewaktu = setInterval(this.clearExpiredSessions.bind(this), this.expired.intervalMs);
    if (typeof this.pewaktu.unref === 'function') this.pewaktu.unref();
  }

  hentikan() {
    clearInterval(this.pewaktu);
  }
}

const penyimpanSesi = new PenyimpanSesi({
  client: db,
  expired: { clear: true, intervalMs: 15 * 60 * 1000 },
});

app.use(
  session({
    name: 'frpt.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: penyimpanSesi,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAge: 8 * 60 * 60 * 1000, // 8 jam, cukup untuk satu sesi kerja panitia
    },
  })
);

// ------------------------------------------------------------------ parser
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ------------------------------------------------------------ berkas statis
app.use(
  express.static(env.paths.public, {
    index: false,
    maxAge: env.isProd ? '7d' : 0,
    setHeaders: (res, filePath) => {
      // HTML selalu diambil baru supaya perubahan panitia langsung terlihat.
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// ------------------------------------------------------------------- rute
app.get('/sehat', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use(publicRoutes);
app.use(registrationRoutes);
app.use(adminRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(env.port, () => {
    console.log('Fun Run PGRI Tomini 2026');
    console.log(`Situs  : http://localhost:${env.port}`);
    console.log(`Panitia: http://localhost:${env.port}/admin`);
    console.log(`Mode   : ${env.nodeEnv}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} sudah dipakai proses lain.`);
      console.error('Hentikan proses itu dulu, atau jalankan dengan port lain:');
      console.error(`  PORT=3001 npm start        (Windows: set PORT=3001 && npm start)`);
      process.exit(1);
    }
    if (error.code === 'EACCES') {
      console.error(`Tidak punya izin memakai port ${env.port}. Pakai port di atas 1024.`);
      process.exit(1);
    }
    throw error;
  });

  // Tutup sambungan dengan rapi supaya tulisan ke basis data tidak terpotong.
  const matikan = (sinyal) => () => {
    console.log(`\n${sinyal} diterima, menutup server…`);
    server.close(() => {
      penyimpanSesi.hentikan();
      try {
        db.close();
      } catch (_error) { /* sudah tertutup */ }
      process.exit(0);
    });
    // Jaring pengaman kalau ada sambungan yang menggantung.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', matikan('SIGINT'));
  process.on('SIGTERM', matikan('SIGTERM'));
}

module.exports = app;
module.exports.penyimpanSesi = penyimpanSesi;
