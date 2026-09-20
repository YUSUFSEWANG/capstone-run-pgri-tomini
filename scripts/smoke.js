'use strict';

/**
 * Uji asap cepat: menyalakan aplikasi di memori, memeriksa rute penting,
 * lalu keluar. Dipakai saat pengembangan, bukan bagian dari rangkaian uji.
 *   node scripts/smoke.js
 */

const request = require('supertest');
const app = require('../src/app');

const CEK = [
  ['GET', '/', 200],
  ['GET', '/pendaftaran', 200],
  ['GET', '/cek', 200],
  ['GET', '/api/info', 200],
  ['GET', '/api/jersey', 200],
  ['GET', '/css/tokens.css', 200],
  ['GET', '/css/main.css', 200],
  ['GET', '/js/api.js', 200],
  ['GET', '/js/main.js', 200],
  ['GET', '/assets/logo.svg', 200],
  ['GET', '/admin/login', 200],
  ['GET', '/admin', 302],
  ['GET', '/api/admin/stats', 401],
  ['GET', '/halaman-yang-tidak-ada', 404],
];

(async () => {
  let gagal = 0;

  for (const [metode, jalur, harap] of CEK) {
    try {
      const res = await request(app)[metode.toLowerCase()](jalur);
      const lolos = res.status === harap;
      if (!lolos) gagal += 1;
      console.log(`${lolos ? 'OK  ' : 'GAGAL'} ${metode} ${jalur} -> ${res.status} (harap ${harap})`);
    } catch (error) {
      gagal += 1;
      console.log(`GAGAL ${metode} ${jalur} -> ${error.message}`);
    }
  }

  const info = await request(app).get('/api/info');
  console.log('\n/api/info:');
  console.log('  pendaftaran dibuka :', info.body.registration?.open, `(${info.body.registration?.reason || 'tidak ada halangan'})`);
  console.log('  kuota              :', info.body.registration?.taken, '/', info.body.registration?.quota);
  console.log('  harga lengkap      :', info.body.packages?.[0]?.price);
  console.log('  harga hemat        :', info.body.packages?.[1]?.price);
  console.log('  stok jersey        :', info.body.jersey?.map((j) => `${j.size}:${j.remaining}`).join(' '));

  console.log(gagal ? `\n${gagal} pemeriksaan gagal.` : '\nSemua pemeriksaan lolos.');
  process.exit(gagal ? 1 : 0);
})();
