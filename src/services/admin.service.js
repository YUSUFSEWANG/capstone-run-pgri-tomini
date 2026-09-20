'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const env = require('../config/env');
const registrationService = require('./registration.service');
const { PAYMENT_STATUS, PACKAGES, JERSEY_SIZES } = require('../config/constants');
const { BIB_START } = require('../utils/identifier');

const STMT = {
  adminByUsername: db.prepare('SELECT * FROM admins WHERE username = ?'),
  touchLogin: db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?"),
  insertLog: db.prepare(`
    INSERT INTO activity_log (admin_id, admin_name, action, target_type, target_id, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  recentLog: db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?'),
  nextBib: db.prepare(`
    SELECT COALESCE(MAX(CAST(bib_number AS INTEGER)), ?) + 1 AS next
      FROM participants WHERE bib_number IS NOT NULL
  `),
  verify: db.prepare(`
    UPDATE participants
       SET payment_status = 'verified', verified_at = datetime('now'),
           verified_by = ?, bib_number = COALESCE(bib_number, ?), admin_note = ?
     WHERE id = ?
  `),
  // Menolak bukti membatalkan kesahan pembayaran, jadi nomor BIB ikut dilepas.
  // Tanpa ini peserta yang ditolak tetap tampil memegang nomor balapan.
  reject: db.prepare(`
    UPDATE participants
       SET payment_status = 'rejected', admin_note = ?, verified_at = NULL, verified_by = NULL,
           bib_number = NULL
     WHERE id = ?
  `),
  remove: db.prepare('DELETE FROM participants WHERE id = ?'),
  updateStockQuota: db.prepare('UPDATE jersey_stock SET quota = ? WHERE size = ?'),
  changePassword: db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?'),
};

/** Kolom akun yang aman dikirim ke peramban — hash password tidak pernah ikut. */
const AKUN_KOLOM = 'id, username, name, role, last_login_at, created_at';

// Huruf dan angka yang mudah tertukar (0 O 1 l I) sengaja dibuang supaya
// password bisa dibacakan lewat telepon tanpa salah dengar.
const ALFABET_SANDI = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

const buatSandi = (panjang = 12) =>
  Array.from({ length: panjang }, () => ALFABET_SANDI[crypto.randomInt(ALFABET_SANDI.length)]).join('');

// -------------------------------------------------------------- otentikasi
function authenticate(username, password) {
  const admin = STMT.adminByUsername.get(String(username).trim());
  // Selalu jalankan bcrypt walau user tidak ada, supaya waktu responsnya
  // tidak membocorkan username mana yang terdaftar.
  const hash = admin ? admin.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO';
  const valid = bcrypt.compareSync(String(password), hash);
  if (!admin || !valid) return null;
  STMT.touchLogin.run(admin.id);
  return { id: admin.id, username: admin.username, name: admin.name, role: admin.role };
}

function changePassword(adminId, currentPassword, newPassword) {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
  if (!admin || !bcrypt.compareSync(String(currentPassword), admin.password_hash)) {
    return { ok: false, errors: [{ field: 'current_password', message: 'Password lama tidak cocok.' }] };
  }
  if (String(newPassword).length < 8) {
    return { ok: false, errors: [{ field: 'new_password', message: 'Password baru minimal 8 karakter.' }] };
  }
  STMT.changePassword.run(bcrypt.hashSync(String(newPassword), 12), adminId);
  return { ok: true };
}

// -------------------------------------------------------------------- log
function log(admin, action, targetType, targetId, detail) {
  STMT.insertLog.run(admin?.id ?? null, admin?.name ?? 'sistem', action, targetType ?? null, targetId ? String(targetId) : null, detail ?? null);
}

const recentActivity = (limit = 12) => STMT.recentLog.all(limit);

// ---------------------------------------------------------- akun panitia
const akunById = (id) => db.prepare(`SELECT ${AKUN_KOLOM} FROM admins WHERE id = ?`).get(Number(id));

const listAdmins = () =>
  db.prepare(`SELECT ${AKUN_KOLOM} FROM admins ORDER BY role ASC, username ASC`).all();

function createAdmin({ username, name, role }, actor) {
  if (STMT.adminByUsername.get(username)) {
    return { ok: false, status: 409, errors: [{ field: 'username', message: 'Username itu sudah dipakai. Pilih yang lain.' }] };
  }

  const password = buatSandi();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 12), name, role);

  log(actor, 'tambah-akun', 'admin', lastInsertRowid, `${username} (${role})`);
  return { ok: true, admin: akunById(lastInsertRowid), password };
}

function resetAdminPassword(id, actor) {
  const target = akunById(id);
  if (!target) return { ok: false, status: 404, errors: [{ field: '_', message: 'Akun tidak ditemukan.' }] };

  const password = buatSandi();
  STMT.changePassword.run(bcrypt.hashSync(password, 12), target.id);
  log(actor, 'reset-password', 'admin', target.id, target.username);
  return { ok: true, admin: target, password };
}

function removeAdmin(id, actor) {
  const target = akunById(id);
  if (!target) return { ok: false, status: 404, errors: [{ field: '_', message: 'Akun tidak ditemukan.' }] };

  // Larangan hapus-diri-sendiri sekaligus menjamin selalu tersisa satu ketua:
  // ketua terakhir tidak punya siapa pun lagi yang boleh menghapusnya.
  if (target.id === actor.id) {
    return { ok: false, status: 409, errors: [{ field: '_', message: 'Akun yang sedang dipakai tidak bisa dihapus sendiri.' }] };
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(target.id);
  log(actor, 'hapus-akun', 'admin', target.id, target.username);
  return { ok: true };
}

// --------------------------------------------------------------- statistik
function stats() {
  const byStatus = Object.fromEntries(
    db.prepare('SELECT payment_status, COUNT(*) AS n FROM participants GROUP BY payment_status')
      .all()
      .map((row) => [row.payment_status, row.n])
  );

  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

  const revenue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM participants WHERE payment_status = 'verified'")
    .get().n;

  const pendingValue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM participants WHERE payment_status IN ('pending', 'review')")
    .get().n;

  const byPackage = Object.fromEntries(
    db.prepare("SELECT package, COUNT(*) AS n FROM participants WHERE payment_status <> 'rejected' GROUP BY package")
      .all()
      .map((row) => [row.package, row.n])
  );

  const jerseyRows = Object.fromEntries(
    db.prepare(`
      SELECT jersey_size, COUNT(*) AS n FROM participants
       WHERE jersey_size IS NOT NULL AND payment_status <> 'rejected'
       GROUP BY jersey_size
    `).all().map((row) => [row.jersey_size, row.n])
  );

  const jersey = registrationService.jerseyAvailability().map((row) => ({
    ...row,
    ordered: jerseyRows[row.size] || 0,
  }));

  const daily = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS n
      FROM participants
     GROUP BY day ORDER BY day ASC
  `).all();

  const byGender = Object.fromEntries(
    db.prepare("SELECT gender, COUNT(*) AS n FROM participants WHERE payment_status <> 'rejected' GROUP BY gender")
      .all()
      .map((row) => [row.gender, row.n])
  );

  const topInstitutions = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(institution), ''), 'Tidak diisi') AS institution, COUNT(*) AS n
      FROM participants
     WHERE payment_status <> 'rejected'
     GROUP BY institution ORDER BY n DESC, institution ASC LIMIT 8
  `).all();

  return {
    total,
    pending: byStatus[PAYMENT_STATUS.PENDING] || 0,
    review: byStatus[PAYMENT_STATUS.REVIEW] || 0,
    verified: byStatus[PAYMENT_STATUS.VERIFIED] || 0,
    rejected: byStatus[PAYMENT_STATUS.REJECTED] || 0,
    revenue,
    pendingValue,
    byPackage: {
      lengkap: byPackage.lengkap || 0,
      hemat: byPackage.hemat || 0,
    },
    byGender: { L: byGender.L || 0, P: byGender.P || 0 },
    jersey,
    daily,
    topInstitutions,
  };
}

// ------------------------------------------------------------------ daftar
const SORTABLE = {
  created_desc: 'p.id DESC',
  created_asc: 'p.id ASC',
  name_asc: 'p.full_name COLLATE NOCASE ASC',
  name_desc: 'p.full_name COLLATE NOCASE DESC',
  bib_asc: 'CAST(p.bib_number AS INTEGER) ASC',
};

function listParticipants({ search = '', status = '', pkg = '', jersey = '', page = 1, perPage = 25, sort = 'created_desc' } = {}) {
  const where = [];
  const params = {};

  if (search) {
    where.push('(p.full_name LIKE @q OR p.reg_number LIKE @q OR p.phone LIKE @q OR p.institution LIKE @q OR p.bib_number LIKE @q)');
    params.q = `%${String(search).trim()}%`;
  }
  if (status && Object.values(PAYMENT_STATUS).includes(status)) {
    where.push('p.payment_status = @status');
    params.status = status;
  }
  if (pkg && PACKAGES[pkg]) {
    where.push('p.package = @pkg');
    params.pkg = pkg;
  }
  if (jersey && JERSEY_SIZES.includes(jersey)) {
    where.push('p.jersey_size = @jersey');
    params.jersey = jersey;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORTABLE[sort] || SORTABLE.created_desc;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM participants p ${whereSql}`).get(params).n;

  const safePerPage = Math.min(Math.max(Number(perPage) || 25, 5), 200);
  const totalPages = Math.max(Math.ceil(total / safePerPage), 1);
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  const rows = db.prepare(`
    SELECT p.*, a.name AS verifier_name
      FROM participants p
      LEFT JOIN admins a ON a.id = p.verified_by
      ${whereSql}
     ORDER BY ${orderSql}
     LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: safePerPage, offset: (safePage - 1) * safePerPage });

  return { rows, total, page: safePage, perPage: safePerPage, totalPages };
}

function getParticipant(id) {
  return db.prepare(`
    SELECT p.*, a.name AS verifier_name
      FROM participants p
      LEFT JOIN admins a ON a.id = p.verified_by
     WHERE p.id = ?
  `).get(Number(id));
}

// ------------------------------------------------------------------ aksi
function verify(id, admin, note) {
  const row = registrationService.findById(id);
  if (!row) return { ok: false, status: 404, errors: [{ field: '_', message: 'Peserta tidak ditemukan.' }] };
  if (row.payment_status === PAYMENT_STATUS.VERIFIED) {
    return { ok: false, status: 409, errors: [{ field: '_', message: 'Peserta ini sudah terverifikasi.' }] };
  }
  if (!row.payment_proof) {
    return {
      ok: false,
      status: 409,
      errors: [{ field: '_', message: 'Peserta belum mengunggah bukti pembayaran. Minta bukti dulu lewat WhatsApp.' }],
    };
  }

  const updated = db.transaction(() => {
    const nextBib = STMT.nextBib.get(BIB_START).next;
    STMT.verify.run(admin.id, String(nextBib), note || null, row.id);
    return getParticipant(row.id);
  })();

  log(admin, 'verifikasi', 'participant', row.reg_number, `BIB ${updated.bib_number}`);
  return { ok: true, participant: updated };
}

function reject(id, admin, note) {
  const row = registrationService.findById(id);
  if (!row) return { ok: false, status: 404, errors: [{ field: '_', message: 'Peserta tidak ditemukan.' }] };

  STMT.reject.run(note, row.id);
  log(admin, 'tolak-bukti', 'participant', row.reg_number, row.bib_number ? `${note} — BIB ${row.bib_number} dilepas` : note);
  return { ok: true, participant: getParticipant(row.id), bibDilepas: row.bib_number || null };
}

function remove(id, admin) {
  const row = registrationService.findById(id);
  if (!row) return { ok: false, status: 404, errors: [{ field: '_', message: 'Peserta tidak ditemukan.' }] };

  db.transaction(() => {
    if (row.jersey_size) registrationService.releaseJersey(row.jersey_size);
    STMT.remove.run(row.id);
  })();

  if (row.payment_proof) {
    fs.rm(path.join(env.paths.uploads, row.payment_proof), { force: true }, () => {});
  }

  log(admin, 'hapus-pendaftaran', 'participant', row.reg_number, row.full_name);
  return { ok: true };
}

function setJerseyQuota(quotas, admin) {
  const accepted = {};
  for (const size of JERSEY_SIZES) {
    if (quotas[size] === undefined) continue;
    const value = Number.parseInt(quotas[size], 10);
    if (Number.isNaN(value) || value < 0 || value > 100000) {
      return { ok: false, errors: [{ field: `jersey_${size}`, message: 'Kuota harus angka 0 sampai 100000.' }] };
    }
    accepted[size] = value;
  }

  const current = Object.fromEntries(registrationService.jerseyAvailability().map((r) => [r.size, r]));
  for (const [size, value] of Object.entries(accepted)) {
    if (value < current[size].used) {
      return {
        ok: false,
        errors: [{ field: `jersey_${size}`, message: `Ukuran ${size} sudah dipesan ${current[size].used} peserta. Kuota tidak bisa di bawah angka itu.` }],
      };
    }
  }

  db.transaction(() => {
    for (const [size, value] of Object.entries(accepted)) STMT.updateStockQuota.run(value, size);
  })();

  log(admin, 'ubah-kuota-jersey', 'jersey_stock', null, JSON.stringify(accepted));
  return { ok: true, jersey: registrationService.jerseyAvailability() };
}

module.exports = {
  authenticate,
  changePassword,
  buatSandi,
  log,
  recentActivity,
  listAdmins,
  createAdmin,
  resetAdminPassword,
  removeAdmin,
  stats,
  listParticipants,
  getParticipant,
  verify,
  reject,
  remove,
  setJerseyQuota,
};
