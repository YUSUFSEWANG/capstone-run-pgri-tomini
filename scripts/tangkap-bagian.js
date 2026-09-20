'use strict';

/**
 * Tangkapan sebagian halaman untuk memeriksa satu komponen dari dekat.
 *   node scripts/tangkap-bagian.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 3112;
const ASAL = `http://127.0.0.1:${PORT}`;
const KELUARAN = path.join(__dirname, '..', 'storage', 'tangkapan');

const BAGIAN = [
  { nama: 'hero-meja', jalur: '/', pilih: '.hero', layar: { width: 1440, height: 1000 } },
  { nama: 'hero-hp', jalur: '/', pilih: '.hero', layar: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true } },
  { nama: 'benefit-meja', jalur: '/', pilih: '#benefit', layar: { width: 1440, height: 1000 } },
  { nama: 'paket-meja', jalur: '/', pilih: '#paket', layar: { width: 1440, height: 1000 } },
  { nama: 'langkah-meja', jalur: '/', pilih: '#cara-daftar', layar: { width: 1440, height: 1000 } },
  { nama: 'nav-hp', jalur: '/', pilih: '.nav', layar: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true } },
  { nama: 'rute-meja', jalur: '/', pilih: '#rute', layar: { width: 1440, height: 1000 } },
  { nama: 'form-atas-hp', jalur: '/pendaftaran', pilih: '.puncak', layar: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true } },
];

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

async function nyalakanServer() {
  const anak = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'app.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  anak.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch(`${ASAL}/sehat`)).ok) return anak;
    } catch (_e) { /* belum siap */ }
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
    executablePath: EDGE,
    headless: 'new',
    userDataDir: profil,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb'],
  });

  try {
    const halaman = await peramban.newPage();

    for (const b of BAGIAN) {
      await halaman.setViewport(b.layar);
      await halaman.goto(ASAL + b.jalur, { waitUntil: 'networkidle2' });
      await tunggu(800);
      await halaman.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      await halaman.evaluate(() => {
        document.querySelectorAll('.naik').forEach((el) => { el.dataset.tampil = 'true'; });
      });
      await tunggu(200);

      const elemen = await halaman.$(b.pilih);
      if (!elemen) { console.log(`- lewat ${b.nama}: ${b.pilih} tidak ada`); continue; }
      const berkas = path.join(KELUARAN, `${b.nama}.png`);
      await elemen.screenshot({ path: berkas });
      console.log(`✓ ${path.relative(process.cwd(), berkas)}`);
    }
  } finally {
    await peramban.close();
    server.kill();
    fs.rmSync(profil, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
