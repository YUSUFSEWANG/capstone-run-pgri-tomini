'use strict';

/**
 * Menjalankan uji end-to-end Cypress di atas server dan basis data sendiri,
 * supaya data asli panitia tidak tersentuh.
 *
 *   npm run test:e2e          jalankan tanpa tampilan
 *   npm run test:e2e:open     buka jendela Cypress
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const AKAR = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 3210);
const ASAL = `http://127.0.0.1:${PORT}`;
const AKUN = { username: 'panitia', password: 'UjiE2E2026!' };

const buka = process.argv.includes('--open');
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'frpt-e2e-'));
const basisData = path.join(folder, 'e2e.db');

const lingkungan = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(PORT),
  DATABASE_PATH: basisData,
  SESSION_SECRET: 'rahasia-e2e-yang-cukup-panjang-sekali',
  SEED_ADMIN_USERNAME: AKUN.username,
  SEED_ADMIN_PASSWORD: AKUN.password,
  SEED_ADMIN_NAME: 'Panitia E2E',
};

function langkah(judul, perintah, argumen) {
  process.stdout.write(`→ ${judul}\n`);
  const hasil = spawnSync(perintah, argumen, { cwd: AKAR, env: lingkungan, stdio: 'inherit', shell: false });
  if (hasil.status !== 0) throw new Error(`Gagal: ${judul}`);
}

async function nyalakanServer() {
  const anak = spawn(process.execPath, [path.join(AKAR, 'src', 'app.js')], {
    cwd: AKAR,
    env: lingkungan,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  anak.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${ASAL}/sehat`)).ok) return anak;
    } catch (_e) { /* belum siap */ }
    await tunggu(250);
  }
  anak.kill();
  throw new Error('Server e2e tidak kunjung siap.');
}

(async () => {
  let server = null;
  let kode = 1;

  try {
    langkah('Menyiapkan skema basis data uji', process.execPath, [path.join(AKAR, 'src', 'database', 'migrate.js')]);
    langkah('Mengisi setelan awal', process.execPath, [path.join(AKAR, 'src', 'database', 'seed.js')]);

    // Uji dijalankan kapan saja; jadwal pendaftaran dilewati agar formulir terbuka.
    langkah('Membuka pendaftaran', process.execPath, [
      '-e',
      "require('./src/services/settings.service').update({ registration_open: 'open' }); console.log('  pendaftaran dibuka');",
    ]);

    // Beberapa peserta contoh supaya penyaring dan dasbor punya isi.
    langkah('Membuat data contoh', process.execPath, [path.join(AKAR, 'scripts', 'seed-demo.js')]);

    process.stdout.write(`→ Menyalakan server di ${ASAL}\n`);
    server = await nyalakanServer();

    const cypress = require('cypress');
    const opsi = {
      config: { baseUrl: ASAL },
      env: { adminUser: AKUN.username, adminPass: AKUN.password },
    };

    const hasil = buka ? await cypress.open(opsi) : await cypress.run(opsi);
    kode = buka ? 0 : hasil.totalFailed > 0 ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    kode = 1;
  } finally {
    if (server) server.kill();
    await bersihkan();
  }

  process.exit(kode);
})();

/**
 * Windows menahan kunci berkas sesaat setelah proses anak ditutup, jadi
 * penghapusan dicoba beberapa kali sebelum menyerah. Folder sementara yang
 * tertinggal tidak berbahaya — sistem membersihkannya sendiri.
 */
async function bersihkan() {
  for (let percobaan = 0; percobaan < 8; percobaan += 1) {
    try {
      fs.rmSync(folder, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'EBUSY' && error.code !== 'EPERM') throw error;
      await tunggu(300);
    }
  }
  console.warn(`Folder sementara masih terkunci, dilewati: ${folder}`);
}
