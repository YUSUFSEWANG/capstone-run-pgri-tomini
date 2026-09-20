# Fun Run PGRI Tomini 2026

Situs resmi sekaligus sistem pendaftaran online untuk Fun Run PGRI Tomini 2026 —
lari 7 kilometer di pesisir Teluk Tomini, Kabupaten Parigi Moutong, Sulawesi Tengah,
Selasa 24 November 2026.

Peserta mendaftar lewat HP, mengunggah bukti transfer, lalu memantau statusnya sendiri.
Panitia memverifikasi pembayaran, menerbitkan nomor BIB, dan mengunduh rekap dari satu dasbor.

---

## Isi singkat

| Bagian | Keterangan |
|---|---|
| Situs publik | Beranda, formulir pendaftaran, cek status, kartu peserta |
| Panel panitia | Dasbor angka, tabel peserta, verifikasi pembayaran, pengaturan |
| Basis data | SQLite satu berkas — mudah dipindah dan dicadangkan |
| Tanpa langkah build | HTML/CSS/JS biasa; ubah berkas, muat ulang halaman |

---

## Menjalankan di komputer sendiri

Butuh Node.js 20 atau lebih baru.

```bash
npm install          # pasang paket
copy .env.example .env   # (Linux/macOS: cp .env.example .env)
npm run db:migrate   # buat tabel
npm run db:seed      # isi setelan awal + akun panitia pertama
npm run dev          # jalankan dengan muat ulang otomatis
```

Buka:

- Situs peserta — <http://localhost:3000>
- Panel panitia — <http://localhost:3000/admin>

Akun panitia pertama dibuat oleh `npm run db:seed`. Bila `SEED_ADMIN_PASSWORD`
di `.env` dibiarkan kosong, passwordnya **dibuat acak dan dicetak sekali** di terminal —
catat saat itu juga. Tidak ada password bawaan yang tertulis di kode atau di repositori.

Lupa? Jalankan `npm run db:reset` untuk mulai dari nol, atau minta ketua lain
meresetkannya lewat **Pengaturan → Akun panitia**.

Ingin melihat dasbor terisi? `npm run demo` membuat 48 pendaftaran contoh
dengan status campur, lalu memaksa pendaftaran terbuka.
Hapus lagi dengan `node scripts/seed-demo.js --bersih`.

---

## Perintah yang tersedia

| Perintah | Kegunaan |
|---|---|
| `npm start` | Jalankan server (produksi) |
| `npm run dev` | Jalankan dengan muat ulang otomatis |
| `npm run db:migrate` | Buat/segarkan skema (`-- --fresh` untuk mulai dari nol) |
| `npm run db:seed` | Isi setelan awal, stok jersey, dan akun panitia |
| `npm run db:reset` | Hapus basis data lalu bangun ulang dari awal |
| `npm run db:backup` | Salin basis data ke `storage/backups/` |
| `npm test` | 107 uji unit + integrasi (Jest + Supertest) |
| `npm run test:e2e` | 18 uji alur di peramban sungguhan (Cypress) |
| `npm run smoke` | Periksa cepat semua rute utama |
| `npm run demo` | Buat data peserta contoh |
| `npm run tangkap` | Tangkapan layar semua halaman (butuh Edge/Chrome) |

---

## Panduan panitia

### Membuka dan menutup pendaftaran

Menu **Pengaturan** punya tiga pilihan saklar:

- **Ikut jadwal** — formulir membuka sendiri pada tanggal buka dan menutup pada tanggal tutup.
- **Paksa buka** — formulir terbuka walau di luar jadwal.
- **Paksa tutup** — formulir tertutup walau masih dalam jadwal.

Kuota penuh selalu menutup pendaftaran, apa pun pilihan saklarnya.
Keadaan yang sebenarnya selalu ditampilkan di kotak paling atas halaman Pengaturan
dan di dasbor, supaya formulir tidak tertutup tanpa disadari.

### Memverifikasi pembayaran

1. Buka **Peserta**, pilih penyaring status *Menunggu verifikasi*.
2. Klik barisnya. Laci di sisi kanan menampilkan bukti transfer berdampingan dengan data peserta.
3. Cocokkan nominal dan waktu transfer dengan mutasi rekening.
4. **Sahkan pembayaran** → nomor BIB terbit otomatis dan kartu peserta bisa diunduh peserta.
   **Tolak bukti** → tulis alasannya; peserta melihat alasan itu di halaman Cek Pendaftaran
   dan bisa mengunggah ulang.
5. Tombol **Kirim WhatsApp** membuka percakapan dengan pesan yang sudah tersusun
   sesuai status peserta.

Nomor BIB dimulai dari 1001 dan diberikan berurutan sesuai urutan verifikasi.

Bila peserta yang sudah disahkan ternyata ditolak, nomor BIB-nya **dilepas** dan
kartu pesertanya ikut hangus — tidak boleh ada nomor balapan tanpa pembayaran yang sah.
Nomor yang dilepas kembali tersedia untuk peserta berikutnya. Panel meminta konfirmasi
lebih dulu, dan jejak aksi mencatat nomor mana yang dilepas.

### Akun panitia

Menu **Pengaturan** punya bagian **Akun panitia** yang hanya terlihat oleh peran `ketua`.
Beri setiap orang akunnya sendiri — jejak aksi di dasbor mencatat siapa yang
memverifikasi pembayaran siapa, dan itu hanya berguna kalau akunnya tidak dipakai beramai-ramai.

| Peran | Boleh |
|---|---|
| `ketua` | Semua, termasuk mengelola akun dan menghapus pendaftaran |
| `panitia` | Verifikasi, tolak bukti, ekspor, ubah setelan |

Password dibuat acak oleh server dan **ditampilkan sekali saja** — tidak pernah bisa
dilihat ulang, karena yang disimpan hanya hashnya. Kalau lupa, klik **Reset password**
untuk menerbitkan yang baru. Pemilik akun bisa menggantinya sendiri lewat **Ganti password**.

Akun yang sedang dipakai tidak bisa menghapus dirinya sendiri. Itu sekaligus menjamin
selalu tersisa minimal satu ketua.

> Menghapus akun membuat nama pemverifikasi hilang dari data peserta yang pernah ia
> sahkan. Jejak aksi tetap utuh karena menyimpan nama secara terpisah.

### Kode unik pada nominal

Bila dinyalakan di Pengaturan, setiap peserta baru mendapat tambahan 3 angka
pada nominal transfernya (mis. Rp120.**137**), sehingga mutasi rekening mudah dicocokkan
tanpa menebak. **Nyalakan sebelum pendaftaran dibuka** — peserta yang sudah terdaftar
tidak ikut berubah nominalnya.

### Rekap yang bisa diunduh

| Berkas | Isi | Dipakai untuk |
|---|---|---|
| Semua peserta | Seluruh kolom, semua status | Arsip panitia |
| Daftar hadir hari-H | Peserta sah, urut nomor BIB, ada kolom paraf | Meja daftar ulang |
| Rekap ukuran jersey | Jumlah per ukuran + sisa kuota | Order ke vendor sablon |
| Rekap keuangan | Nominal, kode unik, waktu verifikasi | Laporan bendahara |

Semua berkas CSV memakai penanda BOM sehingga huruf beraksen tampil benar di Excel.

### Mencadangkan data

```bash
npm run db:backup                # simpan 14 salinan terakhir
npm run db:backup -- --simpan 30 # simpan 30 salinan terakhir
```

Salinan masuk ke `storage/backups/`. Aman dijalankan saat situs sedang dipakai.
Jadwalkan lewat Task Scheduler (Windows) atau cron (Linux) minimal sekali sehari
selama masa pendaftaran.

> **Yang wajib ikut dicadangkan:** berkas `storage/funrun.db` **dan** folder
> `storage/uploads/` (bukti pembayaran). Keduanya saling melengkapi.

---

## Susunan berkas

```
src/
  app.js                    rakitan Express: keamanan, sesi, rute
  config/
    constants.js            fakta tetap acara: tanggal, rekening, paket, ukuran
    env.js                  pembacaan .env dan jalur folder
  database/
    schema.sql              definisi tabel
    db.js                   sambungan SQLite (mode WAL)
    migrate.js  seed.js     penyiapan skema dan data awal
  middleware/
    auth.js                 penjaga halaman & endpoint panitia
    upload.js               multer + pemeriksaan tanda tangan byte berkas
    rateLimit.js            pembatas laju pendaftaran, unggahan, dan login
    errorHandler.js         penanganan 404 dan 500
  services/
    registration.service.js pendaftaran, stok jersey, bukti bayar
    admin.service.js        otentikasi, statistik, verifikasi, jejak aksi
    settings.service.js     setelan yang bisa diubah panitia
    export.service.js       penyusun berkas CSV
  routes/                   public, registration, admin
  utils/
    format.js               nomor telepon, rupiah, tanggal, CSV
    identifier.js           nomor registrasi & nomor BIB
    schemas.js              aturan validasi (Zod)

public/                     berkas yang boleh diakses siapa saja
  index.html  pendaftaran.html  cek.html  kartu.html  404.html  500.html
  css/  tokens.css  main.css  halaman.css  admin.css
  js/   api.js  main.js  pendaftaran.js  cek.js  kartu.js  admin-*.js
  assets/

views/admin/                halaman panitia — sengaja di luar public/
  login.html  dashboard.html  peserta.html  pengaturan.html

storage/                    tidak pernah disajikan langsung ke publik
  funrun.db                 basis data
  uploads/                  bukti pembayaran
  backups/                  salinan basis data

tests/
  unit/                     format, penomoran, aturan validasi
  integrasi/alur.test.js    alur lengkap lewat HTTP
cypress/e2e/                alur lengkap lewat peramban
scripts/                    cadangan, data contoh, tangkapan layar, runner e2e
```

---

## Catatan desain

Arah visualnya **poster risograph balapan**: blok warna rata, bayangan keras,
tipografi kondensat, tekstur butiran cetak.

- **Warna** diambil dari Teluk Tomini dan obor lambang PGRI: ultramarin `#0B3FD9`,
  pirus `#00D4E6`, merah `#FF2E4D`, kuning `#FFD400`, pasir `#FFF8EE`, tinta `#0A1128`.
- **Huruf**: *Big Shoulders Display* untuk judul (kondensat atletik, bahasa visual papan
  penanda), *Plus Jakarta Sans* untuk isi (tipografi buatan Indonesia), *Martian Mono*
  untuk data seperti nomor rekening, harga, dan penanda kilometer.
- **Penanda halaman**: beranda dibagi menjadi **KM 1 sampai KM 7**, bukan "bagian 1–7".
  Rel di tepi kiri bergerak mengikuti gulir; menggulir halaman = menempuh rute.
  Di layar kecil rel berubah menjadi penghitung kilometer di bawah navigasi.
- **Kartu peserta** dan panel kanan hero digambar menyerupai nomor BIB sungguhan,
  lengkap dengan empat lubang peniti.

Ubah token desain di satu tempat: `public/css/tokens.css`.

---

## Keamanan

- Kata sandi panitia disimpan sebagai hash bcrypt (12 putaran). Waktu tanggapan login
  dibuat seragam agar tidak membocorkan username mana yang terdaftar.
- **Tidak ada password bawaan di kode sumber.** Akun pertama memakai password acak
  yang dicetak sekali oleh `db:seed`; `.env.example` sengaja mengirim nilai kosong.
- Password akun baru dibuat server dengan `crypto.randomInt` dan hanya dikirim sekali
  ke peramban pembuatnya. Daftar akun tidak pernah menyertakan kolom hash.
- Pengelolaan akun dibatasi peran `ketua`, diperiksa di server — menyembunyikan menunya
  di peramban saja tidak dianggap cukup.
- Sesi memakai cookie `httpOnly`, `sameSite=lax`, dan `secure` saat `NODE_ENV=production`.
  Sesi disimpan di basis data, bukan di memori, sehingga tidak hilang saat server dimuat ulang.
- Unggahan bukti diperiksa dua lapis: jenis MIME + ekstensi, lalu **tanda tangan byte
  awal berkas**. Berkas yang isinya tidak cocok dengan ekstensinya langsung dibuang.
  Batas 5 MB, satu berkas per kiriman, nama berkas asli dibuang total.
- Bukti pembayaran disimpan di `storage/uploads/` — **di luar folder publik** — dan hanya
  bisa dibuka lewat endpoint yang memeriksa sesi panitia.
- Semua kueri memakai prepared statement; seluruh nilai yang dimasukkan ke HTML di sisi
  peramban di-escape.
- Header keamanan dipasang lewat Helmet, termasuk Content Security Policy.
- Pembatas laju: 8 pendaftaran/jam, 20 unggahan/15 menit, 10 percobaan login/15 menit,
  per alamat IP.
- Halaman panitia disimpan di `views/`, bukan `public/`, sehingga tidak bisa dibuka
  sebagai berkas statis tanpa melewati pemeriksaan sesi.
- Ekspor CSV melindungi diri dari penyuntikan rumus spreadsheet.

**Sebelum situs dibuka untuk umum:**

1. Isi `SESSION_SECRET` dengan nilai acak:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Setel `NODE_ENV=production`.
3. Ganti password panitia lewat menu Pengaturan.
4. Pastikan `.env` tidak pernah ikut ter-commit — sudah tercantum di `.gitignore`.
5. Pasang HTTPS. Bila berada di belakang nginx/Railway/Render, setel `TRUST_PROXY=true`.
6. Jadwalkan `npm run db:backup` harian.

---

## Pengujian

```bash
npm test          # 107 uji: format, validasi, dan alur lengkap lewat HTTP
npm run test:e2e  # 18 uji: alur peserta dan panitia di peramban sungguhan
```

Uji integrasi dan e2e masing-masing memakai basis data sementara sendiri,
jadi data asli panitia tidak akan tersentuh.

Cakupan uji integrasi meliputi: pendaftaran dan penomoran registrasi, pengurangan stok
jersey, penolakan ukuran yang habis, pendaftaran saat formulir ditutup, pencarian status,
penolakan berkas palsu, bukti kepemilikan saat unggah, otentikasi panitia, pengelolaan
akun panitia beserta batas perannya, verifikasi dan penerbitan BIB, penolakan bukti,
ekspor CSV, serta penerbitan kartu peserta.

---

## Memasang di server

Aplikasi ini satu proses Node dan satu berkas basis data, jadi bisa dijalankan di
VPS, Railway, Render, atau cPanel yang mendukung Node.

```bash
npm ci --omit=dev
NODE_ENV=production node src/app.js
```

Pakai pengelola proses (`pm2`, `systemd`) agar server hidup kembali setelah mati.
Letakkan nginx di depannya untuk HTTPS, lalu setel `TRUST_PROXY=true`.

> **Hindari hosting yang menghapus berkas saat penyebaran ulang** (mis. Vercel, Netlify).
> Basis data dan bukti pembayaran ada di `storage/` dan harus bertahan antar penyebaran.

---

## Hal yang perlu diputuskan panitia

1. **Aset resmi.** `public/assets/logo.svg` masih lambang sementara. Ganti berkasnya
   dengan lambang PGRI resmi beresolusi tinggi bila sudah tersedia — nama berkasnya
   tidak perlu diubah.
2. **Hadiah juara.** Halaman Benefit menyebut "rincian diumumkan menjelang hari
   pelaksanaan". Perbarui teksnya di `public/index.html` setelah kategori dan nominal final.
3. **Kuota jersey.** Angka awal (S 40, M 120, L 150, XL 90, XXL 40) adalah perkiraan.
   Sesuaikan di menu Pengaturan setelah order ke vendor ditetapkan.
4. **Masa pendaftaran.** Terpasang 21 September – 10 Oktober 2026 sesuai pengumuman.
   Bisa diperpanjang kapan saja lewat menu Pengaturan tanpa mengubah kode.

---

Diselenggarakan oleh PGRI Kecamatan Tomini, Kabupaten Parigi Moutong, Sulawesi Tengah.
*Sehat bersama, solid berkarya, semarakkan Tomini.*
