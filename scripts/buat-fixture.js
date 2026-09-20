'use strict';

/**
 * Membuat berkas contoh "bukti transfer" untuk dipakai uji end-to-end.
 * Dihasilkan sebagai JPEG sungguhan supaya pemeriksaan tanda tangan byte
 * di sisi server ikut teruji.
 *
 *   node scripts/buat-fixture.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const KANDIDAT = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const TUJUAN = path.join(__dirname, '..', 'cypress', 'fixtures', 'bukti.jpg');

const STRUK = `
<!doctype html><html lang="id"><meta charset="utf-8">
<body style="margin:0;width:420px;font:14px/1.6 system-ui,sans-serif;color:#0a1128;background:#fff">
  <div style="padding:22px;border-bottom:3px solid #0b3fd9">
    <div style="font-size:11px;letter-spacing:.18em;color:#666">BUKTI TRANSFER</div>
    <div style="font-size:22px;font-weight:800;color:#0b3fd9">BANK BRI</div>
  </div>
  <div style="padding:22px">
    <div style="font-size:11px;letter-spacing:.14em;color:#666">NOMINAL</div>
    <div style="font-size:30px;font-weight:800;margin-bottom:18px">Rp120.000</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#666">Tujuan</td><td style="text-align:right;font-weight:700">036301026063507</td></tr>
      <tr><td style="padding:6px 0;color:#666">Nama</td><td style="text-align:right;font-weight:700">M. IZHAR IL</td></tr>
      <tr><td style="padding:6px 0;color:#666">Berita</td><td style="text-align:right;font-weight:700">Fun Run PGRI Tomini</td></tr>
      <tr><td style="padding:6px 0;color:#666">Waktu</td><td style="text-align:right;font-weight:700">24/09/2026 09:14</td></tr>
      <tr><td style="padding:6px 0;color:#666">Referensi</td><td style="text-align:right;font-weight:700">TRX8841920356</td></tr>
    </table>
    <div style="margin-top:20px;padding:10px;background:#e4fbef;border:2px solid #0a7a44;border-radius:6px;
                text-align:center;font-weight:800;color:#0a7a44">TRANSAKSI BERHASIL</div>
    <p style="margin-top:18px;font-size:10px;color:#999;text-align:center">
      Berkas contoh untuk pengujian. Bukan bukti transaksi sungguhan.
    </p>
  </div>
</body></html>`;

(async () => {
  const peramban = await puppeteer.launch({
    executablePath: KANDIDAT.find((p) => fs.existsSync(p)),
    headless: 'new',
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'frpt-fx-')),
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const halaman = await peramban.newPage();
  await halaman.setViewport({ width: 420, height: 520 });
  await halaman.setContent(STRUK, { waitUntil: 'load' });

  fs.mkdirSync(path.dirname(TUJUAN), { recursive: true });
  await halaman.screenshot({ path: TUJUAN, type: 'jpeg', quality: 82 });
  await peramban.close();

  const ukuran = fs.statSync(TUJUAN).size;
  const kepala = fs.readFileSync(TUJUAN).subarray(0, 3).toString('hex');
  console.log(`${path.relative(process.cwd(), TUJUAN)} — ${(ukuran / 1024).toFixed(1)} KB, tanda tangan ${kepala} (ffd8ff = JPEG sah)`);
})().catch((e) => { console.error(e); process.exit(1); });
