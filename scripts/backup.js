'use strict';

/**
 * Menyalin basis data ke folder storage/backups dengan cap waktu.
 * Memakai perintah VACUUM INTO milik SQLite, jadi aman dijalankan
 * ketika situs sedang melayani peserta.
 *
 *   npm run db:backup
 *   npm run db:backup -- --simpan 30     simpan 30 salinan terakhir
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/database/db');
const env = require('../src/config/env');

const argumen = process.argv.slice(2);
const bacaAngka = (nama, bawaan) => {
  const indeks = argumen.indexOf(nama);
  if (indeks === -1) return bawaan;
  const nilai = Number.parseInt(argumen[indeks + 1], 10);
  return Number.isNaN(nilai) ? bawaan : nilai;
};

const SIMPAN = bacaAngka('--simpan', 14);

fs.mkdirSync(env.paths.backups, { recursive: true });

const capWaktu = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const tujuan = path.join(env.paths.backups, `funrun-${capWaktu}.db`);

// VACUUM INTO menghasilkan salinan yang konsisten tanpa mengunci penulisan.
db.prepare('VACUUM INTO ?').run(tujuan);

const ukuran = fs.statSync(tujuan).size;
const peserta = db.prepare('SELECT COUNT(*) AS n FROM participants').get().n;

console.log(`Cadangan dibuat: ${path.relative(process.cwd(), tujuan)}`);
console.log(`  ${(ukuran / 1024).toFixed(1)} KB · ${peserta} pendaftaran`);

// Buang salinan lama supaya folder tidak menggelembung.
const lama = fs
  .readdirSync(env.paths.backups)
  .filter((nama) => /^funrun-.*\.db$/.test(nama))
  .sort()
  .reverse()
  .slice(SIMPAN);

lama.forEach((nama) => {
  fs.rmSync(path.join(env.paths.backups, nama), { force: true });
  console.log(`  dihapus: ${nama}`);
});

console.log(`Menyimpan maksimal ${SIMPAN} salinan terakhir.`);
