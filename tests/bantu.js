'use strict';

/**
 * Menyiapkan basis data sementara untuk setiap berkas uji, lalu memuat
 * aplikasi. Wajib dipanggil SEBELUM `require` apa pun dari src/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function siapkan() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'frpt-uji-'));

  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'rahasia-uji-yang-cukup-panjang';
  process.env.DATABASE_PATH = path.join(folder, 'uji.db');
  process.env.SEED_ADMIN_USERNAME = 'panitiauji';
  process.env.SEED_ADMIN_PASSWORD = 'RahasiaUji2026!';
  process.env.SEED_ADMIN_NAME = 'Panitia Uji';

  const db = require('../src/database/db');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'schema.sql'), 'utf8'));

  const seed = require('../src/database/seed');
  seed.jalankan();

  const app = require('../src/app');

  return {
    folder,
    db,
    app,
    akun: { username: process.env.SEED_ADMIN_USERNAME, password: process.env.SEED_ADMIN_PASSWORD },
    bersihkan() {
      if (app.penyimpanSesi) app.penyimpanSesi.hentikan();
      try {
        db.close();
      } catch (_error) { /* sudah tertutup */ }
      fs.rmSync(folder, { recursive: true, force: true });
    },
  };
}

/** Data pendaftaran lengkap yang lolos validasi; timpa bagian yang perlu. */
function pesertaContoh(ubah = {}) {
  return {
    full_name: 'Siti Rahmawati',
    gender: 'P',
    birth_date: '1995-04-17',
    phone: '081234567890',
    email: 'siti@email.com',
    address: 'Desa Tomini, Kec. Tomini',
    institution: 'SDN 1 Tomini',
    package: 'lengkap',
    jersey_size: 'M',
    emergency_name: 'Ahmad Saputra',
    emergency_phone: '082233445566',
    blood_type: 'O',
    health_note: '',
    agreement: true,
    ...ubah,
  };
}

/** Berkas JPEG kecil yang sah, dipakai sebagai bukti pembayaran palsu. */
const JPEG_SAH = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

module.exports = { siapkan, pesertaContoh, JPEG_SAH };
