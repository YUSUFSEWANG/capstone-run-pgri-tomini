'use strict';

const crypto = require('crypto');
const db = require('../database/db');
const settingsService = require('./settings.service');
const {
  PACKAGES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABEL,
  JERSEY_SIZES,
} = require('../config/constants');
const { buildRegNumber, parseRegNumber } = require('../utils/identifier');
const { normalizePhone, rupiah } = require('../utils/format');

// ------------------------------------------------------------- pernyataan
const STMT = {
  insert: db.prepare(`
    INSERT INTO participants (
      reg_number, full_name, gender, birth_date, phone, email, address, institution,
      package, jersey_size, amount, unique_code,
      emergency_name, emergency_phone, blood_type, health_note, payment_status
    ) VALUES (
      @reg_number, @full_name, @gender, @birth_date, @phone, @email, @address, @institution,
      @package, @jersey_size, @amount, @unique_code,
      @emergency_name, @emergency_phone, @blood_type, @health_note, 'pending'
    )
  `),
  setRegNumber: db.prepare('UPDATE participants SET reg_number = ? WHERE id = ?'),
  byId: db.prepare('SELECT * FROM participants WHERE id = ?'),
  byRegNumber: db.prepare('SELECT * FROM participants WHERE reg_number = ?'),
  byPhone: db.prepare('SELECT * FROM participants WHERE phone = ? ORDER BY id ASC'),
  stockAll: db.prepare('SELECT size, quota, used FROM jersey_stock ORDER BY rowid'),
  stockOne: db.prepare('SELECT size, quota, used FROM jersey_stock WHERE size = ?'),
  stockTake: db.prepare('UPDATE jersey_stock SET used = used + 1 WHERE size = ? AND used < quota'),
  stockRelease: db.prepare('UPDATE jersey_stock SET used = MAX(used - 1, 0) WHERE size = ?'),
  usedCodes: db.prepare(
    "SELECT unique_code FROM participants WHERE unique_code > 0 AND payment_status IN ('pending', 'review')"
  ),
  attachProof: db.prepare(`
    UPDATE participants
       SET payment_proof = ?, proof_uploaded_at = datetime('now'),
           payment_status = 'review', admin_note = NULL
     WHERE id = ?
  `),
};

// ---------------------------------------------------------------- jersey
function jerseyAvailability() {
  return STMT.stockAll.all().map((row) => ({
    size: row.size,
    quota: row.quota,
    used: row.used,
    remaining: Math.max(row.quota - row.used, 0),
    available: row.quota > 0 && row.used < row.quota,
  }));
}

// ----------------------------------------------------------- kode unik
/**
 * Kode unik 1–499 ditambahkan ke nominal transfer supaya panitia bisa
 * mencocokkan mutasi rekening tanpa menebak. Hanya aktif jika disetel
 * di halaman Pengaturan.
 */
function pickUniqueCode() {
  const taken = new Set(STMT.usedCodes.all().map((row) => row.unique_code));
  if (taken.size >= 499) return 0; // sudah penuh, lanjut tanpa kode
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const code = crypto.randomInt(1, 500);
    if (!taken.has(code)) return code;
  }
  return 0;
}

// -------------------------------------------------------------- bentuk
/** Bentuk data yang aman dikirim ke halaman publik. */
function publicShape(row) {
  if (!row) return null;
  const pkg = PACKAGES[row.package];
  return {
    reg_number: row.reg_number,
    full_name: row.full_name,
    phone_masked: maskPhone(row.phone),
    institution: row.institution,
    package: row.package,
    package_label: pkg ? pkg.label : row.package,
    jersey_size: row.jersey_size,
    amount: row.amount,
    amount_label: rupiah(row.amount),
    unique_code: row.unique_code,
    payment_status: row.payment_status,
    status_label: PAYMENT_STATUS_LABEL[row.payment_status] || row.payment_status,
    has_proof: Boolean(row.payment_proof),
    proof_uploaded_at: row.proof_uploaded_at,
    bib_number: row.bib_number,
    admin_note: row.payment_status === PAYMENT_STATUS.REJECTED ? row.admin_note : null,
    created_at: row.created_at,
    verified_at: row.verified_at,
  };
}

function maskPhone(phone) {
  const normal = normalizePhone(phone) || String(phone || '');
  if (normal.length < 7) return normal;
  return normal.slice(0, 4) + '*'.repeat(normal.length - 7) + normal.slice(-3);
}

// -------------------------------------------------------------- pencarian
function findByRegNumber(regNumber) {
  const parsed = parseRegNumber(regNumber);
  return parsed ? STMT.byRegNumber.get(parsed) : null;
}

function findById(id) {
  return STMT.byId.get(Number(id));
}

/** Cari dengan nomor registrasi ATAU nomor WhatsApp. Kembalikan larik. */
function search(query) {
  const byReg = findByRegNumber(query);
  if (byReg) return [byReg];

  const phone = normalizePhone(query);
  if (phone) return STMT.byPhone.all(phone);

  return [];
}

// ----------------------------------------------------------- pendaftaran
/**
 * Simpan pendaftaran baru. Seluruh langkah (cek kuota, ambil stok jersey,
 * nomor registrasi) berjalan dalam satu transaksi supaya tidak ada peserta
 * yang dapat ukuran jersey yang sebenarnya sudah habis.
 */
function create(data) {
  const state = settingsService.registrationState();
  if (!state.open) {
    return { ok: false, status: 409, errors: [{ field: '_', message: state.reason }] };
  }

  const pkg = PACKAGES[data.package];
  const priceKey = data.package === 'lengkap' ? 'price_lengkap' : 'price_hemat';
  const basePrice = state.settings[priceKey] || pkg.price;

  if (pkg.withJersey) {
    const stock = STMT.stockOne.get(data.jersey_size);
    if (!stock || stock.quota <= 0 || stock.used >= stock.quota) {
      return {
        ok: false,
        status: 409,
        errors: [
          {
            field: 'jersey_size',
            message: `Ukuran ${data.jersey_size} sudah habis. Pilih ukuran lain atau ambil Paket Hemat.`,
          },
        ],
      };
    }
  }

  const uniqueCode = state.settings.unique_code_enabled ? pickUniqueCode() : 0;

  try {
    const result = db.transaction(() => {
      if (pkg.withJersey) {
        const taken = STMT.stockTake.run(data.jersey_size);
        if (taken.changes === 0) {
          const error = new Error('STOK_HABIS');
          error.code = 'STOK_HABIS';
          throw error;
        }
      }

      const info = STMT.insert.run({
        reg_number: `TMP-${crypto.randomUUID()}`,
        full_name: data.full_name,
        gender: data.gender,
        birth_date: data.birth_date,
        phone: data.phone,
        email: data.email,
        address: data.address,
        institution: data.institution,
        package: data.package,
        jersey_size: pkg.withJersey ? data.jersey_size : null,
        amount: basePrice + uniqueCode,
        unique_code: uniqueCode,
        emergency_name: data.emergency_name,
        emergency_phone: data.emergency_phone,
        blood_type: data.blood_type,
        health_note: data.health_note,
      });

      const id = Number(info.lastInsertRowid);
      const regNumber = buildRegNumber(id);
      STMT.setRegNumber.run(regNumber, id);
      return STMT.byId.get(id);
    })();

    return { ok: true, participant: result };
  } catch (error) {
    if (error.code === 'STOK_HABIS') {
      return {
        ok: false,
        status: 409,
        errors: [
          {
            field: 'jersey_size',
            message: `Ukuran ${data.jersey_size} baru saja habis diambil peserta lain. Pilih ukuran lain.`,
          },
        ],
      };
    }
    throw error;
  }
}

/** Catat berkas bukti bayar dan pindahkan status ke "menunggu verifikasi". */
function attachProof(participantId, storedFilename) {
  const row = STMT.byId.get(Number(participantId));
  if (!row) return { ok: false, status: 404, errors: [{ field: '_', message: 'Pendaftaran tidak ditemukan.' }] };

  if (row.payment_status === PAYMENT_STATUS.VERIFIED) {
    return {
      ok: false,
      status: 409,
      errors: [{ field: '_', message: 'Pembayaran sudah diverifikasi. Tidak perlu mengunggah bukti lagi.' }],
    };
  }

  STMT.attachProof.run(storedFilename, row.id);
  return { ok: true, participant: STMT.byId.get(row.id), previousProof: row.payment_proof };
}

/** Kembalikan jatah jersey (dipakai saat panitia membatalkan pendaftaran). */
function releaseJersey(size) {
  if (size && JERSEY_SIZES.includes(size)) STMT.stockRelease.run(size);
}

module.exports = {
  jerseyAvailability,
  publicShape,
  maskPhone,
  findByRegNumber,
  findById,
  search,
  create,
  attachProof,
  releaseJersey,
  STMT,
};
