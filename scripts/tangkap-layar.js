'use strict';

/**
 * Menangkap tampilan seluruh halaman memakai Microsoft Edge yang sudah
 * terpasang di mesin ini. Dipakai untuk memeriksa hasil desain saat
 * pengembangan — bukan bagian dari aplikasi yang dijalankan di server.
 *
 *   node scripts/tangkap-layar.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const KANDIDAT_EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const PORT = 3111;
const ASAL = `http://127.0.0.1:${PORT}`;
const KELUARAN = path.join(__dirname, '..', 'storage', 'tangkapan');

const LAYAR = {
  meja: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  hp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Sengaja tanpa nilai cadangan: password di kode sumber ikut terbit ke repositori. */
function sandiPanitia() {
  const sandi = process.env.SEED_ADMIN_PASSWORD;
  if (!sandi) {
    throw new Error(
      'SEED_ADMIN_PASSWORD belum diisi. Setel dulu di lingkungan, contoh:\n' +
      '  $env:SEED_ADMIN_PASSWORD = "<password panitia>"; node scripts/tangkap-layar.js'
    );
  }
  return sandi;
}

const HALAMAN = [
  { nama: 'beranda', jalur: '/', layar: ['meja', 'hp'], penuh: true },
  { nama: 'pendaftaran', jalur: '/pendaftaran', layar: ['meja', 'hp'], penuh: true },
  { nama: 'cek', jalur: '/cek', layar: ['meja'], penuh: true },
  { nama: 'cek-hasil', jalur: '/cek?q=FRPT-2026-0017', layar: ['meja', 'hp'], penuh: true },
  { nama: 'cek-ditolak', jalur: '/cek?q=FRPT-2026-0014', layar: ['meja'], penuh: true },
  { nama: 'kartu', jalur: '/kartu/FRPT-2026-0003', layar: ['meja', 'hp'], penuh: true },
  { nama: 'admin-masuk', jalur: '/admin/login', layar: ['meja'], penuh: false },
  { nama: 'admin-dasbor', jalur: '/admin', layar: ['meja'], penuh: true, perluMasuk: true },
  { nama: 'admin-peserta', jalur: '/admin/peserta', layar: ['meja'], penuh: true, perluMasuk: true },
  { nama: 'admin-pengaturan', jalur: '/admin/pengaturan', layar: ['meja'], penuh: true, perluMasuk: true },
];

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

function cariPeramban() {
  const ketemu = KANDIDAT_EDGE.find((p) => fs.existsSync(p));
  if (!ketemu) throw new Error('Edge atau Chrome tidak ditemukan di lokasi yang biasa.');
  return ketemu;
}

async function nyalakanServer() {
  const anak = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'app.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  anak.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  for (let percobaan = 0; percobaan < 40; percobaan += 1) {
    try {
      const res = await fetch(`${ASAL}/sehat`);
      if (res.ok) return anak;
    } catch (_error) { /* belum siap */ }
    await tunggu(250);
  }

  anak.kill();
  throw new Error('Server tidak kunjung siap.');
}

(async () => {
  fs.mkdirSync(KELUARAN, { recursive: true });

  const server = await nyalakanServer();
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'frpt-profil-'));

  const peramban = await puppeteer.launch({
    executablePath: cariPeramban(),
    headless: 'new',
    userDataDir: profil,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb'],
  });

  try {
    const halaman = await peramban.newPage();

    // Masuk sekali; kukinya dipakai ulang untuk semua halaman panitia.
    await halaman.goto(`${ASAL}/admin/login`, { waitUntil: 'networkidle2' });
    await halaman.type('input[name="username"]', process.env.SEED_ADMIN_USERNAME || 'panitia');
    await halaman.type('input[name="password"]', sandiPanitia());
    await Promise.all([
      halaman.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      halaman.click('button[type="submit"]'),
    ]);

    for (const item of HALAMAN) {
      for (const namaLayar of item.layar) {
        await halaman.setViewport(LAYAR[namaLayar]);
        await halaman.goto(ASAL + item.jalur, { waitUntil: 'networkidle2' });
        await tunggu(900); // beri waktu animasi masuk dan pengambilan data selesai

        // Matikan animasi supaya tangkapan konsisten antar percobaan.
        await halaman.addStyleTag({
          content: '*,*::before,*::after{animation:none!important;transition:none!important}',
        });
        await halaman.evaluate(() => {
          document.querySelectorAll('.naik').forEach((el) => { el.dataset.tampil = 'true'; });
        });
        await tunggu(250);

        const berkas = path.join(KELUARAN, `${item.nama}-${namaLayar}.png`);
        await halaman.screenshot({ path: berkas, fullPage: item.penuh });
        console.log(`✓ ${path.relative(process.cwd(), berkas)}`);
      }
    }
  } finally {
    await peramban.close();
    server.kill();
    fs.rmSync(profil, { recursive: true, force: true });
  }

  console.log(`\nTangkapan layar ada di ${path.relative(process.cwd(), KELUARAN)}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
