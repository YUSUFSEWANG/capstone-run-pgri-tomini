'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const adminService = require('../services/admin.service');
const settingsService = require('../services/settings.service');
const registrationService = require('../services/registration.service');
const exportService = require('../services/export.service');
const { requireAdminPage, requireAdminApi, requireRole } = require('../middleware/auth');
const { loginLimiter, readLimiter } = require('../middleware/rateLimit');
const { loginSchema, adminAccountSchema, verifySchema, rejectSchema, toFieldErrors } = require('../utils/schemas');
const { PAYMENT_STATUS_LABEL, PACKAGES, EVENT, BANK, JERSEY_SIZES } = require('../config/constants');
const { toWaNumber, rupiah, formatDateId, prettyPhone } = require('../utils/format');

const router = express.Router();
const fail = (res, status, errors) => res.status(status).json({ ok: false, errors });

// Halaman dashboard disimpan di `views/`, bukan `public/`, supaya tidak bisa
// dibuka langsung sebagai berkas statis tanpa melewati pemeriksaan sesi.
const page = (name) => (_req, res) => res.sendFile(path.join(env.paths.views, 'admin', name));

// ------------------------------------------------------------------ laman
router.get('/admin/login', (req, res) => {
  if (req.session?.admin) return res.redirect('/admin');
  return res.sendFile(path.join(env.paths.views, 'admin', 'login.html'));
});
router.get('/admin', requireAdminPage, page('dashboard.html'));
router.get('/admin/peserta', requireAdminPage, page('peserta.html'));
router.get('/admin/pengaturan', requireAdminPage, page('pengaturan.html'));

// -------------------------------------------------------------- otentikasi
router.post('/api/admin/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const admin = adminService.authenticate(parsed.data.username, parsed.data.password);
  if (!admin) {
    return fail(res, 401, [{ field: '_', message: 'Username atau password salah.' }]);
  }

  req.session.regenerate((error) => {
    if (error) return fail(res, 500, [{ field: '_', message: 'Gagal membuat sesi. Coba lagi.' }]);
    req.session.admin = admin;
    adminService.log(admin, 'masuk', 'admin', admin.id, null);
    return res.json({ ok: true, admin });
  });
});

router.post('/api/admin/logout', (req, res) => {
  const admin = req.session?.admin;
  if (admin) adminService.log(admin, 'keluar', 'admin', admin.id, null);
  req.session.destroy(() => {
    res.clearCookie('frpt.sid');
    res.json({ ok: true });
  });
});

router.get('/api/admin/me', requireAdminApi, (req, res) => {
  res.json({ ok: true, admin: req.session.admin });
});

router.post('/api/admin/password', requireAdminApi, (req, res) => {
  const result = adminService.changePassword(
    req.session.admin.id,
    req.body.current_password,
    req.body.new_password
  );
  if (!result.ok) return fail(res, 422, result.errors);
  adminService.log(req.session.admin, 'ganti-password', 'admin', req.session.admin.id, null);
  res.json({ ok: true, message: 'Password berhasil diganti.' });
});

// ----------------------------------------------------------- akun panitia
// Hanya ketua yang boleh mengelola akun; password baru dibuat server dan
// ditampilkan sekali saja, tidak pernah bisa dibaca ulang.
const ketuaSaja = [requireAdminApi, requireRole('ketua')];

router.get('/api/admin/accounts', ...ketuaSaja, (req, res) => {
  res.json({ ok: true, accounts: adminService.listAdmins(), me: req.session.admin.id });
});

router.post('/api/admin/accounts', ...ketuaSaja, (req, res) => {
  const parsed = adminAccountSchema.safeParse(req.body || {});
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const result = adminService.createAdmin(parsed.data, req.session.admin);
  if (!result.ok) return fail(res, result.status || 400, result.errors);

  res.status(201).json({
    ok: true,
    message: `Akun ${result.admin.username} dibuat. Catat passwordnya sekarang — tidak bisa dilihat lagi.`,
    account: result.admin,
    password: result.password,
  });
});

router.post('/api/admin/accounts/:id/reset-password', ...ketuaSaja, (req, res) => {
  const result = adminService.resetAdminPassword(req.params.id, req.session.admin);
  if (!result.ok) return fail(res, result.status || 400, result.errors);

  res.json({
    ok: true,
    message: `Password ${result.admin.username} diganti. Catat sekarang — tidak bisa dilihat lagi.`,
    account: result.admin,
    password: result.password,
  });
});

router.delete('/api/admin/accounts/:id', ...ketuaSaja, (req, res) => {
  const result = adminService.removeAdmin(req.params.id, req.session.admin);
  if (!result.ok) return fail(res, result.status || 400, result.errors);
  res.json({ ok: true, message: 'Akun dihapus.' });
});

// --------------------------------------------------------------- dashboard
router.get('/api/admin/stats', requireAdminApi, readLimiter, (_req, res) => {
  const state = settingsService.registrationState();
  res.json({
    ok: true,
    stats: adminService.stats(),
    registration: {
      open: state.open,
      reason: state.reason,
      quota: state.quota,
      taken: state.taken,
      remaining: state.remaining,
    },
    activity: adminService.recentActivity(12),
    event: { ...EVENT, raceDateLabel: formatDateId(EVENT.raceDate, { withDay: true }) },
  });
});

// ----------------------------------------------------------------- peserta
router.get('/api/admin/participants', requireAdminApi, readLimiter, (req, res) => {
  const result = adminService.listParticipants({
    search: req.query.search,
    status: req.query.status,
    pkg: req.query.package,
    jersey: req.query.jersey,
    page: req.query.page,
    perPage: req.query.per_page,
    sort: req.query.sort,
  });

  res.json({
    ok: true,
    ...result,
    rows: result.rows.map(adminShape),
  });
});

router.get('/api/admin/participants/:id', requireAdminApi, (req, res) => {
  const row = adminService.getParticipant(req.params.id);
  if (!row) return fail(res, 404, [{ field: '_', message: 'Peserta tidak ditemukan.' }]);
  res.json({ ok: true, participant: adminShape(row, { full: true }) });
});

/** Bukti bayar hanya boleh dilihat panitia yang sudah masuk. */
router.get('/api/admin/participants/:id/proof', requireAdminApi, (req, res) => {
  const row = adminService.getParticipant(req.params.id);
  if (!row || !row.payment_proof) {
    return fail(res, 404, [{ field: '_', message: 'Peserta ini belum mengunggah bukti.' }]);
  }

  // path.basename menolak upaya keluar dari folder uploads.
  const filePath = path.join(env.paths.uploads, path.basename(row.payment_proof));
  if (!fs.existsSync(filePath)) {
    return fail(res, 404, [{ field: '_', message: 'Berkas bukti tidak ada lagi di server.' }]);
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
  res.type(type);
  res.setHeader('Content-Disposition', `inline; filename="bukti-${row.reg_number}${ext}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

router.post('/api/admin/participants/:id/verify', requireAdminApi, (req, res) => {
  const parsed = verifySchema.safeParse(req.body || {});
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const result = adminService.verify(req.params.id, req.session.admin, parsed.data.note);
  if (!result.ok) return fail(res, result.status || 400, result.errors);

  res.json({
    ok: true,
    message: `Pembayaran sah. Nomor BIB ${result.participant.bib_number} sudah dipasang.`,
    participant: adminShape(result.participant, { full: true }),
  });
});

router.post('/api/admin/participants/:id/reject', requireAdminApi, (req, res) => {
  const parsed = rejectSchema.safeParse(req.body || {});
  if (!parsed.success) return fail(res, 422, toFieldErrors(parsed.error));

  const result = adminService.reject(req.params.id, req.session.admin, parsed.data.note);
  if (!result.ok) return fail(res, result.status || 400, result.errors);

  res.json({
    ok: true,
    message: result.bibDilepas
      ? `Bukti ditolak dan nomor BIB ${result.bibDilepas} dilepas. Peserta bisa mengunggah ulang lewat halaman Cek Pendaftaran.`
      : 'Bukti ditolak. Peserta bisa mengunggah ulang lewat halaman Cek Pendaftaran.',
    participant: adminShape(result.participant, { full: true }),
  });
});

router.delete('/api/admin/participants/:id', requireAdminApi, requireRole('ketua'), (req, res) => {
  const result = adminService.remove(req.params.id, req.session.admin);
  if (!result.ok) return fail(res, result.status || 400, result.errors);
  res.json({ ok: true, message: 'Pendaftaran dihapus dan jatah jerseynya dikembalikan.' });
});

// ---------------------------------------------------------------- setelan
router.get('/api/admin/settings', requireAdminApi, (_req, res) => {
  res.json({
    ok: true,
    settings: settingsService.all(),
    jersey: registrationService.jerseyAvailability(),
    state: settingsService.registrationState(),
    sizes: JERSEY_SIZES,
  });
});

router.put('/api/admin/settings', requireAdminApi, (req, res) => {
  const result = settingsService.update(req.body || {});
  if (!result.ok) return fail(res, 422, result.errors);
  adminService.log(req.session.admin, 'ubah-setelan', 'settings', null, JSON.stringify(req.body));
  res.json({ ok: true, message: 'Setelan tersimpan.', settings: result.settings });
});

router.put('/api/admin/jersey', requireAdminApi, (req, res) => {
  const result = adminService.setJerseyQuota(req.body || {}, req.session.admin);
  if (!result.ok) return fail(res, 422, result.errors);
  res.json({ ok: true, message: 'Kuota jersey tersimpan.', jersey: result.jersey });
});

// ----------------------------------------------------------------- ekspor
router.get('/api/admin/export/:dataset', requireAdminApi, (req, res) => {
  const file = exportService.build(req.params.dataset);
  if (!file) {
    return fail(res, 404, [
      { field: '_', message: `Pilihan ekspor tersedia: ${exportService.available().join(', ')}.` },
    ]);
  }

  adminService.log(req.session.admin, 'ekspor', 'csv', req.params.dataset, `${file.count} baris`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
});

// ------------------------------------------------------------------ bentuk
function adminShape(row, { full = false } = {}) {
  const wa = toWaNumber(row.phone);
  const base = {
    id: row.id,
    reg_number: row.reg_number,
    bib_number: row.bib_number,
    full_name: row.full_name,
    gender: row.gender,
    phone: row.phone,
    phone_pretty: prettyPhone(row.phone),
    institution: row.institution,
    package: row.package,
    package_label: PACKAGES[row.package]?.label || row.package,
    jersey_size: row.jersey_size,
    amount: row.amount,
    amount_label: rupiah(row.amount),
    unique_code: row.unique_code,
    payment_status: row.payment_status,
    status_label: PAYMENT_STATUS_LABEL[row.payment_status],
    has_proof: Boolean(row.payment_proof),
    proof_is_pdf: /\.pdf$/i.test(row.payment_proof || ''),
    proof_uploaded_at: row.proof_uploaded_at,
    verified_at: row.verified_at,
    verifier_name: row.verifier_name || null,
    admin_note: row.admin_note,
    created_at: row.created_at,
    wa_link: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waTemplate(row))}` : null,
  };

  if (!full) return base;

  return {
    ...base,
    birth_date: row.birth_date,
    email: row.email,
    address: row.address,
    emergency_name: row.emergency_name,
    emergency_phone: row.emergency_phone,
    emergency_phone_pretty: prettyPhone(row.emergency_phone),
    blood_type: row.blood_type,
    health_note: row.health_note,
  };
}

/** Pesan siap kirim, isinya menyesuaikan status peserta. */
function waTemplate(row) {
  const halo = `Halo ${row.full_name}, ini panitia ${EVENT.name}.`;

  if (row.payment_status === 'verified') {
    return [
      halo,
      '',
      `Pembayaranmu sudah kami verifikasi. Nomor BIB kamu: ${row.bib_number}.`,
      `Nomor registrasi: ${row.reg_number}`,
      '',
      `Sampai ketemu ${formatDateId(EVENT.raceDate, { withDay: true })} di ${EVENT.location}.`,
      'Kartu peserta bisa diunduh di halaman Cek Pendaftaran.',
    ].join('\n');
  }

  if (row.payment_status === 'rejected') {
    return [
      halo,
      '',
      `Bukti pembayaran untuk nomor registrasi ${row.reg_number} belum bisa kami terima.`,
      `Alasan: ${row.admin_note || 'bukti tidak terbaca'}.`,
      '',
      'Unggah ulang buktinya di halaman Cek Pendaftaran ya. Terima kasih.',
    ].join('\n');
  }

  if (row.payment_status === 'review') {
    return [
      halo,
      '',
      `Bukti pembayaranmu untuk nomor registrasi ${row.reg_number} sudah kami terima dan sedang diperiksa.`,
      'Kami kabari lagi setelah selesai.',
    ].join('\n');
  }

  return [
    halo,
    '',
    `Pendaftaranmu tercatat dengan nomor registrasi ${row.reg_number}.`,
    `Mohon transfer ${rupiah(row.amount)} ke ${BANK.name} ${BANK.account} a.n. ${BANK.holder}.`,
    '',
    'Setelah transfer, unggah buktinya di halaman Cek Pendaftaran. Terima kasih.',
  ].join('\n');
}

module.exports = router;
