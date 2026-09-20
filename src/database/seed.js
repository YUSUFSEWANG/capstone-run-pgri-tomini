'use strict';

const bcrypt = require('bcryptjs');
const db = require('./db');
const env = require('../config/env');
const { buatSandi } = require('../services/admin.service');
const { JERSEY_SIZES, PACKAGES } = require('../config/constants');

/** Nilai awal setelan yang bisa diubah panitia dari dashboard. */
const DEFAULT_SETTINGS = {
  registration_open: 'auto', // auto | open | closed
  registration_start: '2026-09-21',
  registration_end: '2026-10-10',
  quota_total: '500',
  price_lengkap: String(PACKAGES.lengkap.price),
  price_hemat: String(PACKAGES.hemat.price),
  unique_code_enabled: 'false',
  announcement: '',
  whatsapp_group_url: '',
};

/**
 * Sebaran awal mengikuti kurva ukuran badan yang umum; panitia bisa ubah
 * di halaman Pengaturan setelah order ke vendor ditentukan.
 */
const DEFAULT_JERSEY_QUOTA = { S: 40, M: 120, L: 150, XL: 90, XXL: 40 };

function seedSettings() {
  const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING');
  db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value);
  })();
}

function seedJersey(quota = DEFAULT_JERSEY_QUOTA) {
  const insert = db.prepare('INSERT INTO jersey_stock (size, quota, used) VALUES (?, ?, 0) ON CONFLICT(size) DO NOTHING');
  db.transaction(() => {
    for (const size of JERSEY_SIZES) insert.run(size, quota[size] ?? 0);
  })();
}

function seedAdmin({ username, password, name } = env.seed) {
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (exists) return { dibuat: false, username };

  const sandi = password || buatSandi();

  db.prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run(
    username,
    bcrypt.hashSync(sandi, 12),
    name,
    'ketua'
  );
  return { dibuat: true, username, password: sandi, diacak: !password };
}

function jalankan(opsi = {}) {
  seedSettings();
  seedJersey(opsi.jerseyQuota);
  return seedAdmin(opsi.admin);
}

module.exports = { jalankan, seedSettings, seedJersey, seedAdmin, DEFAULT_SETTINGS, DEFAULT_JERSEY_QUOTA };

if (require.main === module) {
  const hasil = jalankan();
  if (hasil.dibuat) {
    console.log(`Admin dibuat -> username: ${hasil.username} | password: ${hasil.password}`);
    console.log(
      hasil.diacak
        ? 'Password ini dibuat acak dan hanya ditampilkan sekali. Catat sekarang.'
        : 'Ganti password ini sebelum situs dibuka untuk umum.'
    );
  } else {
    console.log(`Admin "${hasil.username}" sudah ada, dilewati.`);
  }
  console.log('Setelan awal dan stok jersey siap.');
}
