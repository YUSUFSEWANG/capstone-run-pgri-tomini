'use strict';

const db = require('../database/db');

const SELECT_ALL = db.prepare('SELECT key, value FROM settings');
const UPSERT = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);

/** Daftar kunci yang boleh diubah dari dashboard, lengkap dengan cara membacanya. */
const SCHEMA = {
  registration_open: { type: 'enum', options: ['auto', 'open', 'closed'] },
  registration_start: { type: 'date' },
  registration_end: { type: 'date' },
  quota_total: { type: 'int', min: 0, max: 100000 },
  price_lengkap: { type: 'int', min: 0, max: 100000000 },
  price_hemat: { type: 'int', min: 0, max: 100000000 },
  unique_code_enabled: { type: 'bool' },
  announcement: { type: 'text', maxLength: 300 },
  whatsapp_group_url: { type: 'wa', maxLength: 300 },
};

/**
 * Terima hanya tautan WhatsApp yang sah. Isian ini ditampilkan sebagai tombol
 * kepada peserta, jadi alamat asing tidak boleh lolos — salah tempel satu kali
 * bisa mengirim ratusan peserta ke tempat yang bukan grup panitia.
 */
function bacaTautanWhatsApp(nilai) {
  let url;
  try {
    url = new URL(nilai);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const sah = host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com');
  return sah ? url.toString() : null;
}

function all() {
  const raw = Object.fromEntries(SELECT_ALL.all().map((row) => [row.key, row.value]));
  const out = {};
  for (const [key, rule] of Object.entries(SCHEMA)) {
    const value = raw[key];
    switch (rule.type) {
      case 'int':
        out[key] = Number.parseInt(value, 10) || 0;
        break;
      case 'bool':
        out[key] = value === 'true';
        break;
      default:
        out[key] = value ?? '';
    }
  }
  return out;
}

function update(patch) {
  const errors = [];
  const accepted = {};

  for (const [key, rawValue] of Object.entries(patch)) {
    const rule = SCHEMA[key];
    if (!rule) continue;
    const value = String(rawValue ?? '').trim();

    if (rule.type === 'enum' && !rule.options.includes(value)) {
      errors.push({ field: key, message: `Nilai harus salah satu dari: ${rule.options.join(', ')}.` });
      continue;
    }
    if (rule.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push({ field: key, message: 'Format tanggal harus YYYY-MM-DD.' });
      continue;
    }
    if (rule.type === 'int') {
      const num = Number.parseInt(value, 10);
      if (Number.isNaN(num) || num < rule.min || num > rule.max) {
        errors.push({ field: key, message: `Angka harus antara ${rule.min} dan ${rule.max}.` });
        continue;
      }
      accepted[key] = String(num);
      continue;
    }
    if (rule.type === 'bool') {
      accepted[key] = value === 'true' || value === '1' ? 'true' : 'false';
      continue;
    }
    if (rule.type === 'text' && value.length > rule.maxLength) {
      errors.push({ field: key, message: `Maksimal ${rule.maxLength} karakter.` });
      continue;
    }
    if (rule.type === 'wa') {
      if (value === '') {
        accepted[key] = '';
        continue;
      }
      const tautan = bacaTautanWhatsApp(value);
      if (!tautan) {
        errors.push({
          field: key,
          message: 'Harus tautan WhatsApp yang sah, contoh https://chat.whatsapp.com/XXXXXXXX. Kosongkan untuk menyembunyikan ajakan grup.',
        });
        continue;
      }
      accepted[key] = tautan;
      continue;
    }
    accepted[key] = value;
  }

  if (errors.length) return { ok: false, errors };

  db.transaction(() => {
    for (const [key, value] of Object.entries(accepted)) UPSERT.run(key, value);
  })();

  return { ok: true, settings: all() };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Status pendaftaran gabungan: saklar manual menang atas jadwal,
 * tapi kuota penuh selalu menutup pendaftaran.
 */
function registrationState() {
  const settings = all();
  const taken = db
    .prepare("SELECT COUNT(*) AS n FROM participants WHERE payment_status <> 'rejected'")
    .get().n;

  const quota = settings.quota_total;
  const remaining = quota > 0 ? Math.max(quota - taken, 0) : null;
  const today = todayIso();

  let open;
  let reason;

  if (settings.registration_open === 'closed') {
    open = false;
    reason = 'Pendaftaran ditutup oleh panitia.';
  } else if (quota > 0 && remaining === 0) {
    open = false;
    reason = 'Kuota peserta sudah penuh.';
  } else if (settings.registration_open === 'open') {
    open = true;
    reason = null;
  } else if (settings.registration_start && today < settings.registration_start) {
    open = false;
    reason = 'Pendaftaran belum dibuka.';
  } else if (settings.registration_end && today > settings.registration_end) {
    open = false;
    reason = 'Masa pendaftaran sudah berakhir.';
  } else {
    open = true;
    reason = null;
  }

  return { open, reason, quota, taken, remaining, settings };
}

module.exports = { all, update, registrationState, bacaTautanWhatsApp, SCHEMA };
