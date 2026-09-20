'use strict';

const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..', '..');

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const env = {
  root: ROOT,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-jangan-dipakai-di-produksi',
  trustProxy: bool(process.env.TRUST_PROXY, false),

  paths: {
    public: path.join(ROOT, 'public'),
    views: path.join(ROOT, 'views'),
    storage: path.join(ROOT, 'storage'),
    uploads: path.join(ROOT, 'storage', 'uploads'),
    backups: path.join(ROOT, 'storage', 'backups'),
    database: process.env.DATABASE_PATH || path.join(ROOT, 'storage', 'funrun.db'),
  },

  seed: {
    username: process.env.SEED_ADMIN_USERNAME || 'panitia',
    // Tanpa nilai bawaan: password yang tertulis di kode sumber ikut terbit
    // ke repositori. Bila kosong, `db:seed` membuatkan yang acak.
    password: process.env.SEED_ADMIN_PASSWORD || null,
    name: process.env.SEED_ADMIN_NAME || 'Panitia Fun Run',
  },
};

if (env.isProd && env.sessionSecret.startsWith('dev-secret')) {
  throw new Error('SESSION_SECRET wajib diisi saat NODE_ENV=production.');
}

module.exports = env;
