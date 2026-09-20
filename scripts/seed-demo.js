'use strict';

/**
 * Isi basis data dengan pendaftaran contoh untuk mencoba dasbor panitia.
 *   node scripts/seed-demo.js          tambah 48 peserta contoh
 *   node scripts/seed-demo.js --bersih hapus dulu semua peserta contoh
 *
 * JANGAN dijalankan di server produksi.
 */

const db = require('../src/database/db');
const registrationService = require('../src/services/registration.service');
const settingsService = require('../src/services/settings.service');
const { buildRegNumber } = require('../src/utils/identifier');

if (process.env.NODE_ENV === 'production') {
  console.error('Skrip ini menolak berjalan saat NODE_ENV=production.');
  process.exit(1);
}

if (process.argv.includes('--bersih')) {
  db.exec("DELETE FROM participants; DELETE FROM activity_log WHERE target_type = 'participant';");
  db.exec('UPDATE jersey_stock SET used = 0;');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'participants';");
  // Kembalikan saklar yang tadi dipaksa terbuka oleh mode demo.
  settingsService.update({ registration_open: 'auto' });
  console.log('Data peserta dibersihkan. Pendaftaran dikembalikan ke "ikut jadwal".');
  process.exit(0);
}

// Formulir harus terbuka supaya layanan pendaftaran mau menerima data.
settingsService.update({ registration_open: 'open' });

const DEPAN_L = ['Ahmad', 'Muhammad', 'Rizky', 'Fajar', 'Yusuf', 'Andi', 'Hasan', 'Iqbal', 'Taufik', 'Rahmat', 'Ilham', 'Agus', 'Bayu', 'Dedi', 'Hendra', 'Reza'];
const DEPAN_P = ['Siti', 'Nur', 'Fitri', 'Dewi', 'Indah', 'Ayu', 'Rina', 'Sari', 'Wulan', 'Ratna', 'Hasna', 'Lestari', 'Putri', 'Maya', 'Anisa', 'Yuliana'];
const BELAKANG = ['Saputra', 'Wijaya', 'Ramadhan', 'Pratama', 'Lahay', 'Tompo', 'Mangesa', 'Hasanuddin', 'Latif', 'Mokoginta', 'Panai', 'Datunsolang', 'Maulana', 'Kaluku', 'Sumantri', 'Bungasawa'];
const INSTANSI = [
  'SDN 1 Tomini', 'SDN 2 Tomini', 'SDN 3 Tomini', 'SMPN 1 Tomini', 'SMPN 2 Tomini',
  'SMAN 1 Tomini', 'MTs Al-Khairaat Tomini', 'TK Pertiwi Tomini', 'PGRI Ranting Tomini', 'Umum',
];
const KESEHATAN = [null, null, null, null, 'Asma ringan', 'Alergi obat sulfa', 'Riwayat hipertensi', null, 'Maag'];
const GOLONGAN = ['A', 'B', 'AB', 'O', 'Tidak tahu'];
const UKURAN = ['S', 'M', 'L', 'XL', 'XXL'];

const acak = (larik) => larik[Math.floor(Math.random() * larik.length)];
const angka = (min, maks) => Math.floor(Math.random() * (maks - min + 1)) + min;

function buatPeserta(urutan) {
  const lakiLaki = Math.random() < 0.55;
  const nama = `${acak(lakiLaki ? DEPAN_L : DEPAN_P)} ${acak(BELAKANG)}`;
  const paket = Math.random() < 0.68 ? 'lengkap' : 'hemat';

  return {
    full_name: nama,
    gender: lakiLaki ? 'L' : 'P',
    birth_date: `${angka(1968, 2010)}-${String(angka(1, 12)).padStart(2, '0')}-${String(angka(1, 28)).padStart(2, '0')}`,
    phone: `08${angka(11, 59)}${String(angka(10000000, 99999999))}`.slice(0, 13),
    email: Math.random() < 0.45 ? `${nama.toLowerCase().replace(/\s+/g, '.')}${urutan}@email.com` : null,
    address: `Desa ${acak(['Tomini', 'Bambasiang', 'Lobu', 'Ogotumubu', 'Sibalago'])}, Kec. Tomini`,
    institution: acak(INSTANSI),
    package: paket,
    jersey_size: paket === 'lengkap' ? acak(UKURAN) : null,
    emergency_name: `${acak([...DEPAN_L, ...DEPAN_P])} ${acak(BELAKANG)}`,
    emergency_phone: `08${angka(11, 59)}${String(angka(10000000, 99999999))}`.slice(0, 13),
    blood_type: acak(GOLONGAN),
    health_note: acak(KESEHATAN),
    agreement: true,
  };
}

const JUMLAH = 48;
const dibuat = [];
let gagal = 0;

for (let i = 1; i <= JUMLAH; i += 1) {
  const hasil = registrationService.create(buatPeserta(i));
  if (hasil.ok) dibuat.push(hasil.participant);
  else gagal += 1;
}

// Sebarkan status supaya dasbor menunjukkan keempat keadaan sekaligus.
const admin = db.prepare('SELECT id, name FROM admins ORDER BY id LIMIT 1').get();
let bib = 1000;

const sebar = db.transaction(() => {
  dibuat.forEach((p, indeks) => {
    const undi = Math.random();
    const waktuMundur = `-${angka(0, 20)} days`;

    db.prepare("UPDATE participants SET created_at = datetime('now', ?) WHERE id = ?").run(waktuMundur, p.id);

    if (undi < 0.58) {
      bib += 1;
      db.prepare(`
        UPDATE participants
           SET payment_status = 'verified', payment_proof = 'contoh.jpg',
               proof_uploaded_at = datetime('now', ?), verified_at = datetime('now', ?),
               verified_by = ?, bib_number = ?
         WHERE id = ?
      `).run(waktuMundur, waktuMundur, admin ? admin.id : null, String(bib), p.id);
    } else if (undi < 0.78) {
      db.prepare(`
        UPDATE participants SET payment_status = 'review', payment_proof = 'contoh.jpg',
               proof_uploaded_at = datetime('now', ?) WHERE id = ?
      `).run(waktuMundur, p.id);
    } else if (undi < 0.87) {
      db.prepare(`
        UPDATE participants SET payment_status = 'rejected', payment_proof = 'contoh.jpg',
               proof_uploaded_at = datetime('now', ?),
               admin_note = 'Nominal transfer tidak sesuai dengan paket yang dipilih.'
         WHERE id = ?
      `).run(waktuMundur, p.id);
    }
    // Sisanya dibiarkan berstatus "pending".

    void indeks;
  });
});

sebar();

const rekap = db.prepare('SELECT payment_status, COUNT(*) AS n FROM participants GROUP BY payment_status').all();

console.log(`\n${dibuat.length} peserta contoh dibuat${gagal ? ` (${gagal} gagal, kemungkinan stok jersey habis)` : ''}.`);
console.log(`Rentang nomor registrasi: ${buildRegNumber(1)} … ${dibuat[dibuat.length - 1]?.reg_number}`);
rekap.forEach((r) => console.log(`  ${r.payment_status.padEnd(9)} ${r.n}`));
console.log('\nCatatan: berkas bukti pembayaran hanya nama palsu, jadi pratinjau di laci akan kosong.');
console.log('Pendaftaran disetel "paksa buka" supaya formulir bisa dicoba.');
