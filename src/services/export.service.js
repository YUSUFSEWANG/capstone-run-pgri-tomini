'use strict';

const db = require('../database/db');
const { toCsv, formatDateId, formatDateTimeId, ageOn, rupiah } = require('../utils/format');
const { PACKAGES, PAYMENT_STATUS_LABEL, EVENT } = require('../config/constants');
const registrationService = require('./registration.service');

const GENDER_LABEL = { L: 'Laki-laki', P: 'Perempuan' };

const DATASETS = {
  /** Semua data peserta — untuk arsip panitia. */
  peserta: {
    filename: 'peserta-funrun-pgri-tomini-2026',
    query: () => db.prepare('SELECT * FROM participants ORDER BY id ASC').all(),
    columns: [
      { header: 'No. Registrasi', value: 'reg_number' },
      { header: 'No. BIB', value: (r) => r.bib_number || '' },
      { header: 'Nama Lengkap', value: 'full_name' },
      { header: 'Jenis Kelamin', value: (r) => GENDER_LABEL[r.gender] || r.gender },
      { header: 'Tanggal Lahir', value: (r) => formatDateId(r.birth_date) },
      { header: 'Usia saat Acara', value: (r) => ageOn(r.birth_date, EVENT.raceDate) },
      { header: 'No. WhatsApp', value: 'phone' },
      { header: 'Email', value: (r) => r.email || '' },
      { header: 'Alamat', value: (r) => r.address || '' },
      { header: 'Instansi / Ranting', value: (r) => r.institution || '' },
      { header: 'Paket', value: (r) => PACKAGES[r.package]?.label || r.package },
      { header: 'Ukuran Jersey', value: (r) => r.jersey_size || '-' },
      { header: 'Nominal', value: 'amount' },
      { header: 'Status', value: (r) => PAYMENT_STATUS_LABEL[r.payment_status] },
      { header: 'Kontak Darurat', value: (r) => r.emergency_name || '' },
      { header: 'No. Kontak Darurat', value: (r) => r.emergency_phone || '' },
      { header: 'Gol. Darah', value: (r) => r.blood_type || '' },
      { header: 'Catatan Kesehatan', value: (r) => r.health_note || '' },
      { header: 'Waktu Daftar', value: (r) => formatDateTimeId(r.created_at) },
      { header: 'Waktu Verifikasi', value: (r) => formatDateTimeId(r.verified_at) },
      { header: 'Catatan Panitia', value: (r) => r.admin_note || '' },
    ],
  },

  /** Daftar hadir hari-H — hanya peserta sah, diurutkan per nomor BIB. */
  'daftar-hadir': {
    filename: 'daftar-hadir-funrun-pgri-tomini-2026',
    query: () =>
      db.prepare(`
        SELECT * FROM participants
         WHERE payment_status = 'verified'
         ORDER BY CAST(bib_number AS INTEGER) ASC
      `).all(),
    columns: [
      { header: 'No. BIB', value: 'bib_number' },
      { header: 'Nama Lengkap', value: 'full_name' },
      { header: 'L/P', value: 'gender' },
      { header: 'Usia', value: (r) => ageOn(r.birth_date, EVENT.raceDate) },
      { header: 'Instansi / Ranting', value: (r) => r.institution || '' },
      { header: 'Paket', value: (r) => PACKAGES[r.package]?.label || r.package },
      { header: 'Jersey', value: (r) => r.jersey_size || '-' },
      { header: 'Gol. Darah', value: (r) => r.blood_type || '' },
      { header: 'Catatan Kesehatan', value: (r) => r.health_note || '' },
      { header: 'Kontak Darurat', value: (r) => `${r.emergency_name || ''} (${r.emergency_phone || '-'})` },
      { header: 'Paraf', value: () => '' },
    ],
  },

  /** Rekap ukuran jersey — dibawa ke vendor sablon. */
  jersey: {
    filename: 'rekap-jersey-funrun-pgri-tomini-2026',
    query: () => {
      const ordered = Object.fromEntries(
        db.prepare(`
          SELECT jersey_size, payment_status, COUNT(*) AS n FROM participants
           WHERE jersey_size IS NOT NULL GROUP BY jersey_size, payment_status
        `).all().map((r) => [`${r.jersey_size}|${r.payment_status}`, r.n])
      );
      return registrationService.jerseyAvailability().map((row) => ({
        size: row.size,
        quota: row.quota,
        verified: ordered[`${row.size}|verified`] || 0,
        review: ordered[`${row.size}|review`] || 0,
        pending: ordered[`${row.size}|pending`] || 0,
        used: row.used,
        remaining: row.remaining,
      }));
    },
    columns: [
      { header: 'Ukuran', value: 'size' },
      { header: 'Kuota Disiapkan', value: 'quota' },
      { header: 'Lunas (Terverifikasi)', value: 'verified' },
      { header: 'Menunggu Verifikasi', value: 'review' },
      { header: 'Belum Bayar', value: 'pending' },
      { header: 'Total Terpesan', value: 'used' },
      { header: 'Sisa Kuota', value: 'remaining' },
    ],
  },

  /** Rekap uang masuk — untuk bendahara. */
  keuangan: {
    filename: 'rekap-keuangan-funrun-pgri-tomini-2026',
    query: () =>
      db.prepare(`
        SELECT * FROM participants
         WHERE payment_status IN ('verified', 'review')
         ORDER BY verified_at IS NULL, verified_at ASC, id ASC
      `).all(),
    columns: [
      { header: 'No. Registrasi', value: 'reg_number' },
      { header: 'Nama Lengkap', value: 'full_name' },
      { header: 'Paket', value: (r) => PACKAGES[r.package]?.label || r.package },
      { header: 'Nominal Dasar', value: (r) => r.amount - r.unique_code },
      { header: 'Kode Unik', value: (r) => r.unique_code || 0 },
      { header: 'Total Transfer', value: 'amount' },
      { header: 'Status', value: (r) => PAYMENT_STATUS_LABEL[r.payment_status] },
      { header: 'Bukti Diunggah', value: (r) => formatDateTimeId(r.proof_uploaded_at) },
      { header: 'Diverifikasi', value: (r) => formatDateTimeId(r.verified_at) },
    ],
  },
};

function build(datasetName) {
  const dataset = DATASETS[datasetName];
  if (!dataset) return null;

  const rows = dataset.query();
  const csv = toCsv(rows, dataset.columns);
  const stamp = new Date().toISOString().slice(0, 10);

  return {
    filename: `${dataset.filename}-${stamp}.csv`,
    // BOM supaya huruf beraksen tampil benar saat dibuka di Excel.
    body: '\uFEFF' + csv,
    count: rows.length,
  };
}

const available = () => Object.keys(DATASETS);

module.exports = { build, available, rupiah };
