'use strict';

/**
 * Fakta tetap acara. Nilai yang bisa berubah di tengah jalan (harga, kuota,
 * tanggal tutup pendaftaran) disimpan di tabel `settings`, bukan di sini.
 */

const EVENT = {
  name: 'Fun Run PGRI Tomini 2026',
  shortName: 'Fun Run PGRI Tomini',
  tagline: 'Sehat Bersama, Solid Berkarya, Semarakkan Tomini',
  distanceKm: 7,
  raceDate: '2026-11-24', // Selasa
  raceDateLabel: 'Selasa, 24 November 2026',
  location: 'Tomini, Kabupaten Parigi Moutong',
  province: 'Sulawesi Tengah',
};

const BANK = {
  name: 'Bank BRI',
  account: '036301026063507',
  holder: 'M. IZHAR IL',
};

const CONTACTS = [
  { name: 'Munawir', phone: '081243740109', display: '0812 4374 0109' },
  { name: 'Isfar', phone: '082348148054', display: '0823 4814 8054' },
];

const PACKAGES = {
  lengkap: {
    code: 'lengkap',
    label: 'Paket Lengkap',
    price: 120000,
    withJersey: true,
    perks: [
      'Jersey resmi Fun Run PGRI Tomini 2026',
      'Nomor BIB peserta',
      'Medali finisher',
      'Refreshment di garis finis',
      'Ikut undian doorprize',
    ],
  },
  hemat: {
    code: 'hemat',
    label: 'Paket Hemat',
    price: 60000,
    withJersey: false,
    perks: [
      'Nomor BIB peserta',
      'Medali finisher',
      'Refreshment di garis finis',
      'Ikut undian doorprize',
    ],
  },
};

const JERSEY_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/** Ukuran badan (cm) untuk tabel panduan ukuran jersey. */
const JERSEY_CHART = [
  { size: 'S', chest: 48, length: 68 },
  { size: 'M', chest: 50, length: 70 },
  { size: 'L', chest: 52, length: 72 },
  { size: 'XL', chest: 54, length: 74 },
  { size: 'XXL', chest: 56, length: 76 },
];

const GENDERS = ['L', 'P'];

const BLOOD_TYPES = ['A', 'B', 'AB', 'O', 'Tidak tahu'];

/** Alur status pembayaran. */
const PAYMENT_STATUS = {
  PENDING: 'pending', // terdaftar, belum kirim bukti
  REVIEW: 'review', // bukti masuk, menunggu panitia
  VERIFIED: 'verified', // lunas & sah
  REJECTED: 'rejected', // bukti ditolak, peserta harus unggah ulang
};

const PAYMENT_STATUS_LABEL = {
  pending: 'Menunggu pembayaran',
  review: 'Menunggu verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Bukti ditolak',
};

const UPLOAD = {
  maxBytes: 5 * 1024 * 1024, // 5 MB
  allowedMime: ['image/jpeg', 'image/png', 'application/pdf'],
  allowedExt: ['.jpg', '.jpeg', '.png', '.pdf'],
};

const REG_PREFIX = 'FRPT-2026';

module.exports = {
  EVENT,
  BANK,
  CONTACTS,
  PACKAGES,
  JERSEY_SIZES,
  JERSEY_CHART,
  GENDERS,
  BLOOD_TYPES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABEL,
  UPLOAD,
  REG_PREFIX,
};
