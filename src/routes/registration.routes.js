'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const env = require('../config/env');
const registrationService = require('../services/registration.service');
const settingsService = require('../services/settings.service');
const { registrationSchema, checkSchema, toFieldErrors } = require('../utils/schemas');
const { registerLimiter, uploadLimiter, readLimiter } = require('../middleware/rateLimit');
const { uploadProof, verifyFileContent } = require('../middleware/upload');
const { EVENT, BANK, PACKAGES, PAYMENT_STATUS } = require('../config/constants');
const { normalizePhone, rupiah, formatDateId } = require('../utils/format');

const router = express.Router();

const fail = (res, status, errors) => res.status(status).json({ ok: false, errors });

// ----------------------------------------------------------- daftar baru
router.post('/api/registrations', registerLimiter, (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const result = registrationService.create(parsed.data);
  if (!result.ok) return fail(res, result.status || 422, result.errors);

  const participant = result.participant;

  // Ingat pendaftaran terakhir di sesi ini supaya halaman sukses bisa
  // menampilkan rinciannya tanpa meminta verifikasi nomor lagi.
  req.session.recent = req.session.recent || [];
  if (!req.session.recent.includes(participant.reg_number)) {
    req.session.recent.push(participant.reg_number);
    if (req.session.recent.length > 10) req.session.recent.shift();
  }

  res.status(201).json({
    ok: true,
    participant: registrationService.publicShape(participant),
    payment: buildPaymentInstruction(participant),
    group: infoGrup(),
  });
});

/**
 * Ajakan grup WhatsApp. Dikembalikan null bila panitia belum mengisi
 * tautannya di menu Pengaturan, sehingga seluruh bagian grup ikut hilang
 * dari tampilan tanpa perlu saklar terpisah.
 */
function infoGrup() {
  const url = settingsService.all().whatsapp_group_url;
  if (!url) return null;
  return {
    url,
    label: 'Grup WhatsApp Peserta',
    manfaat: [
      'Pengumuman jam start dan titik kumpul',
      'Jadwal pengambilan jersey dan nomor BIB',
      'Kabar terbaru dari panitia menjelang hari-H',
    ],
  };
}

/** Rincian transfer yang tampil di halaman sukses dan halaman cek. */
function buildPaymentInstruction(participant) {
  return {
    bank: BANK,
    amount: participant.amount,
    amountLabel: rupiah(participant.amount),
    basePrice: participant.amount - participant.unique_code,
    uniqueCode: participant.unique_code,
    note: participant.unique_code
      ? `Transfer tepat ${rupiah(participant.amount)} — termasuk kode unik ${participant.unique_code} supaya panitia bisa mencocokkan mutasi rekening.`
      : `Transfer ${rupiah(participant.amount)} sesuai ${PACKAGES[participant.package].label}.`,
  };
}

// --------------------------------------------------------------- cek status
router.get('/api/registrations/check', readLimiter, (req, res) => {
  const parsed = checkSchema.safeParse(req.query);
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const rows = registrationService.search(parsed.data.q);

  if (!rows.length) {
    return res.json({
      ok: true,
      results: [],
      message:
        'Belum ada pendaftaran dengan data itu. Periksa lagi nomor registrasi atau nomor WhatsApp yang kamu pakai saat daftar.',
    });
  }

  // Nomor registrasi mudah ditebak, jadi tautan grup hanya ikut dikirim
  // bila ada pendaftaran yang pembayarannya sudah disahkan panitia.
  const adaYangSah = rows.some((row) => row.payment_status === PAYMENT_STATUS.VERIFIED);

  res.json({
    ok: true,
    group: adaYangSah ? infoGrup() : null,
    results: rows.map((row) => ({
      ...registrationService.publicShape(row),
      payment: buildPaymentInstruction(row),
    })),
  });
});

// ------------------------------------------------------------ unggah bukti
/** Pastikan pendaftarannya ada sebelum berkas apa pun ditulis ke disk. */
function resolveParticipant(req, res, next) {
  const participant = registrationService.findByRegNumber(req.params.reg);
  if (!participant) {
    return fail(res, 404, [
      { field: '_', message: 'Nomor registrasi tidak ditemukan. Periksa lagi penulisannya.' },
    ]);
  }
  req.participant = participant;
  return next();
}

/**
 * Bukti kepemilikan ringan: 4 angka terakhir nomor WhatsApp pendaftar.
 * Cukup untuk mencegah orang lain mengunggah bukti ke nomor registrasi
 * yang bukan miliknya, tanpa memaksa peserta membuat akun.
 */
function verifyOwnership(req, res, next) {
  if (req.session?.recent?.includes(req.participant.reg_number)) return next();

  const supplied = String(req.body.phone_last4 || '').replace(/\D/g, '');
  const actual = normalizePhone(req.participant.phone) || '';

  if (supplied.length !== 4 || !actual.endsWith(supplied)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    return fail(res, 403, [
      { field: 'phone_last4', message: '4 angka terakhir nomor WhatsApp tidak cocok dengan data pendaftaran.' },
    ]);
  }
  return next();
}

router.post(
  '/api/registrations/:reg/proof',
  uploadLimiter,
  resolveParticipant,
  uploadProof,
  verifyFileContent,
  verifyOwnership,
  (req, res) => {
    const result = registrationService.attachProof(req.participant.id, req.file.filename);

    if (!result.ok) {
      fs.rm(req.file.path, { force: true }, () => {});
      return fail(res, result.status || 400, result.errors);
    }

    // Bukti lama tidak dipakai lagi — hapus supaya penyimpanan tidak menumpuk.
    if (result.previousProof && result.previousProof !== req.file.filename) {
      fs.rm(path.join(env.paths.uploads, result.previousProof), { force: true }, () => {});
    }

    res.json({
      ok: true,
      message: 'Bukti pembayaran terkirim. Panitia akan memeriksanya, biasanya dalam 1x24 jam.',
      participant: registrationService.publicShape(result.participant),
    });
  }
);

// ------------------------------------------------------------ kartu peserta
router.get('/api/registrations/:reg/card', readLimiter, resolveParticipant, async (req, res, next) => {
  const participant = req.participant;

  if (participant.payment_status !== PAYMENT_STATUS.VERIFIED) {
    return fail(res, 409, [
      {
        field: '_',
        message:
          'Kartu peserta terbit setelah pembayaran diverifikasi panitia. Cek status pendaftaranmu dulu.',
      },
    ]);
  }

  try {
    const verifyUrl = `${req.protocol}://${req.get('host')}/cek?q=${participant.reg_number}`;
    const qr = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#0A1128', light: '#FFFFFF' },
    });

    res.json({
      ok: true,
      card: {
        reg_number: participant.reg_number,
        bib_number: participant.bib_number,
        full_name: participant.full_name,
        gender: participant.gender,
        institution: participant.institution,
        package_label: PACKAGES[participant.package].label,
        jersey_size: participant.jersey_size,
        blood_type: participant.blood_type,
        emergency_name: participant.emergency_name,
        emergency_phone: participant.emergency_phone,
        event: {
          name: EVENT.name,
          date: formatDateId(EVENT.raceDate, { withDay: true }),
          location: `${EVENT.location}, ${EVENT.province}`,
          distance: `${EVENT.distanceKm} KM`,
        },
        qr,
        verifyUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------- ketersediaan jersey live
router.get('/api/jersey', readLimiter, (_req, res) => {
  res.json({
    ok: true,
    jersey: registrationService.jerseyAvailability(),
    registration: settingsService.registrationState().open,
  });
});

module.exports = router;
